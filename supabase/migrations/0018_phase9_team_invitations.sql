-- 0018_phase9_team_invitations.sql
-- チームメンバー招待機能。イベント設定担当と請求書管理担当など、組織内で複数人が
-- それぞれ自分のログインで作業できるようにする。
--
-- ロールは既存のorganizer_memberships.role（owner/admin/staff）をそのまま使う。
-- 今回のスコープでは owner=全操作+チーム管理+課金、admin/staff=課金・チーム管理以外は
-- ownerと同等の操作が可能、という単純なルールに留める（機能エリア単位の細かい制限は将来対応）。

create table organizer_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizer_organizations(id),
  email text not null,
  role text not null check (role in ('admin', 'staff')),
  invited_by_user_id uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);

create index idx_organizer_invitations_org on organizer_invitations(organization_id);

alter table organizer_invitations enable row level security;

create policy "organizer admins can view own org invitations"
  on organizer_invitations for select
  using (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = organizer_invitations.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

create policy "organizer admins can create invitations for own org"
  on organizer_invitations for insert
  with check (
    invited_by_user_id = auth.uid()
    and exists (
      select 1 from organizer_memberships m
      where m.organization_id = organizer_invitations.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

create policy "organizer admins can revoke own org invitations"
  on organizer_invitations for update
  using (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = organizer_invitations.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  )
  with check (status = 'revoked');

-- 招待リンクを開いた本人が、対象の招待内容（組織名・ロール）をプレビューできるようにする。
-- トークンは十分に長いランダム値のため、既存のexhibitor向けリンクと同様「知っている＝閲覧可」とする。
create or replace function get_pending_invitation_for_token(p_token uuid)
returns table (organization_name text, role text, email text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  return query
    select oo.name, oi.role, oi.email, oi.expires_at
    from organizer_invitations oi
    join organizer_organizations oo on oo.id = oi.organization_id
    where oi.token = p_token and oi.status = 'pending';
end;
$$;

-- 招待を承諾し、その場でorganizer_membershipsを作成する。
-- ログイン中のメールアドレスと招待先メールアドレスの一致を必須とする。
create or replace function accept_organizer_invitation(p_token uuid)
returns organizer_memberships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation organizer_invitations;
  v_user_email text;
  v_membership organizer_memberships;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_invitation from organizer_invitations where token = p_token;
  if v_invitation.id is null then
    raise exception '招待が見つかりません。';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'この招待は既に使用済みか無効です。';
  end if;
  if v_invitation.expires_at < now() then
    raise exception 'この招待の有効期限が切れています。';
  end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null or lower(v_user_email) <> lower(v_invitation.email) then
    raise exception 'この招待は別のメールアドレス宛てです。招待されたメールアドレスでログインしてください。';
  end if;

  insert into organizer_memberships (organization_id, user_id, role, status)
  values (v_invitation.organization_id, auth.uid(), v_invitation.role, 'active')
  on conflict (organization_id, user_id) do update set role = excluded.role, status = 'active'
  returning * into v_membership;

  update organizer_invitations set status = 'accepted', accepted_at = now() where id = v_invitation.id;

  return v_membership;
end;
$$;

-- チームメンバーのロール変更・削除。owner/adminのみ実行可能で、
-- ・adminはownerに対して操作できない
-- ・組織に有効なownerが最低1人残ることを保証する
create or replace function update_organizer_member_role(p_membership_id uuid, p_new_role text, p_new_status text)
returns organizer_memberships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target organizer_memberships;
  v_actor_role text;
  v_active_owner_count int;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if p_new_role not in ('owner', 'admin', 'staff') then
    raise exception 'invalid role';
  end if;
  if p_new_status not in ('active', 'removed') then
    raise exception 'invalid status';
  end if;

  select * into v_target from organizer_memberships where id = p_membership_id;
  if v_target.id is null then
    raise exception 'メンバーが見つかりません。';
  end if;

  select role into v_actor_role from organizer_memberships
    where organization_id = v_target.organization_id and user_id = auth.uid() and status = 'active';
  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'この操作を行う権限がありません。';
  end if;

  if (v_target.role = 'owner' or p_new_role = 'owner') and v_actor_role <> 'owner' then
    raise exception 'オーナーの変更はオーナーのみが行えます。';
  end if;

  if v_target.role = 'owner' and v_target.status = 'active' and (p_new_role <> 'owner' or p_new_status <> 'active') then
    select count(*) into v_active_owner_count from organizer_memberships
      where organization_id = v_target.organization_id and role = 'owner' and status = 'active';
    if v_active_owner_count <= 1 then
      raise exception '組織には少なくとも1人のオーナーが必要です。';
    end if;
  end if;

  update organizer_memberships set role = p_new_role, status = p_new_status where id = p_membership_id
  returning * into v_target;

  return v_target;
end;
$$;

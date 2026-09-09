-- 0022_phase9_fix_invitation_self_demotion.sql
-- accept_organizer_invitation が ON CONFLICT DO UPDATE で既存メンバーシップの
-- role を無条件に上書きしてしまい、既にオーナーとして所属している組織に
-- 誤って（テスト目的等で）自分自身をスタッフとして招待・承諾すると、
-- オーナー権限が黙って失われる不具合があった（実際に発生・復旧済み）。
--
-- 修正：招待先の組織に既にアクティブなメンバーシップがある場合は承諾を拒否する。
-- ロール変更は必ず update_organizer_member_role（オーナー/管理者のみ実行可、
-- adminはownerを操作不可、最後のオーナーは保護）経由でのみ行う運用に統一する。
-- 過去に削除（status='removed'）されたメンバーの再招待は従来通り許可する。

create or replace function accept_organizer_invitation(p_token uuid)
returns organizer_memberships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation organizer_invitations;
  v_user_email text;
  v_existing organizer_memberships;
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

  select * into v_existing
  from organizer_memberships
  where organization_id = v_invitation.organization_id and user_id = auth.uid();

  if v_existing.id is not null and v_existing.status = 'active' then
    raise exception '既にこの組織のメンバーです。ロールの変更はオーナーまたは管理者にご依頼ください。';
  end if;

  insert into organizer_memberships (organization_id, user_id, role, status)
  values (v_invitation.organization_id, auth.uid(), v_invitation.role, 'active')
  on conflict (organization_id, user_id) do update set role = excluded.role, status = 'active'
  returning * into v_membership;

  update organizer_invitations set status = 'accepted', accepted_at = now() where id = v_invitation.id;

  return v_membership;
end;
$$;

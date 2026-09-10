-- 0025_phase10_bank_accounts.sql
-- 主催者の銀行口座情報。出展者向け請求書ページにこれまで固定文言のみだった
-- 振込先案内を、実データで表示できるようにする。
--
-- organizer_organizations に直列カラムを足すのではなく専用テーブルにする理由:
-- 「オーナー・管理者のみ閲覧可」という要件を満たすには行レベルのRLSが必要だが、
-- 全ユーザーが同じ authenticated ロールで動いているため、既存の
-- organizer_organizations（全アクティブメンバー閲覧可のRLS）に同居させると
-- 列単位でスタッフを締め出す手段がない。別テーブル＋別RLSで解決する。

create table organizer_bank_accounts (
  organization_id uuid primary key references organizer_organizations(id),
  bank_name text,
  branch_name text,
  account_type text,
  account_number text,
  account_holder_name text,
  updated_at timestamptz not null default now()
);

create trigger trg_organizer_bank_accounts_updated_at
  before update on organizer_bank_accounts
  for each row execute function set_updated_at();

alter table organizer_bank_accounts enable row level security;

create policy "owner or admin can select bank account"
  on organizer_bank_accounts for select
  using (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = organizer_bank_accounts.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

create policy "owner or admin can insert bank account"
  on organizer_bank_accounts for insert
  with check (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = organizer_bank_accounts.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

create policy "owner or admin can update bank account"
  on organizer_bank_accounts for update
  using (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = organizer_bank_accounts.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = organizer_bank_accounts.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

-- 出展者は organizer_memberships を持たないため上記RLSでは読めない。
-- 正当にアクセスできる請求書に紐づく銀行情報だけを、専用RPCで返す。
create or replace function get_invoice_bank_details(p_invoice_id uuid)
returns table (
  bank_name text,
  branch_name text,
  account_type text,
  account_number text,
  account_holder_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select e.organizer_organization_id into v_org_id
  from exhibitor_invoices inv
  join event_participations ep on ep.id = inv.event_participation_id
  join events e on e.id = ep.event_id
  where inv.id = p_invoice_id;

  if v_org_id is null then
    raise exception 'invoice not found';
  end if;

  if not (
    is_organizer_member(v_org_id)
    or exists (
      select 1 from exhibitor_invoices inv
      join event_participations ep on ep.id = inv.event_participation_id
      join exhibitor_memberships m on m.exhibitor_profile_id = ep.exhibitor_profile_id
      where inv.id = p_invoice_id and m.user_id = auth.uid() and m.status = 'active'
    )
  ) then
    raise exception 'not authorized';
  end if;

  return query
    select b.bank_name, b.branch_name, b.account_type, b.account_number, b.account_holder_name
    from organizer_bank_accounts b
    where b.organization_id = v_org_id;
end;
$$;

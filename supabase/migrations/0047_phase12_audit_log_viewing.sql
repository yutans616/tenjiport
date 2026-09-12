-- 0047_phase12_audit_log_viewing.sql
-- 0002で「閲覧ポリシーは別フェーズで追加」と保留されていたaudit_logsの閲覧権限を追加する。
-- docs/screens.md O18の仕様通り、閲覧は組織のオーナーに限定する
-- （admin/staffは日常業務の操作権限は持つが、全操作の監査履歴閲覧は与えない）。

create function is_organizer_owner(target_org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from organizer_memberships m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'owner'
  );
$$;

create policy "organizer owner can select own organization audit logs"
  on audit_logs for select
  using (organization_id is not null and is_organizer_owner(organization_id));

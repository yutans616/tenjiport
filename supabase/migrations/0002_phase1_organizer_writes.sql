-- 0002_phase1_organizer_writes.sql
-- Phase 1: 主催者組織作成・イベントCRUD・監査ログ記録のための書き込みポリシーを追加する。
--
-- 組織作成（organizer_organizations + organizer_memberships の同時挿入）は、
-- RLSのINSERT順序に依存しない安全な実装にするため、SECURITY DEFINER関数として実装する
-- （直接INSERTだと「組織を作った直後はまだメンバーではない」というチキンエッグ問題が生じるため）。

create or replace function create_organizer_organization(org_name text, org_billing_email text)
returns organizer_organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_org organizer_organizations;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into organizer_organizations (name, billing_email)
  values (org_name, org_billing_email)
  returning * into new_org;

  insert into organizer_memberships (organization_id, user_id, role, status)
  values (new_org.id, auth.uid(), 'owner', 'active');

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), new_org.id, 'create', 'organizer_organization', new_org.id, to_jsonb(new_org));

  return new_org;
end;
$$;

-- イベントCRUD（作成・更新は自組織のアクティブメンバーのみ）

create policy "organizer members can insert events in own organization"
  on events for insert
  with check (is_organizer_member(organizer_organization_id));

create policy "organizer members can update events in own organization"
  on events for update
  using (is_organizer_member(organizer_organization_id))
  with check (is_organizer_member(organizer_organization_id));

-- 監査ログ：自組織向けの操作ログを本人として記録することのみ許可（閲覧ポリシーは別フェーズで追加）

create policy "organizer members can insert audit logs for own organization"
  on audit_logs for insert
  with check (
    actor_user_id = auth.uid()
    and organization_id is not null
    and is_organizer_member(organization_id)
  );

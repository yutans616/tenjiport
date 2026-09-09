-- 0023_phase9_cancel_revision_request.sql
-- 修正依頼を誤って送った場合などに取り消せるようにする。
-- 対象の提出版を「提出済み」に戻し、直近の修正依頼にresolved_atを記録する
-- （このカラムはこれまで未使用だったが、ここで「解消済み」の意味で使う）。
-- 送信済みの通知メール自体は取り消せない点に注意。

create or replace function cancel_revision_request(p_submission_version_id uuid)
returns submission_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_participation_id uuid;
  v_version submission_versions;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select e.organizer_organization_id, ep.id into v_org_id, v_participation_id
  from submission_versions sv
  join event_participations ep on ep.id = sv.event_participation_id
  join events e on e.id = ep.event_id
  where sv.id = p_submission_version_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  select * into v_version from submission_versions where id = p_submission_version_id;
  if v_version.status <> 'revision_requested' then
    raise exception 'この提出は修正依頼中ではありません。';
  end if;

  update revision_requests
  set resolved_at = now()
  where submission_version_id = p_submission_version_id and resolved_at is null;

  update submission_versions set status = 'submitted' where id = p_submission_version_id
  returning * into v_version;

  update event_participations set status = 'submitted' where id = v_participation_id;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), v_org_id, 'cancel_revision_request', 'submission_version', p_submission_version_id, to_jsonb(v_version));

  return v_version;
end;
$$;

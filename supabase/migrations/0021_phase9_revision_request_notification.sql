-- 0021_phase9_revision_request_notification.sql
-- 修正依頼（revision_requests）は notification_deliveries への挿入が実装当初から
-- 抜けており、メール通知が一度も送られていなかった。request_revision で通知を積み、
-- get_pending_notification_batch がその文面（依頼コメント）も取得できるようにする。

create or replace function request_revision(p_submission_version_id uuid, p_comment text, p_target_field_keys text[])
returns revision_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_participation_id uuid;
  v_result revision_requests;
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

  insert into revision_requests (submission_version_id, requested_by_user_id, comment, target_field_keys)
  values (p_submission_version_id, auth.uid(), p_comment, coalesce(p_target_field_keys, '{}'))
  returning * into v_result;

  update submission_versions set status = 'revision_requested' where id = p_submission_version_id;
  update event_participations set status = 'revision_requested' where id = v_participation_id;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), v_org_id, 'request_revision', 'submission_version', p_submission_version_id, to_jsonb(v_result));

  insert into notification_deliveries (event_participation_id, channel, template_type, related_entity_type, related_entity_id, idempotency_key)
  values (
    v_participation_id,
    'email',
    'revision_request',
    'revision_request',
    v_result.id,
    'revision_request:' || v_result.id
  )
  on conflict (idempotency_key) do nothing;

  return v_result;
end;
$$;

create or replace function get_pending_notification_batch(p_limit integer default 20)
returns table (
  delivery_id uuid,
  event_participation_id uuid,
  template_type text,
  related_entity_type text,
  related_entity_id uuid,
  recipient_email text,
  public_form_token uuid,
  announcement_title text,
  announcement_body text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select
    nd.id::uuid,
    nd.event_participation_id::uuid,
    nd.template_type::text,
    nd.related_entity_type::text,
    nd.related_entity_id::uuid,
    u.email::text,
    e.public_form_token::uuid,
    av.title::text,
    coalesce(av.body, rr.comment)::text,
    nd.attempt_count::integer
  from notification_deliveries nd
  join event_participations ep on ep.id = nd.event_participation_id
  join events e on e.id = ep.event_id
  join exhibitor_memberships m on m.exhibitor_profile_id = ep.exhibitor_profile_id and m.role = 'owner' and m.status = 'active'
  join auth.users u on u.id = m.user_id
  left join announcement_versions av on av.id = nd.related_entity_id and nd.related_entity_type = 'announcement_version'
  left join revision_requests rr on rr.id = nd.related_entity_id and nd.related_entity_type = 'revision_request'
  where nd.status = 'pending'
  order by nd.created_at
  limit p_limit;
end;
$$;

revoke execute on function get_pending_notification_batch(integer) from public;
revoke execute on function get_pending_notification_batch(integer) from anon;
revoke execute on function get_pending_notification_batch(integer) from authenticated;
grant execute on function get_pending_notification_batch(integer) to service_role;

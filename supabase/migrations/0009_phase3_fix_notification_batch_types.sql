-- 0009_phase3_fix_notification_batch_types.sql
-- get_pending_notification_batch が「structure of query does not match function result type」
-- で失敗する不具合を修正（動作検証で発見）。auth.users.email 等の実際の列型が
-- RETURNS TABLE の宣言（text/uuid）と厳密に一致していなかったため、明示的にキャストする。

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
    av.body::text,
    nd.attempt_count::integer
  from notification_deliveries nd
  join event_participations ep on ep.id = nd.event_participation_id
  join events e on e.id = ep.event_id
  join exhibitor_memberships m on m.exhibitor_profile_id = ep.exhibitor_profile_id and m.role = 'owner' and m.status = 'active'
  join auth.users u on u.id = m.user_id
  left join announcement_versions av on av.id = nd.related_entity_id and nd.related_entity_type = 'announcement_version'
  where nd.status = 'pending'
  order by nd.created_at
  limit p_limit;
end;
$$;

revoke execute on function get_pending_notification_batch(integer) from public;
revoke execute on function get_pending_notification_batch(integer) from anon;
revoke execute on function get_pending_notification_batch(integer) from authenticated;
grant execute on function get_pending_notification_batch(integer) to service_role;

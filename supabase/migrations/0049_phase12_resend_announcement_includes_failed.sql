-- 0049_phase12_resend_announcement_includes_failed.sql
-- resend_announcement（未確認者への再通知）の対象抽出が status='sent' のみを見ており、
-- status='failed'（送信自体が失敗した配信）を一切拾っていなかった。つまり送信に
-- 失敗した出展者は「未確認者へ再通知」ボタンを押しても永久に対象に含まれず、
-- 再送する手段がUI上に存在しなかった（詳細はdocs/open-decisions.mdの
-- 通知失敗の詳細表示に関する項目を参照）。statusの条件にfailedを追加する。

create or replace function resend_announcement(p_announcement_version_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_created_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select e.organizer_organization_id into v_org_id
  from announcement_versions av
  join announcements a on a.id = av.announcement_id
  join events e on e.id = a.event_id
  where av.id = p_announcement_version_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  with candidates as (
    select distinct nd.event_participation_id
    from notification_deliveries nd
    where nd.related_entity_type = 'announcement_version'
      and nd.related_entity_id = p_announcement_version_id
      and nd.status in ('sent', 'failed')
      and not exists (
        select 1 from acknowledgements ack
        where ack.announcement_version_id = p_announcement_version_id
          and ack.event_participation_id = nd.event_participation_id
      )
  ),
  inserted as (
    insert into notification_deliveries (event_participation_id, channel, template_type, related_entity_type, related_entity_id, idempotency_key)
    select
      event_participation_id,
      'email',
      'announcement_resend',
      'announcement_version',
      p_announcement_version_id,
      'announcement_resend:' || p_announcement_version_id || ':' || event_participation_id || ':' || extract(epoch from now())::bigint
    from candidates
    on conflict (idempotency_key) do nothing
    returning 1
  )
  select count(*) into v_created_count from inserted;

  return v_created_count;
end;
$$;

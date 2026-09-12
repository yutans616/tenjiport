-- 0063_phase12_resend_revision_request.sql
-- 修正依頼（revision_request）の通知には、資料・請求書と違って再送手段が
-- 一切存在せず、送信失敗（Resend側の一時障害等）が起きると主催者側に
-- 気づく手段も再送手段も無いまま提出フローが止まっていた
-- （resend_announcement・resend_invoice_reminderと同じパターンで埋める）。
--
-- 既に再提出・取り消し等で対応済みの修正依頼を再送しても意味が無いため、
-- 参加のstatusがまだ'revision_requested'のままの場合のみ許可する。

create or replace function resend_revision_request(p_revision_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_participation_id uuid;
  v_participation_status text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select e.organizer_organization_id, ep.id, ep.status
  into v_org_id, v_participation_id, v_participation_status
  from revision_requests rr
  join submission_versions sv on sv.id = rr.submission_version_id
  join event_participations ep on ep.id = sv.event_participation_id
  join events e on e.id = ep.event_id
  where rr.id = p_revision_request_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  if v_participation_status <> 'revision_requested' then
    raise exception 'この修正依頼は既に対応済みか取り消されているため再送できません。';
  end if;

  insert into notification_deliveries (event_participation_id, channel, template_type, related_entity_type, related_entity_id, idempotency_key)
  values (
    v_participation_id,
    'email',
    'revision_request_resend',
    'revision_request',
    p_revision_request_id,
    'revision_request_resend:' || p_revision_request_id || ':' || extract(epoch from now())::bigint
  );
end;
$$;

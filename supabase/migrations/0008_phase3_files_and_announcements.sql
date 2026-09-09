-- 0008_phase3_files_and_announcements.sql
-- Phase 3: ファイル公開・自動通知・確認状況
--
-- 設計方針（実装しながらの見直し）：
--   - ファイルの読み書きはStorageのRLSではなく、アプリのService Role経由 + 独自の認可チェックに一本化する。
--     announcement_attachmentsの対象読者判定（audience_type/group_tags/participation_ids）をRLSポリシーだけで
--     表現すると複雑になりすぎるため、判定ロジックはSECURITY DEFINER関数に集約する
--     （get_my_announcements / can_access_file_asset）。
--   - audience_typeは 'all' と 'individual' のみを対象に実装する。'group' はスキーマ上は既に対応しているが、
--     event_participationsへのグループタグ付与UIがまだ無いため、実際に使えるようになってから対応する。
--   - 通知メールのリンクは、Supabase Admin APIで都度発行するマジックリンク（1回限り・短期）を埋め込む方式とし、
--     受信者・対象リソース・有効期限を署名検証してから表示する、という設計方針をそのまま実装する。

-- ファイルの元のファイル名（表示用。storage_keyはランダム化されたパスのため別に保持する）
alter table file_assets add column filename text;

-- ============================================================
-- Storageバケット（非公開）
-- ============================================================

insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

-- ============================================================
-- file_assets：主催者は自組織分を閲覧可能（アップロード自体はService Role経由）
-- ============================================================

create policy "organizer can select own organization file assets"
  on file_assets for select
  using (is_organizer_member(organizer_organization_id));

-- ============================================================
-- announcements / announcement_versions / announcement_attachments / announcement_audiences
-- 主催者側：自組織のイベントに対する読み書き
-- ============================================================

create policy "organizer can select announcements in own events"
  on announcements for select
  using (exists (select 1 from events e where e.id = announcements.event_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer can insert announcements in own events"
  on announcements for insert
  with check (exists (select 1 from events e where e.id = announcements.event_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer can update announcements in own events"
  on announcements for update
  using (exists (select 1 from events e where e.id = announcements.event_id and is_organizer_member(e.organizer_organization_id)))
  with check (exists (select 1 from events e where e.id = announcements.event_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer can select announcement versions in own events"
  on announcement_versions for select
  using (exists (select 1 from announcements a join events e on e.id = a.event_id where a.id = announcement_versions.announcement_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer can insert announcement versions in own events"
  on announcement_versions for insert
  with check (exists (select 1 from announcements a join events e on e.id = a.event_id where a.id = announcement_versions.announcement_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer can update draft announcement versions in own events"
  on announcement_versions for update
  using (
    status = 'draft'
    and exists (select 1 from announcements a join events e on e.id = a.event_id where a.id = announcement_versions.announcement_id and is_organizer_member(e.organizer_organization_id))
  )
  with check (
    exists (select 1 from announcements a join events e on e.id = a.event_id where a.id = announcement_versions.announcement_id and is_organizer_member(e.organizer_organization_id))
  );

create policy "organizer can select announcement attachments in own events"
  on announcement_attachments for select
  using (
    exists (
      select 1 from announcement_versions av
      join announcements a on a.id = av.announcement_id
      join events e on e.id = a.event_id
      where av.id = announcement_attachments.announcement_version_id and is_organizer_member(e.organizer_organization_id)
    )
  );

create policy "organizer can insert announcement attachments in own events"
  on announcement_attachments for insert
  with check (
    exists (
      select 1 from announcement_versions av
      join announcements a on a.id = av.announcement_id
      join events e on e.id = a.event_id
      where av.id = announcement_attachments.announcement_version_id and is_organizer_member(e.organizer_organization_id)
    )
  );

create policy "organizer can select announcement audiences in own events"
  on announcement_audiences for select
  using (
    exists (
      select 1 from announcement_versions av
      join announcements a on a.id = av.announcement_id
      join events e on e.id = a.event_id
      where av.id = announcement_audiences.announcement_version_id and is_organizer_member(e.organizer_organization_id)
    )
  );

create policy "organizer can insert announcement audiences in own events"
  on announcement_audiences for insert
  with check (
    exists (
      select 1 from announcement_versions av
      join announcements a on a.id = av.announcement_id
      join events e on e.id = a.event_id
      where av.id = announcement_audiences.announcement_version_id and is_organizer_member(e.organizer_organization_id)
    )
  );

-- ============================================================
-- 主催者：確認状況（誰が・いつ・どの版を確認したか）の閲覧
-- ============================================================

create policy "organizer can select acknowledgements in own events"
  on acknowledgements for select
  using (
    exists (
      select 1 from event_participations ep
      join events e on e.id = ep.event_id
      where ep.id = acknowledgements.event_participation_id and is_organizer_member(e.organizer_organization_id)
    )
  );

-- ============================================================
-- 主催者：通知配信状況の閲覧（送信失敗の可視化用）
-- ============================================================

create policy "organizer can select notification deliveries in own events"
  on notification_deliveries for select
  using (
    exists (
      select 1 from event_participations ep
      join events e on e.id = ep.event_id
      where ep.id = notification_deliveries.event_participation_id and is_organizer_member(e.organizer_organization_id)
    )
  );

create policy "exhibitor can select own notification deliveries"
  on notification_deliveries for select
  using (
    exists (
      select 1 from event_participations ep
      where ep.id = notification_deliveries.event_participation_id and is_exhibitor_member(ep.exhibitor_profile_id)
    )
  );

-- ============================================================
-- 主催者：公開処理（版のstatus更新 + 対象出展者ぶんの通知配信ジョブを冪等に作成）
-- ============================================================

create or replace function publish_announcement(p_announcement_version_id uuid)
returns announcement_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_event_id uuid;
  v_announcement_id uuid;
  v_result announcement_versions;
  v_audience record;
  v_target_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select e.organizer_organization_id, a.event_id, av.announcement_id
    into v_org_id, v_event_id, v_announcement_id
  from announcement_versions av
  join announcements a on a.id = av.announcement_id
  join events e on e.id = a.event_id
  where av.id = p_announcement_version_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  select * into v_audience from announcement_audiences where announcement_version_id = p_announcement_version_id;
  if v_audience.id is null then
    raise exception 'audience is not set';
  end if;

  if v_audience.audience_type = 'all' then
    select array_agg(id) into v_target_ids
    from event_participations
    where event_id = v_event_id and status <> 'merged' and status <> 'cancelled';
  elsif v_audience.audience_type = 'individual' then
    v_target_ids := v_audience.event_participation_ids;
  else
    raise exception 'unsupported audience_type: %', v_audience.audience_type;
  end if;

  update announcement_versions
  set status = 'published', published_at = now(), published_by_user_id = auth.uid()
  where id = p_announcement_version_id
  returning * into v_result;

  update announcements set current_version_id = p_announcement_version_id where id = v_announcement_id;

  insert into notification_deliveries (event_participation_id, channel, template_type, related_entity_type, related_entity_id, idempotency_key)
  select
    ep_id,
    'email',
    'announcement_publish',
    'announcement_version',
    p_announcement_version_id,
    'announcement_publish:' || p_announcement_version_id || ':' || ep_id
  from unnest(v_target_ids) as ep_id
  on conflict (idempotency_key) do nothing;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), v_org_id, 'publish', 'announcement_version', p_announcement_version_id, to_jsonb(v_result));

  return v_result;
end;
$$;

-- 未確認の出展者だけに再通知する（意図的な再通知として別のidempotency_keyで記録する）
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

  with unacknowledged as (
    select nd.event_participation_id
    from notification_deliveries nd
    where nd.related_entity_type = 'announcement_version'
      and nd.related_entity_id = p_announcement_version_id
      and nd.status = 'sent'
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
    from unacknowledged
    returning 1
  )
  select count(*) into v_created_count from inserted;

  return v_created_count;
end;
$$;

-- ============================================================
-- 出展者：自分に公開されている資料の一覧取得・確認
-- ============================================================

create or replace function get_my_announcements(p_event_id uuid)
returns table (
  announcement_version_id uuid,
  title text,
  body text,
  published_at timestamptz,
  ack_required boolean,
  acknowledged_at timestamptz,
  attachments jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_participation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select ep.id into v_participation_id
  from event_participations ep
  join exhibitor_memberships m on m.exhibitor_profile_id = ep.exhibitor_profile_id
  where ep.event_id = p_event_id and m.user_id = auth.uid() and m.status = 'active'
  limit 1;

  if v_participation_id is null then
    return;
  end if;

  return query
  select
    av.id,
    av.title,
    av.body,
    av.published_at,
    a.ack_required,
    ack.acknowledged_at,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('file_asset_id', fa.id, 'content_type', fa.content_type))
        from announcement_attachments att
        join file_assets fa on fa.id = att.file_asset_id
        where att.announcement_version_id = av.id
      ),
      '[]'::jsonb
    )
  from announcement_versions av
  join announcements a on a.id = av.announcement_id
  join announcement_audiences aud on aud.announcement_version_id = av.id
  left join acknowledgements ack
    on ack.announcement_version_id = av.id and ack.event_participation_id = v_participation_id
  where a.event_id = p_event_id
    and av.status = 'published'
    and (
      aud.audience_type = 'all'
      or (aud.audience_type = 'individual' and v_participation_id = any (aud.event_participation_ids))
    )
  order by av.published_at desc;
end;
$$;

create or replace function acknowledge_announcement(p_announcement_version_id uuid)
returns acknowledgements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
  v_participation_id uuid;
  v_result acknowledgements;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select a.event_id into v_event_id
  from announcement_versions av
  join announcements a on a.id = av.announcement_id
  where av.id = p_announcement_version_id and av.status = 'published';

  if v_event_id is null then
    raise exception 'announcement not found';
  end if;

  select ep.id into v_participation_id
  from event_participations ep
  join exhibitor_memberships m on m.exhibitor_profile_id = ep.exhibitor_profile_id
  where ep.event_id = v_event_id and m.user_id = auth.uid() and m.status = 'active'
  limit 1;

  if v_participation_id is null then
    raise exception 'not a participant of this event';
  end if;

  insert into acknowledgements (announcement_version_id, event_participation_id, acknowledged_by_user_id)
  values (p_announcement_version_id, v_participation_id, auth.uid())
  on conflict (announcement_version_id, event_participation_id, acknowledged_by_user_id) do nothing
  returning * into v_result;

  if v_result.id is null then
    select * into v_result from acknowledgements
    where announcement_version_id = p_announcement_version_id
      and event_participation_id = v_participation_id
      and acknowledged_by_user_id = auth.uid();
  end if;

  return v_result;
end;
$$;

-- ============================================================
-- 通知処理バッチ（受信者メールアドレスを扱うため service_role 専用）
-- ============================================================

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
    nd.id,
    nd.event_participation_id,
    nd.template_type,
    nd.related_entity_type,
    nd.related_entity_id,
    u.email,
    e.public_form_token,
    av.title,
    av.body,
    nd.attempt_count
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

create or replace function mark_notification_sent(p_delivery_id uuid, p_provider_message_id text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update notification_deliveries
  set status = 'sent', provider_message_id = p_provider_message_id, attempt_count = attempt_count + 1, last_attempted_at = now()
  where id = p_delivery_id;
$$;

create or replace function mark_notification_failed(p_delivery_id uuid, p_error_message text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update notification_deliveries
  set status = 'failed', error_message = p_error_message, attempt_count = attempt_count + 1, last_attempted_at = now()
  where id = p_delivery_id;
$$;

revoke execute on function mark_notification_sent(uuid, text) from public, anon, authenticated;
revoke execute on function mark_notification_failed(uuid, text) from public, anon, authenticated;
grant execute on function mark_notification_sent(uuid, text) to service_role;
grant execute on function mark_notification_failed(uuid, text) to service_role;

-- ファイルへのアクセス可否判定（主催者=自組織、出展者=公開済み資料の対象者）
create or replace function can_access_file_asset(p_file_asset_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select organizer_organization_id into v_org_id from file_assets where id = p_file_asset_id;
  if v_org_id is not null and is_organizer_member(v_org_id) then
    return true;
  end if;

  return exists (
    select 1
    from announcement_attachments att
    join announcement_versions av on av.id = att.announcement_version_id
    join announcements a on a.id = av.announcement_id
    join announcement_audiences aud on aud.announcement_version_id = av.id
    join event_participations ep on ep.event_id = a.event_id
    join exhibitor_memberships m on m.exhibitor_profile_id = ep.exhibitor_profile_id
    where att.file_asset_id = p_file_asset_id
      and av.status = 'published'
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (
        aud.audience_type = 'all'
        or (aud.audience_type = 'individual' and ep.id = any (aud.event_participation_ids))
      )
  );
end;
$$;

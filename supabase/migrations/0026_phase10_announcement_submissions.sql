-- 0026_phase10_announcement_submissions.sql
-- 資料（announcements）を双方向化する。これまで主催者→出展者の一方向
-- （添付ファイル配布＋確認ボタン）だったが、出展者がファイルをアップロードして
-- 提出できるようにする（ロゴ・車両証・電気系申請など、出展者一覧や資料タブから
-- 個別に依頼する運用を想定）。

alter table announcements add column requires_submission boolean not null default false;

create table announcement_submissions (
  id uuid primary key default gen_random_uuid(),
  announcement_version_id uuid not null references announcement_versions(id),
  event_participation_id uuid not null references event_participations(id),
  file_asset_id uuid not null references file_assets(id),
  submitted_by_user_id uuid not null references auth.users(id),
  submitted_at timestamptz not null default now()
);

create index idx_announcement_submissions_version on announcement_submissions(announcement_version_id);
create index idx_announcement_submissions_participation on announcement_submissions(event_participation_id);

alter table announcement_submissions enable row level security;

create policy "organizer can select announcement submissions in own events"
  on announcement_submissions for select
  using (
    exists (
      select 1 from announcement_versions av
      join announcements a on a.id = av.announcement_id
      join events e on e.id = a.event_id
      where av.id = announcement_submissions.announcement_version_id
        and is_organizer_member(e.organizer_organization_id)
    )
  );

create policy "exhibitor can select own announcement submissions"
  on announcement_submissions for select
  using (
    exists (
      select 1 from event_participations ep
      where ep.id = announcement_submissions.event_participation_id
        and is_exhibitor_member(ep.exhibitor_profile_id)
    )
  );

create policy "exhibitor can insert own announcement submissions"
  on announcement_submissions for insert
  with check (
    exists (
      select 1 from event_participations ep
      where ep.id = announcement_submissions.event_participation_id
        and is_exhibitor_member(ep.exhibitor_profile_id)
    )
    and exists (
      select 1 from announcement_versions av
      join announcements a on a.id = av.announcement_id
      join announcement_audiences aud on aud.announcement_version_id = av.id
      where av.id = announcement_submissions.announcement_version_id
        and av.status = 'published'
        and a.requires_submission = true
        and (
          aud.audience_type = 'all'
          or (aud.audience_type = 'individual' and announcement_submissions.event_participation_id = any (aud.event_participation_ids))
        )
    )
  );

create policy "exhibitor can delete own announcement submissions"
  on announcement_submissions for delete
  using (
    exists (
      select 1 from event_participations ep
      where ep.id = announcement_submissions.event_participation_id
        and is_exhibitor_member(ep.exhibitor_profile_id)
    )
  );

-- get_my_announcements に requires_submission と自分の提出済みファイル一覧を追加する。
-- 戻り値の列構成が変わるため、create or replaceでは変更できない（42P13）。先にdropする。
drop function if exists get_my_announcements(uuid);

create function get_my_announcements(p_event_id uuid)
returns table (
  announcement_version_id uuid,
  title text,
  body text,
  published_at timestamptz,
  ack_required boolean,
  acknowledged_at timestamptz,
  attachments jsonb,
  requires_submission boolean,
  submissions jsonb
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
        select jsonb_agg(jsonb_build_object('file_asset_id', fa.id, 'filename', fa.filename, 'content_type', fa.content_type))
        from announcement_attachments att
        join file_assets fa on fa.id = att.file_asset_id
        where att.announcement_version_id = av.id
      ),
      '[]'::jsonb
    ),
    a.requires_submission,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('id', sub.id, 'file_asset_id', fa2.id, 'filename', fa2.filename, 'submitted_at', sub.submitted_at))
        from announcement_submissions sub
        join file_assets fa2 on fa2.id = sub.file_asset_id
        where sub.announcement_version_id = av.id and sub.event_participation_id = v_participation_id
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

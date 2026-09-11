-- 0042_phase12_announcement_submission_due_date.sql
-- 資料提出依頼（announcements.requires_submission）に提出期限を追加する。
-- ack_required・requires_submissionと同じく「依頼」自体の属性のためannouncements側に置く
-- （announcement_versionsは現状version_number=1しか作られない運用だが、将来複数版が
-- できても、期限は依頼そのものの属性として一貫させる）。

alter table announcements add column submission_due_date date;

-- get_my_announcements：出展者側に提出期限も返すようにする（列構成が変わるためdrop必須）。
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
  submission_due_date date,
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
  order by ep.created_at asc
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
    a.submission_due_date,
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

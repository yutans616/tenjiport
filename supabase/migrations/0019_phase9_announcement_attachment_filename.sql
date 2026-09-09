-- 0019_phase9_announcement_attachment_filename.sql
-- get_my_announcements が返す添付ファイル情報に filename を追加する。
-- これまでcontent_typeしか返しておらず、出展者側の画面で「ダウンロード（application/pdf）」
-- のようにMIMEタイプがそのまま表示されてしまっていた。

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
        select jsonb_agg(jsonb_build_object('file_asset_id', fa.id, 'filename', fa.filename, 'content_type', fa.content_type))
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

-- 0027_phase10_fix_submission_insert_policy.sql
-- 0026で追加したannouncement_submissionsのINSERTポリシーは、announcement_versions/
-- announcements/announcement_audiencesをexists()内でjoinしていたが、出展者はこれら
-- のテーブルに対するSELECTポリシーを一切持たない（出展者はget_my_announcements経由
-- でのみ資料を読む設計のため）。RLSのwith check内のサブクエリは実行ロールのRLSに
-- 従うため、この3テーブルへのjoinは出展者からは常に0件になり、正当な提出が全件
-- 403で拒否されていた（実データ検証で発覚）。can_access_file_asset等と同じ
-- SECURITY DEFINER関数に判定ロジックを移し、RLSをバイパスして正しく判定する。

create or replace function can_submit_announcement(p_announcement_version_id uuid, p_event_participation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  select exists (
    select 1
    from announcement_versions av
    join announcements a on a.id = av.announcement_id
    join announcement_audiences aud on aud.announcement_version_id = av.id
    join event_participations ep on ep.id = p_event_participation_id
    where av.id = p_announcement_version_id
      and av.status = 'published'
      and a.requires_submission = true
      and is_exhibitor_member(ep.exhibitor_profile_id)
      and (
        aud.audience_type = 'all'
        or (aud.audience_type = 'individual' and p_event_participation_id = any (aud.event_participation_ids))
      )
  ) into v_ok;

  return coalesce(v_ok, false);
end;
$$;

drop policy "exhibitor can insert own announcement submissions" on announcement_submissions;

create policy "exhibitor can insert own announcement submissions"
  on announcement_submissions for insert
  with check (
    can_submit_announcement(announcement_submissions.announcement_version_id, announcement_submissions.event_participation_id)
  );

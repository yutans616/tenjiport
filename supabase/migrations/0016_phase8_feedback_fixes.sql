-- 0016_phase8_feedback_fixes.sql
-- ローンチ後フィードバック対応:
--   1. 「Webサイト・SNS」を個別項目（Webサイト/Instagram/Facebook/X/YouTube）に分割。
--      SNS各項目は既存の未使用列 exhibitor_profiles.sns_links (jsonb) に統合して同期する。
--   2. 資料の添付ファイルを主催者が削除できるよう、下書き状態のみ許可するDELETEポリシーを追加。

create or replace function submit_current_version(p_submission_version_id uuid, p_answers jsonb)
returns submission_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version submission_versions;
  v_participation event_participations;
  v_profile exhibitor_profiles;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select sv.* into v_version from submission_versions sv where sv.id = p_submission_version_id;
  if v_version.id is null then
    raise exception 'submission version not found';
  end if;

  select ep.* into v_participation from event_participations ep where ep.id = v_version.event_participation_id;

  if not exists (
    select 1 from exhibitor_memberships m
    where m.exhibitor_profile_id = v_participation.exhibitor_profile_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) then
    raise exception 'not authorized';
  end if;

  if v_version.status <> 'draft' then
    raise exception 'only a draft version can be submitted';
  end if;

  update submission_versions
  set data_snapshot_json = p_answers, status = 'submitted', submitted_at = now()
  where id = v_version.id
  returning * into v_version;

  update event_participations
  set
    status = 'submitted',
    first_submitted_at = coalesce(first_submitted_at, now()),
    is_billable = true
  where id = v_participation.id
  returning * into v_participation;

  -- ブランド共通情報の予約キーを exhibitor_profiles へ反映（回答に含まれる項目のみ）。
  -- sns_instagram/sns_facebook/sns_x/sns_youtube は sns_links(jsonb) にまとめて統合する。
  update exhibitor_profiles set
    brand_name = coalesce(nullif(p_answers->>'brand_name', ''), brand_name),
    company_name = coalesce(nullif(p_answers->>'company_name', ''), company_name),
    default_contact_name = coalesce(nullif(p_answers->>'default_contact_name', ''), default_contact_name),
    default_contact_email = coalesce(nullif(p_answers->>'default_contact_email', ''), default_contact_email),
    default_contact_phone = coalesce(nullif(p_answers->>'default_contact_phone', ''), default_contact_phone),
    website = coalesce(nullif(p_answers->>'website', ''), website),
    description = coalesce(nullif(p_answers->>'description', ''), description),
    sns_links = coalesce(sns_links, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'instagram', nullif(p_answers->>'sns_instagram', ''),
        'facebook', nullif(p_answers->>'sns_facebook', ''),
        'x', nullif(p_answers->>'sns_x', ''),
        'youtube', nullif(p_answers->>'sns_youtube', '')
      )),
    updated_at = now()
  where id = v_participation.exhibitor_profile_id
  returning * into v_profile;

  -- 簡易な重複検知：同一イベント内で、連絡先メールが一致する別ブランドの参加を突き合わせる
  insert into duplicate_flags (event_id, participation_id_a, participation_id_b, match_reason)
  select v_participation.event_id, v_participation.id, other_ep.id, 'email'
  from event_participations other_ep
  join exhibitor_profiles other_profile on other_profile.id = other_ep.exhibitor_profile_id
  where other_ep.event_id = v_participation.event_id
    and other_ep.exhibitor_profile_id <> v_participation.exhibitor_profile_id
    and other_ep.status <> 'merged'
    and v_profile.default_contact_email is not null
    and other_profile.default_contact_email = v_profile.default_contact_email
    and not exists (
      select 1 from duplicate_flags df
      where df.event_id = v_participation.event_id
        and (
          (df.participation_id_a = v_participation.id and df.participation_id_b = other_ep.id)
          or (df.participation_id_a = other_ep.id and df.participation_id_b = v_participation.id)
        )
    );

  return v_version;
end;
$$;

-- 資料が下書きの間だけ、主催者は添付ファイルを削除できる（公開後は監査性のため削除不可）。
create policy "organizer can delete draft announcement attachments in own events"
  on announcement_attachments for delete
  using (
    exists (
      select 1 from announcement_versions av
      join announcements a on a.id = av.announcement_id
      join events e on e.id = a.event_id
      where av.id = announcement_attachments.announcement_version_id
        and av.status = 'draft'
        and is_organizer_member(e.organizer_organization_id)
    )
  );

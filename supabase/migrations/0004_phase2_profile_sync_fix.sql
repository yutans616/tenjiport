-- 0004_phase2_profile_sync_fix.sql
-- 提出内容から exhibitor_profiles（ブランド共通情報）へ同期する処理が抜けていた不具合の修正。
--
-- 経緯：フォーム項目は主催者が自由にkeyを設定できる汎用設計のため、「どの項目がブランド共通情報か」
-- を機械的に判定できない。ここでは data-model.md のブランド共通情報の代表項目に対応する
-- 予約済みキー（brand_name, company_name, default_contact_name, default_contact_email,
-- default_contact_phone, website, description）を採用し、提出時にこれらのキーが
-- 回答に含まれていれば exhibitor_profiles へ反映する規約とする。
-- これにより：
--   - 主催者の出展者一覧・詳細に実際のブランド名等が表示される
--   - 重複検知（メール一致）が default_contact_email を根拠に機能するようになる

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

  -- ブランド共通情報の予約キーを exhibitor_profiles へ反映（回答に含まれる項目のみ）
  update exhibitor_profiles set
    brand_name = coalesce(nullif(p_answers->>'brand_name', ''), brand_name),
    company_name = coalesce(nullif(p_answers->>'company_name', ''), company_name),
    default_contact_name = coalesce(nullif(p_answers->>'default_contact_name', ''), default_contact_name),
    default_contact_email = coalesce(nullif(p_answers->>'default_contact_email', ''), default_contact_email),
    default_contact_phone = coalesce(nullif(p_answers->>'default_contact_phone', ''), default_contact_phone),
    website = coalesce(nullif(p_answers->>'website', ''), website),
    description = coalesce(nullif(p_answers->>'description', ''), description),
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

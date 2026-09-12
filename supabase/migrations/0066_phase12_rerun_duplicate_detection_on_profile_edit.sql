-- 0066_phase12_rerun_duplicate_detection_on_profile_edit.sql
-- update_exhibitor_profile（ブランドプロフィール編集）は、submit_current_versionと違い
-- 重複検知（duplicate_flags）を一切再実行していなかった。会社名やメールアドレスを
-- 編集で変更した場合、既存の重複（あるいは編集によって新たに一致するようになった重複）が
-- 検知されないまま残ってしまう。
--
-- 1つのexhibitor_profileは複数イベントの複数event_participationsに紐づき得るため、
-- submit_current_versionのようにevent_id一つに絞れない。このプロフィールが持つ、
-- キャンセル・統合済みでない全参加それぞれについて、同じイベント内の他の参加者との
-- 重複判定をsubmit_current_versionと同一ロジックで再実行する。

create or replace function update_exhibitor_profile(
  p_exhibitor_profile_id uuid,
  p_brand_name text,
  p_company_name text,
  p_address text,
  p_website text,
  p_default_contact_name text,
  p_default_contact_email text,
  p_default_contact_phone text,
  p_description text
)
returns exhibitor_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result exhibitor_profiles;
  v_participation event_participations;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not is_exhibitor_member(p_exhibitor_profile_id) then
    raise exception 'not authorized';
  end if;
  if p_brand_name is null or length(trim(p_brand_name)) = 0 then
    raise exception 'brand name is required';
  end if;
  if p_company_name is null or length(trim(p_company_name)) = 0 then
    raise exception 'company name is required';
  end if;

  update exhibitor_profiles
  set brand_name = p_brand_name,
      company_name = p_company_name,
      address = p_address,
      website = p_website,
      default_contact_name = p_default_contact_name,
      default_contact_email = p_default_contact_email,
      default_contact_phone = p_default_contact_phone,
      description = p_description,
      updated_at = now()
  where id = p_exhibitor_profile_id
  returning * into v_result;

  for v_participation in
    select * from event_participations
    where exhibitor_profile_id = p_exhibitor_profile_id
      and status not in ('cancelled', 'merged')
  loop
    insert into duplicate_flags (event_id, participation_id_a, participation_id_b, match_reason)
    select v_participation.event_id, v_participation.id, other_ep.id, 'email'
    from event_participations other_ep
    join exhibitor_profiles other_profile on other_profile.id = other_ep.exhibitor_profile_id
    where other_ep.event_id = v_participation.event_id
      and other_ep.exhibitor_profile_id <> v_participation.exhibitor_profile_id
      and other_ep.status <> 'merged'
      and v_result.default_contact_email is not null
      and other_profile.default_contact_email = v_result.default_contact_email
      and not exists (
        select 1 from duplicate_flags df
        where df.event_id = v_participation.event_id
          and (
            (df.participation_id_a = v_participation.id and df.participation_id_b = other_ep.id)
            or (df.participation_id_a = other_ep.id and df.participation_id_b = v_participation.id)
          )
      );

    insert into duplicate_flags (event_id, participation_id_a, participation_id_b, match_reason)
    select v_participation.event_id, v_participation.id, other_ep.id, 'company_name_similarity'
    from event_participations other_ep
    join exhibitor_profiles other_profile on other_profile.id = other_ep.exhibitor_profile_id
    where other_ep.event_id = v_participation.event_id
      and other_ep.exhibitor_profile_id <> v_participation.exhibitor_profile_id
      and other_ep.status <> 'merged'
      and normalize_company_name_for_matching(v_result.company_name) is not null
      and normalize_company_name_for_matching(other_profile.company_name) is not null
      and similarity(
        normalize_company_name_for_matching(v_result.company_name),
        normalize_company_name_for_matching(other_profile.company_name)
      ) >= 0.4
      and not exists (
        select 1 from duplicate_flags df
        where df.event_id = v_participation.event_id
          and (
            (df.participation_id_a = v_participation.id and df.participation_id_b = other_ep.id)
            or (df.participation_id_a = other_ep.id and df.participation_id_b = v_participation.id)
          )
      );
  end loop;

  return v_result;
end;
$$;

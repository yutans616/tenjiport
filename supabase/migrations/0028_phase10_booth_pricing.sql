-- 0028_phase10_booth_pricing.sql
-- コマ（出展枠）選択と料金のフォーム連携。専用カタログテーブルは作らず、既存の
-- single_select/multi_selectフィールドのoptions_json.choicesを拡張する
-- （後方互換・追加のみ：既存の string[] はそのまま動く。新規は
--  {label, price_yen, capacity}[] を1フィールドにつき統一で使う）。

alter table event_participations add column resolved_price_yen integer;

-- submit_current_version（0016版）に、価格付き選択肢の合計金額計算と
-- 在庫上限チェックを追加する。在庫チェックは同時提出の競合を避けるため
-- アドバイザリーロックでこの選択肢キーを直列化してから数える
-- （実データでの検証範囲で十分な粒度。行ロックまでは行わない）。
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
  v_resolved_price_yen integer := 0;
  v_has_priced_fields boolean := false;
  v_field record;
  v_selected_labels text[];
  v_selected_label text;
  v_choice jsonb;
  v_capacity integer;
  v_current_count integer;
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

  -- 価格・在庫付きの選択肢を持つフィールドを走査し、回答から金額を合算・在庫を検証する。
  for v_field in
    select ff.key, ff.type, ff.options_json
    from form_fields ff
    join form_sections fs on fs.id = ff.form_section_id
    where fs.form_id = v_version.form_id
      and ff.type in ('single_select', 'multi_select')
      and jsonb_typeof(ff.options_json -> 'choices') = 'array'
      and exists (
        select 1 from jsonb_array_elements(ff.options_json -> 'choices') c
        where jsonb_typeof(c) = 'object'
      )
  loop
    v_has_priced_fields := true;

    if v_field.type = 'single_select' then
      v_selected_labels := case
        when coalesce(p_answers ->> v_field.key, '') <> '' then array[p_answers ->> v_field.key]
        else array[]::text[]
      end;
    else
      select coalesce(array_agg(distinct value), array[]::text[])
        into v_selected_labels
        from jsonb_array_elements_text(coalesce(p_answers -> v_field.key, '[]'::jsonb)) as value;
    end if;

    foreach v_selected_label in array v_selected_labels loop
      select c into v_choice
      from jsonb_array_elements(v_field.options_json -> 'choices') c
      where jsonb_typeof(c) = 'object' and (c ->> 'label') = v_selected_label
      limit 1;

      if v_choice is not null then
        v_resolved_price_yen := v_resolved_price_yen + coalesce((v_choice ->> 'price_yen')::integer, 0);
        v_capacity := nullif(v_choice ->> 'capacity', '')::integer;

        if v_capacity is not null then
          perform pg_advisory_xact_lock(
            hashtextextended(v_version.form_id::text || ':' || v_field.key || ':' || v_selected_label, 0)
          );

          select count(*) into v_current_count
          from event_participations ep2
          where ep2.event_id = v_participation.event_id
            and ep2.id <> v_participation.id
            and ep2.status not in ('cancelled', 'merged')
            and exists (
              select 1 from submission_versions sv2
              where sv2.event_participation_id = ep2.id
                and sv2.status <> 'draft'
                and sv2.version_number = (
                  select max(sv3.version_number) from submission_versions sv3
                  where sv3.event_participation_id = ep2.id and sv3.status <> 'draft'
                )
                and (
                  (v_field.type = 'single_select' and sv2.data_snapshot_json ->> v_field.key = v_selected_label)
                  or
                  (v_field.type = 'multi_select' and sv2.data_snapshot_json -> v_field.key ? v_selected_label)
                )
            );

          if v_current_count + 1 > v_capacity then
            raise exception '「%」は満枠のため選択できません（在庫%件）。別の選択肢をお試しください。', v_selected_label, v_capacity;
          end if;
        end if;
      end if;
    end loop;
  end loop;

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

  if v_has_priced_fields then
    update event_participations
    set resolved_price_yen = v_resolved_price_yen
    where id = v_participation.id
    returning * into v_participation;
  end if;

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

-- 出展者向けフォーム画面が「在庫が埋まっている選択肢」を選択不可表示にするための、
-- 選択肢ごとの残数取得RPC。件数のみを返し個人情報は含まないため、ログイン済みなら誰でも呼べる。
create or replace function get_choice_availability(p_event_id uuid)
returns table (field_key text, choice_label text, capacity integer, taken_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  return query
  select
    ff.key,
    choice ->> 'label',
    (choice ->> 'capacity')::integer,
    (
      select count(*)::integer
      from event_participations ep2
      where ep2.event_id = p_event_id
        and ep2.status not in ('cancelled', 'merged')
        and exists (
          select 1 from submission_versions sv2
          where sv2.event_participation_id = ep2.id
            and sv2.status <> 'draft'
            and sv2.version_number = (
              select max(sv3.version_number) from submission_versions sv3
              where sv3.event_participation_id = ep2.id and sv3.status <> 'draft'
            )
            and (
              (ff.type = 'single_select' and sv2.data_snapshot_json ->> ff.key = (choice ->> 'label'))
              or
              (ff.type = 'multi_select' and sv2.data_snapshot_json -> ff.key ? (choice ->> 'label'))
            )
        )
    )
  from form_fields ff
  join form_sections fs on fs.id = ff.form_section_id
  join forms f on f.id = fs.form_id
  cross join lateral jsonb_array_elements(ff.options_json -> 'choices') as choice
  where f.event_id = p_event_id
    and f.status = 'published'
    and ff.type in ('single_select', 'multi_select')
    and jsonb_typeof(ff.options_json -> 'choices') = 'array'
    and jsonb_typeof(choice) = 'object'
    and nullif(choice ->> 'capacity', '') is not null;
end;
$$;

-- 0053_phase12_company_name_duplicate_detection.sql
-- duplicate_flags.match_reason は 'company_name_similarity' をスキーマ上は許容していたが、
-- 実装が一度も無く、メール一致のみが機能していた（設計ブリーフ・docs/screens.mdが
-- 約束する「メール一致/類似社名」の一部が未実装のままだった）。pg_trgm の類似度で
-- 会社名の近似一致を検知し、submit_current_version（0040版）のメール一致ブロックと
-- 同じ形でduplicate_flagsに挿入する。

create extension if not exists pg_trgm;

-- submit_current_version（0040版）に、会社名類似度による重複検知ブロックを追加したもの。
-- 既存のメール一致ブロックの直後に置くことで、同じペアが既にメール一致で
-- フラグ済みなら（not existsの判定により）二重に挿入されない。
create or replace function submit_current_version(p_submission_version_id uuid, p_answers jsonb, p_quantities jsonb default '{}'::jsonb)
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
  v_qty_raw text;
  v_qty integer;
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

  if v_participation.status in ('cancelled', 'merged') then
    raise exception 'この参加はキャンセルされているため送信できません。主催者にお問い合わせください。';
  end if;

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
        v_qty_raw := p_quantities -> v_field.key ->> v_selected_label;
        if v_qty_raw is not null and v_qty_raw ~ '^[0-9]{1,6}$' then
          v_qty := greatest(1, least(100, v_qty_raw::integer));
        else
          v_qty := 1;
        end if;

        v_resolved_price_yen := v_resolved_price_yen + coalesce((v_choice ->> 'price_yen')::integer, 0) * v_qty;
        v_capacity := nullif(v_choice ->> 'capacity', '')::integer;

        if v_capacity is not null then
          perform pg_advisory_xact_lock(
            hashtextextended(v_version.form_id::text || ':' || v_field.key || ':' || v_selected_label, 0)
          );

          select coalesce(sum(
            case
              when (latest_sv.quantities_json -> v_field.key ->> v_selected_label) ~ '^[0-9]{1,6}$'
                then greatest(1, least(100, (latest_sv.quantities_json -> v_field.key ->> v_selected_label)::integer))
              else 1
            end
          ), 0)
          into v_current_count
          from event_participations ep2
          join lateral (
            select sv2.data_snapshot_json, sv2.quantities_json
            from submission_versions sv2
            where sv2.event_participation_id = ep2.id and sv2.status <> 'draft'
            order by sv2.version_number desc
            limit 1
          ) latest_sv on true
          where ep2.event_id = v_participation.event_id
            and ep2.id <> v_participation.id
            and ep2.status not in ('cancelled', 'merged')
            and (
              (v_field.type = 'single_select' and latest_sv.data_snapshot_json ->> v_field.key = v_selected_label)
              or
              (v_field.type = 'multi_select' and latest_sv.data_snapshot_json -> v_field.key ? v_selected_label)
            );

          if v_current_count + v_qty > v_capacity then
            raise exception '「%」は在庫が不足しています（残り%件、選択数%個）。数量を減らすか、別の選択肢をお試しください。',
              v_selected_label, greatest(v_capacity - v_current_count, 0), v_qty;
          end if;
        end if;
      end if;
    end loop;
  end loop;

  update submission_versions
  set data_snapshot_json = p_answers, quantities_json = p_quantities, status = 'submitted', submitted_at = now()
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

  -- 重複検知1：連絡先メールが一致する別ブランドの参加を突き合わせる
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

  -- 重複検知2：会社名が類似する別ブランドの参加を突き合わせる（pg_trgmのトライグラム類似度）。
  -- 閾値0.4は「表記ゆれ（株式会社の有無・全角半角等）は拾うが、無関係な社名同士を
  -- 誤検知しにくい」バランスを見て暫定的に設定したもの。既にメール一致で
  -- フラグ済みのペアはnot existsにより再挿入されない。
  insert into duplicate_flags (event_id, participation_id_a, participation_id_b, match_reason)
  select v_participation.event_id, v_participation.id, other_ep.id, 'company_name_similarity'
  from event_participations other_ep
  join exhibitor_profiles other_profile on other_profile.id = other_ep.exhibitor_profile_id
  where other_ep.event_id = v_participation.event_id
    and other_ep.exhibitor_profile_id <> v_participation.exhibitor_profile_id
    and other_ep.status <> 'merged'
    and v_profile.company_name is not null
    and length(trim(v_profile.company_name)) > 0
    and other_profile.company_name is not null
    and length(trim(other_profile.company_name)) > 0
    and similarity(v_profile.company_name, other_profile.company_name) >= 0.4
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

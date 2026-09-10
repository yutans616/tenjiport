-- 0035_phase10_choice_quantity_and_notes.sql
-- (1) 価格・在庫付きの選択肢に数量を持たせる（コマA2個など、複数コマ購入への対応）。
--     data_snapshot_json（選択されたラベルそのもの）の形は一切変えず、数量だけを
--     専用の新カラム quantities_json（{field_key: {label: quantity}}）に分離して持つ。
--     こうすることでCSVエクスポートや出展者詳細の生JSON列挙など、
--     data_snapshot_jsonをそのまま走査している既存箇所に影響を与えない。
-- (2) 出展者一覧に主催者専用の備考欄（organizer_note）を追加。既存の
--     "organizer can update participations in own events" ポリシーがそのまま使える。

alter table submission_versions add column quantities_json jsonb not null default '{}'::jsonb;
alter table event_participations add column organizer_note text;

-- start_or_resume_submission（0003版）：quantities_jsonの持ち回しを追加。
-- 戻り値の列構成（OUT引数）を変更するためcreate or replaceでは置き換えられず、
-- 事前にdropが必要（PostgreSQLの制約）。
drop function if exists start_or_resume_submission(uuid);

create function start_or_resume_submission(p_event_id uuid)
returns table (
  participation_id uuid,
  submission_version_id uuid,
  version_number integer,
  status text,
  data_snapshot_json jsonb,
  quantities_json jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_participation event_participations;
  v_form_id uuid;
  v_latest submission_versions;
  v_new submission_versions;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select m.exhibitor_profile_id into v_profile_id
  from exhibitor_memberships m
  where m.user_id = auth.uid() and m.status = 'active'
  order by m.created_at
  limit 1;

  if v_profile_id is null then
    insert into exhibitor_profiles (brand_name, company_name, created_by_user_id)
    values ('未設定', '未設定', auth.uid())
    returning id into v_profile_id;

    insert into exhibitor_memberships (user_id, exhibitor_profile_id, role, status)
    values (auth.uid(), v_profile_id, 'owner', 'active');
  end if;

  select f.id into v_form_id
  from forms f
  where f.event_id = p_event_id and f.status = 'published'
  order by f.version desc
  limit 1;

  if v_form_id is null then
    raise exception 'no published form for this event';
  end if;

  insert into event_participations (event_id, exhibitor_profile_id, status)
  values (p_event_id, v_profile_id, 'draft')
  on conflict (event_id, exhibitor_profile_id) do nothing;

  select * into v_participation
  from event_participations
  where event_id = p_event_id and exhibitor_profile_id = v_profile_id;

  select * into v_latest
  from submission_versions
  where event_participation_id = v_participation.id
  order by version_number desc
  limit 1;

  if v_latest.id is not null and v_latest.status = 'draft' then
    return query select v_participation.id, v_latest.id, v_latest.version_number, v_latest.status, v_latest.data_snapshot_json, v_latest.quantities_json;
    return;
  end if;

  insert into submission_versions (event_participation_id, form_id, version_number, status, data_snapshot_json, quantities_json)
  values (
    v_participation.id,
    v_form_id,
    coalesce(v_latest.version_number, 0) + 1,
    'draft',
    coalesce(v_latest.data_snapshot_json, '{}'::jsonb),
    coalesce(v_latest.quantities_json, '{}'::jsonb)
  )
  returning * into v_new;

  return query select v_participation.id, v_new.id, v_new.version_number, v_new.status, v_new.data_snapshot_json, v_new.quantities_json;
end;
$$;

-- submit_current_version（0028版）：p_quantitiesを追加し、価格・在庫の計算を
-- 「選択された/されていない」の判定ではなく数量の合算ベースに変更する。
-- 数量は選択肢ごとに1〜100個にクランプし、数値として解釈できない場合は1個として扱う
-- （不正な入力での金額暴走・エラー落ちを避けるための安全側の丸め）。
-- 引数を追加するため、旧シグネチャ（2引数版）を明示的にdropしてから作り直す
-- （create or replaceは引数リストが違うと別関数として追加されてしまうため）。
drop function if exists submit_current_version(uuid, jsonb);

create function submit_current_version(p_submission_version_id uuid, p_answers jsonb, p_quantities jsonb default '{}'::jsonb)
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

-- get_choice_availability（0028版）：残数を「選択した参加者数」ではなく「数量の合計」で計算する。
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
      select coalesce(sum(
        case
          when (latest_sv.quantities_json -> ff.key ->> (choice ->> 'label')) ~ '^[0-9]{1,6}$'
            then greatest(1, least(100, (latest_sv.quantities_json -> ff.key ->> (choice ->> 'label'))::integer))
          else 1
        end
      ), 0)::integer
      from event_participations ep2
      join lateral (
        select sv2.data_snapshot_json, sv2.quantities_json
        from submission_versions sv2
        where sv2.event_participation_id = ep2.id and sv2.status <> 'draft'
        order by sv2.version_number desc
        limit 1
      ) latest_sv on true
      where ep2.event_id = p_event_id
        and ep2.status not in ('cancelled', 'merged')
        and (
          (ff.type = 'single_select' and latest_sv.data_snapshot_json ->> ff.key = (choice ->> 'label'))
          or
          (ff.type = 'multi_select' and latest_sv.data_snapshot_json -> ff.key ? (choice ->> 'label'))
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

-- 0039_phase11_multi_brand_selection.sql
-- 「1ユーザー1ブランド」制限の解消：新規イベント応募時のみブランド選択を挟む。
-- 既にそのイベントへの参加履歴があれば（下書き再開・再訪問）無条件でスキップし、
-- ブランドが0件（初回ユーザー）の場合も選ぶ対象が無いため今まで通り自動作成する。

drop function if exists start_or_resume_submission(uuid);

create function start_or_resume_submission(
  p_event_id uuid,
  p_exhibitor_profile_id uuid default null,
  p_create_new boolean default false
)
returns table (
  participation_id uuid,
  submission_version_id uuid,
  version_number integer,
  status text,
  data_snapshot_json jsonb,
  quantities_json jsonb,
  needs_profile_selection boolean,
  candidate_profiles jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_membership_count integer;
  v_participation event_participations;
  v_form_id uuid;
  v_latest submission_versions;
  v_new submission_versions;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  -- このイベントに対して、このユーザーの持ついずれかのブランドで既に参加履歴があれば、
  -- それを無条件で使う（下書き再開・再訪問はここで完結し、ピッカーは出さない）。
  select ep.exhibitor_profile_id into v_profile_id
  from event_participations ep
  join exhibitor_memberships m on m.exhibitor_profile_id = ep.exhibitor_profile_id
  where ep.event_id = p_event_id and m.user_id = auth.uid() and m.status = 'active'
  order by ep.created_at asc
  limit 1;

  if v_profile_id is null then
    -- このイベントへの初回訪問：ブランドを決定する必要がある。
    if p_create_new then
      insert into exhibitor_profiles (brand_name, company_name, created_by_user_id)
      values ('未設定', '未設定', auth.uid())
      returning id into v_profile_id;

      insert into exhibitor_memberships (user_id, exhibitor_profile_id, role, status)
      values (auth.uid(), v_profile_id, 'owner', 'active');
    elsif p_exhibitor_profile_id is not null then
      if not exists (
        select 1 from exhibitor_memberships em
        where em.user_id = auth.uid() and em.exhibitor_profile_id = p_exhibitor_profile_id and em.status = 'active'
      ) then
        raise exception 'invalid profile selection';
      end if;
      v_profile_id := p_exhibitor_profile_id;
    else
      select count(*) into v_membership_count
      from exhibitor_memberships em
      where em.user_id = auth.uid() and em.status = 'active';

      if v_membership_count = 0 then
        insert into exhibitor_profiles (brand_name, company_name, created_by_user_id)
        values ('未設定', '未設定', auth.uid())
        returning id into v_profile_id;

        insert into exhibitor_memberships (user_id, exhibitor_profile_id, role, status)
        values (auth.uid(), v_profile_id, 'owner', 'active');
      elsif v_membership_count = 1 then
        -- ブランドが1つしかない人には選択肢を見せず、今まで通り自動で進む。
        select em.exhibitor_profile_id into v_profile_id
        from exhibitor_memberships em
        where em.user_id = auth.uid() and em.status = 'active'
        limit 1;
      else
        return query
        select
          null::uuid, null::uuid, null::integer, null::text, null::jsonb, null::jsonb,
          true,
          (
            select jsonb_agg(jsonb_build_object('id', p.id, 'brand_name', p.brand_name, 'company_name', p.company_name) order by m.created_at asc)
            from exhibitor_profiles p
            join exhibitor_memberships m on m.exhibitor_profile_id = p.id
            where m.user_id = auth.uid() and m.status = 'active'
          );
        return;
      end if;
    end if;
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
    return query
    select
      v_participation.id, v_latest.id, v_latest.version_number, v_latest.status,
      v_latest.data_snapshot_json, v_latest.quantities_json, false, null::jsonb;
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

  return query
  select
    v_participation.id, v_new.id, v_new.version_number, v_new.status,
    v_new.data_snapshot_json, v_new.quantities_json, false, null::jsonb;
end;
$$;

-- get_my_announcements：同一ユーザーが複数ブランドを持つ場合でも決定的に選ぶ（列構成は不変）。
create or replace function get_my_announcements(p_event_id uuid)
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

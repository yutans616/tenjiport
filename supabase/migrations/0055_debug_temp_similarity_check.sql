-- 0055_debug_temp_similarity_check.sql
-- 一時デバッグ用。0054の会社名類似度検知が期待通り発火しない原因調査のため、
-- 実際の候補行と各条件の評価結果を直接見えるようにする。原因判明後に
-- 次のマイグレーションで削除する（本番に残さない）。

create or replace function debug_company_similarity(p_event_id uuid, p_participation_id uuid)
returns table (
  other_participation_id uuid,
  other_status text,
  self_company_name text,
  other_company_name text,
  self_normalized text,
  other_normalized text,
  sim numeric,
  self_normalized_not_null boolean,
  other_normalized_not_null boolean,
  sim_ge_threshold boolean,
  already_flagged boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_participation event_participations;
  v_profile exhibitor_profiles;
begin
  select * into v_participation from event_participations where id = p_participation_id;
  select * into v_profile from exhibitor_profiles where id = v_participation.exhibitor_profile_id;

  return query
  select
    other_ep.id,
    other_ep.status,
    v_profile.company_name,
    other_profile.company_name,
    normalize_company_name_for_matching(v_profile.company_name),
    normalize_company_name_for_matching(other_profile.company_name),
    similarity(
      coalesce(normalize_company_name_for_matching(v_profile.company_name), ''),
      coalesce(normalize_company_name_for_matching(other_profile.company_name), '')
    )::numeric,
    normalize_company_name_for_matching(v_profile.company_name) is not null,
    normalize_company_name_for_matching(other_profile.company_name) is not null,
    similarity(
      coalesce(normalize_company_name_for_matching(v_profile.company_name), ''),
      coalesce(normalize_company_name_for_matching(other_profile.company_name), '')
    ) >= 0.4,
    exists (
      select 1 from duplicate_flags df
      where df.event_id = p_event_id
        and (
          (df.participation_id_a = v_participation.id and df.participation_id_b = other_ep.id)
          or (df.participation_id_a = other_ep.id and df.participation_id_b = v_participation.id)
        )
    )
  from event_participations other_ep
  join exhibitor_profiles other_profile on other_profile.id = other_ep.exhibitor_profile_id
  where other_ep.event_id = p_event_id
    and other_ep.exhibitor_profile_id <> v_participation.exhibitor_profile_id
    and other_ep.status <> 'merged';
end;
$$;

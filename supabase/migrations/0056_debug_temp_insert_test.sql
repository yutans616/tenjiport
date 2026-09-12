-- 0056_debug_temp_insert_test.sql
-- 一時デバッグ用（0055の続き）。0054の条件はすべて満たされている（sim=1, already_flagged=false）
-- のに実際のsubmit_current_version経由ではduplicate_flagsが1件も作られない原因を切り分ける。
-- ここでは全く同じINSERT文を、submit_current_versionの外側で直接実行してみて、
-- 成功する（＝submit_current_version固有の何かが原因）か、失敗する（＝クエリ自体に見落としがある）
-- かを判定する。原因判明後、次のマイグレーションで削除する。

create or replace function debug_try_insert_flag(p_event_id uuid, p_participation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_participation event_participations;
  v_profile exhibitor_profiles;
  v_inserted_count integer;
begin
  select * into v_participation from event_participations where id = p_participation_id;
  select * into v_profile from exhibitor_profiles where id = v_participation.exhibitor_profile_id;

  with inserted as (
    insert into duplicate_flags (event_id, participation_id_a, participation_id_b, match_reason)
    select v_participation.event_id, v_participation.id, other_ep.id, 'company_name_similarity'
    from event_participations other_ep
    join exhibitor_profiles other_profile on other_profile.id = other_ep.exhibitor_profile_id
    where other_ep.event_id = v_participation.event_id
      and other_ep.exhibitor_profile_id <> v_participation.exhibitor_profile_id
      and other_ep.status <> 'merged'
      and normalize_company_name_for_matching(v_profile.company_name) is not null
      and normalize_company_name_for_matching(other_profile.company_name) is not null
      and similarity(
        normalize_company_name_for_matching(v_profile.company_name),
        normalize_company_name_for_matching(other_profile.company_name)
      ) >= 0.4
      and not exists (
        select 1 from duplicate_flags df
        where df.event_id = v_participation.event_id
          and (
            (df.participation_id_a = v_participation.id and df.participation_id_b = other_ep.id)
            or (df.participation_id_a = other_ep.id and df.participation_id_b = v_participation.id)
          )
      )
    returning 1
  )
  select count(*) into v_inserted_count from inserted;

  return jsonb_build_object('inserted_count', v_inserted_count, 'participation_id', v_participation.id, 'exhibitor_profile_id', v_participation.exhibitor_profile_id);
exception when others then
  return jsonb_build_object('error', sqlerrm, 'error_detail', sqlstate);
end;
$$;

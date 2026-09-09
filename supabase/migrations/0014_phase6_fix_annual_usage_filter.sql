-- 0014_phase6_fix_annual_usage_filter.sql
-- get_annual_plan_usage が「契約開始後に作成されたイベント」で絞り込んでいたため、
-- 契約開始前に作成済みのイベント（実際にはこちらの方が一般的）が集計から漏れる
-- 不具合を修正（動作検証で発見）。正しくは「契約期間中に初回提出された参加」で
-- 絞り込むべきであり、イベント自体の作成日時とは無関係にする。

create or replace function get_annual_plan_usage(p_org_id uuid)
returns table (
  service_contract_id uuid,
  annual_fee_yen integer,
  participant_cap_per_event integer,
  event_count_cap integer,
  events_used_count bigint,
  event_id uuid,
  event_name text,
  event_billable_count bigint,
  is_over_participant_cap boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contract record;
begin
  if auth.uid() is null or not is_organizer_member(p_org_id) then
    raise exception 'not authorized';
  end if;

  select sc.id as contract_id, apc.annual_fee_yen, apc.participant_cap_per_event, apc.event_count_cap, sc.started_at
  into v_contract
  from service_contracts sc
  join annual_plan_configs apc on apc.id = sc.annual_plan_config_id
  where sc.organizer_organization_id = p_org_id and sc.status = 'active' and sc.plan_type = 'annual';

  if v_contract.contract_id is null then
    return;
  end if;

  return query
  with per_event as (
    select
      e.id as event_id,
      e.name as event_name,
      count(ep.id) filter (where ep.is_billable and ep.first_submitted_at >= v_contract.started_at) as billable_count
    from events e
    left join event_participations ep on ep.event_id = e.id
    where e.organizer_organization_id = p_org_id
    group by e.id, e.name
  ),
  events_used as (
    select count(*) as cnt from per_event where billable_count > 0
  )
  select
    v_contract.contract_id,
    v_contract.annual_fee_yen,
    v_contract.participant_cap_per_event,
    v_contract.event_count_cap,
    (select cnt from events_used),
    per_event.event_id,
    per_event.event_name,
    per_event.billable_count,
    (per_event.billable_count > v_contract.participant_cap_per_event)
  from per_event
  order by per_event.billable_count desc;
end;
$$;

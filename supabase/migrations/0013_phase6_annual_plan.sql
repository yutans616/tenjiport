-- 0013_phase6_annual_plan.sql
-- Phase 6: 年間プラン
--
-- 設計方針：
--   - 年間プランは定額のみ。submit_current_version は既に「plan_type = 'standard' の
--     アクティブ契約があるときだけ」UsageLedgerへ記録する設計になっているため、
--     年間契約の組織では自動的に従量請求が発生しない（0011で実装済み、本マイグレーションでは
--     自動テストで保証する）。
--   - 通常⇔年間のプラン変更は「旧契約への計上停止→（通常からの場合のみ）旧契約の最終精算確定
--     →新契約有効化」を1トランザクションで行う。service_contractsのactive一意性は
--     部分ユニークインデックス（0001で作成済み）がDB制約として保証するため、
--     二重クリック・リトライで契約が二重に有効化されることはない。
--   - 上限（1開催あたりの参加者数・年間開催数）は超過しても出展者の入力・提出を止めない
--     （ブリーフの明示要求）。UI側で警告表示するための集計RPCのみ用意する。

-- ============================================================
-- RPC：年間プランの新規開始（既存の有効な契約がない状態から）
-- ============================================================

create or replace function start_annual_plan(p_org_id uuid, p_annual_plan_config_id uuid)
returns service_contracts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contract service_contracts;
begin
  if auth.uid() is null or not is_organizer_member(p_org_id) then
    raise exception 'not authorized';
  end if;
  if exists (select 1 from service_contracts where organizer_organization_id = p_org_id and status = 'active') then
    raise exception 'an active contract already exists for this organization';
  end if;
  if not exists (select 1 from annual_plan_configs where id = p_annual_plan_config_id) then
    raise exception 'annual plan config not found';
  end if;

  insert into service_contracts (organizer_organization_id, plan_type, status, annual_plan_config_id, payment_method_status)
  values (p_org_id, 'annual', 'active', p_annual_plan_config_id, 'not_set')
  returning * into v_contract;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), p_org_id, 'start_annual_plan', 'service_contract', v_contract.id, to_jsonb(v_contract));

  return v_contract;
end;
$$;

-- ============================================================
-- RPC：通常プラン → 年間プランへの切替
-- ============================================================

create or replace function change_to_annual_plan(p_org_id uuid, p_annual_plan_config_id uuid)
returns service_contracts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old service_contracts;
  v_new service_contracts;
  v_final_invoice service_invoices;
begin
  if auth.uid() is null or not is_organizer_member(p_org_id) then
    raise exception 'not authorized';
  end if;

  select * into v_old from service_contracts where organizer_organization_id = p_org_id and status = 'active';

  -- 二重クリック対策：既に同じ年間プランが有効なら、新規作成せずそのまま返す
  if v_old.id is not null and v_old.plan_type = 'annual' and v_old.annual_plan_config_id = p_annual_plan_config_id then
    return v_old;
  end if;

  if v_old.id is not null and v_old.plan_type = 'standard' then
    -- 旧契約（通常プラン）の未請求ぶんを最終精算として確定する
    v_final_invoice := generate_service_invoice(v_old.id, v_old.started_at, now());

    update service_contracts set status = 'closed', ended_at = now() where id = v_old.id;
  elsif v_old.id is not null then
    update service_contracts set status = 'closed', ended_at = now() where id = v_old.id;
  end if;

  insert into service_contracts (organizer_organization_id, plan_type, status, annual_plan_config_id, payment_method_status)
  values (p_org_id, 'annual', 'active', p_annual_plan_config_id, coalesce(v_old.payment_method_status, 'not_set'))
  returning * into v_new;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, before_json, after_json)
  values (auth.uid(), p_org_id, 'change_to_annual_plan', 'service_contract', v_new.id, to_jsonb(v_old), to_jsonb(v_new));

  return v_new;
end;
$$;

-- ============================================================
-- RPC：年間プラン → 通常プランへの切替
-- ============================================================

create or replace function change_to_standard_plan(p_org_id uuid, p_pricing_config_id uuid)
returns service_contracts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old service_contracts;
  v_new service_contracts;
begin
  if auth.uid() is null or not is_organizer_member(p_org_id) then
    raise exception 'not authorized';
  end if;

  select * into v_old from service_contracts where organizer_organization_id = p_org_id and status = 'active';

  -- 二重クリック対策：既に同じ通常プランが有効なら、新規作成せずそのまま返す
  if v_old.id is not null and v_old.plan_type = 'standard' and v_old.pricing_config_id = p_pricing_config_id then
    return v_old;
  end if;

  if v_old.id is not null then
    -- 年間プランは定額のみのため、切替時にUsageLedgerの精算は発生しない
    update service_contracts set status = 'closed', ended_at = now() where id = v_old.id;
  end if;

  insert into service_contracts (organizer_organization_id, plan_type, status, pricing_config_id, payment_method_status)
  values (p_org_id, 'standard', 'active', p_pricing_config_id, coalesce(v_old.payment_method_status, 'not_set'))
  returning * into v_new;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, before_json, after_json)
  values (auth.uid(), p_org_id, 'change_to_standard_plan', 'service_contract', v_new.id, to_jsonb(v_old), to_jsonb(v_new));

  return v_new;
end;
$$;

-- ============================================================
-- RPC：年間プランの利用状況（上限接近・超過の警告表示用。出展者の提出は止めない）
-- ============================================================

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
    select e.id as event_id, e.name as event_name, count(ep.id) filter (where ep.is_billable) as billable_count
    from events e
    left join event_participations ep on ep.event_id = e.id
    where e.organizer_organization_id = p_org_id
      and e.created_at >= v_contract.started_at
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

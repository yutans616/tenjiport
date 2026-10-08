-- 0075_billing_manager_only.sql
-- プラン・課金の操作（プランの開始・変更、年間プランの課金・請求書払いの発行、カード登録の記録）を
-- 組織のオーナー・管理者に限る。これまでは組織のメンバーであれば誰でも実行できた。
-- 画面・サーバー処理側でも同じ判定をしているが、スタッフがDBの関数を直接呼べないよう、
-- 各関数の権限判定を is_organizer_member から is_organizer_billing_manager に置き換える
-- （関数本体は各関数の最新の定義から、権限判定以外を変更せずに再定義している）。

create or replace function is_organizer_billing_manager(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from organizer_memberships m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
$fn$;

-- start_standard_plan（0011_phase5_usage_billing.sql の定義から権限判定のみ変更）
create or replace function start_standard_plan(p_org_id uuid, p_pricing_config_id uuid)
returns service_contracts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contract service_contracts;
  v_pc pricing_configs;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not is_organizer_billing_manager(p_org_id) then
    raise exception 'not authorized';
  end if;
  if exists (select 1 from service_contracts where organizer_organization_id = p_org_id and status = 'active') then
    raise exception 'an active contract already exists for this organization';
  end if;

  select * into v_pc from pricing_configs where id = p_pricing_config_id;
  if v_pc.id is null then
    raise exception 'pricing config not found';
  end if;

  insert into service_contracts (organizer_organization_id, plan_type, status, pricing_config_id, payment_method_status)
  values (p_org_id, 'standard', 'active', p_pricing_config_id, 'not_set')
  returning * into v_contract;

  -- バックフィル：これまでに課金対象になった参加のうち、まだUsageLedgerに計上されていないもの
  insert into usage_ledger (
    organizer_organization_id, service_contract_id, event_id, event_participation_id,
    entry_type, quantity, unit_price_yen, amount_yen, idempotency_key, occurred_at, created_by
  )
  select
    p_org_id, v_contract.id, ep.event_id, ep.id,
    'billable_participation', 1, v_pc.overage_unit_yen, v_pc.overage_unit_yen,
    'participation:' || ep.id || ':first_submit', coalesce(ep.first_submitted_at, now()), auth.uid()
  from event_participations ep
  join events e on e.id = ep.event_id
  where e.organizer_organization_id = p_org_id
    and ep.is_billable = true
  on conflict (idempotency_key) do nothing;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), p_org_id, 'start_standard_plan', 'service_contract', v_contract.id, to_jsonb(v_contract));

  return v_contract;
end;
$$;

-- start_annual_plan（0050_phase12_annual_plan_card_payment.sql の定義から権限判定のみ変更）
create or replace function start_annual_plan(p_org_id uuid, p_annual_plan_config_id uuid, p_billing_method text default 'invoice')
returns service_contracts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contract service_contracts;
begin
  if auth.uid() is null or not is_organizer_billing_manager(p_org_id) then
    raise exception 'not authorized';
  end if;
  if p_billing_method not in ('invoice', 'card') then
    raise exception 'invalid billing method';
  end if;
  if exists (select 1 from service_contracts where organizer_organization_id = p_org_id and status = 'active') then
    raise exception 'an active contract already exists for this organization';
  end if;
  if not exists (select 1 from annual_plan_configs where id = p_annual_plan_config_id) then
    raise exception 'annual plan config not found';
  end if;

  insert into service_contracts (organizer_organization_id, plan_type, status, annual_plan_config_id, payment_method_status, billing_method)
  values (p_org_id, 'annual', 'active', p_annual_plan_config_id, 'not_set', p_billing_method)
  returning * into v_contract;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), p_org_id, 'start_annual_plan', 'service_contract', v_contract.id, to_jsonb(v_contract));

  return v_contract;
end;
$$;

-- change_to_annual_plan（0050_phase12_annual_plan_card_payment.sql の定義から権限判定のみ変更）
create or replace function change_to_annual_plan(p_org_id uuid, p_annual_plan_config_id uuid, p_billing_method text default 'invoice')
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
  if auth.uid() is null or not is_organizer_billing_manager(p_org_id) then
    raise exception 'not authorized';
  end if;
  if p_billing_method not in ('invoice', 'card') then
    raise exception 'invalid billing method';
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

  insert into service_contracts (organizer_organization_id, plan_type, status, annual_plan_config_id, payment_method_status, billing_method)
  values (p_org_id, 'annual', 'active', p_annual_plan_config_id, coalesce(v_old.payment_method_status, 'not_set'), p_billing_method)
  returning * into v_new;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, before_json, after_json)
  values (auth.uid(), p_org_id, 'change_to_annual_plan', 'service_contract', v_new.id, to_jsonb(v_old), to_jsonb(v_new));

  return v_new;
end;
$$;

-- change_to_standard_plan（0013_phase6_annual_plan.sql の定義から権限判定のみ変更）
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
  if auth.uid() is null or not is_organizer_billing_manager(p_org_id) then
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

-- charge_annual_plan_fee（0050_phase12_annual_plan_card_payment.sql の定義から権限判定のみ変更）
create or replace function charge_annual_plan_fee(p_service_contract_id uuid)
returns service_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contract service_contracts;
  v_apc annual_plan_configs;
  v_invoice service_invoices;
  v_idempotency_key text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_contract from service_contracts where id = p_service_contract_id;
  if v_contract.id is null or not is_organizer_billing_manager(v_contract.organizer_organization_id) then
    raise exception 'not authorized';
  end if;
  if v_contract.plan_type <> 'annual' or v_contract.status <> 'active' then
    raise exception 'not an active annual contract';
  end if;
  if v_contract.billing_method <> 'card' then
    raise exception 'this contract is not set up for card billing';
  end if;

  select * into v_apc from annual_plan_configs where id = v_contract.annual_plan_config_id;
  if v_apc.id is null then
    raise exception 'annual plan config not found';
  end if;

  v_idempotency_key := 'service_invoice:contract:' || v_contract.id || ':annual_fee';

  insert into service_invoices (
    organizer_organization_id, service_contract_id, event_id, charge_kind,
    billing_period_start, billing_period_end,
    base_fee_yen, overage_count, overage_amount_yen, tax_amount_yen, total_amount_yen,
    status, idempotency_key
  )
  values (
    v_contract.organizer_organization_id, v_contract.id, null, 'annual_fee',
    v_contract.started_at, v_contract.started_at + interval '1 year',
    v_apc.annual_fee_yen, 0, 0, 0, v_apc.annual_fee_yen,
    'finalized', v_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning * into v_invoice;

  if v_invoice.id is null then
    select * into v_invoice from service_invoices where idempotency_key = v_idempotency_key;
  end if;

  return v_invoice;
end;
$$;

-- issue_annual_plan_invoice_bill（0051_phase12_annual_plan_invoice_billing.sql の定義から権限判定のみ変更）
create or replace function issue_annual_plan_invoice_bill(p_service_contract_id uuid, p_due_date date)
returns service_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contract service_contracts;
  v_apc annual_plan_configs;
  v_invoice service_invoices;
  v_idempotency_key text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_contract from service_contracts where id = p_service_contract_id;
  if v_contract.id is null or not is_organizer_billing_manager(v_contract.organizer_organization_id) then
    raise exception 'not authorized';
  end if;
  if v_contract.plan_type <> 'annual' or v_contract.status <> 'active' then
    raise exception 'not an active annual contract';
  end if;
  if v_contract.billing_method <> 'invoice' then
    raise exception 'this contract is not set up for invoice billing';
  end if;
  if p_due_date is null then
    raise exception 'due date is required';
  end if;

  select * into v_apc from annual_plan_configs where id = v_contract.annual_plan_config_id;
  if v_apc.id is null then
    raise exception 'annual plan config not found';
  end if;

  v_idempotency_key := 'service_invoice:contract:' || v_contract.id || ':annual_fee';

  insert into service_invoices (
    organizer_organization_id, service_contract_id, event_id, charge_kind,
    billing_period_start, billing_period_end,
    base_fee_yen, overage_count, overage_amount_yen, tax_amount_yen, total_amount_yen,
    status, idempotency_key, due_date
  )
  values (
    v_contract.organizer_organization_id, v_contract.id, null, 'annual_fee',
    v_contract.started_at, v_contract.started_at + interval '1 year',
    v_apc.annual_fee_yen, 0, 0, 0, v_apc.annual_fee_yen,
    'finalized', v_idempotency_key, p_due_date
  )
  on conflict (idempotency_key) do nothing
  returning * into v_invoice;

  if v_invoice.id is null then
    select * into v_invoice from service_invoices where idempotency_key = v_idempotency_key;
  end if;

  return v_invoice;
end;
$$;

-- record_payment_method_setup（0012_phase5_stripe_setup.sql の定義から権限判定のみ変更）
create or replace function record_payment_method_setup(
  p_org_id uuid,
  p_stripe_customer_id text,
  p_stripe_payment_method_id text
)
returns organizer_organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result organizer_organizations;
begin
  if auth.uid() is null or not is_organizer_billing_manager(p_org_id) then
    raise exception 'not authorized';
  end if;

  update organizer_organizations
  set payment_provider_customer_id = p_stripe_customer_id, stripe_default_payment_method_id = p_stripe_payment_method_id
  where id = p_org_id
  returning * into v_result;

  update service_contracts
  set payment_method_status = 'valid'
  where organizer_organization_id = p_org_id and status = 'active';

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), p_org_id, 'record_payment_method_setup', 'organizer_organization', p_org_id, jsonb_build_object('stripe_customer_id', p_stripe_customer_id));

  return v_result;
end;
$$;

-- 0050_phase12_annual_plan_card_payment.sql
-- 年間プランはこれまで「請求書払い（アプリ外の手動運用）」を前提としていたが、
-- 実際には契約レコードを作るだけでアプリ内の課金経路が一切存在しなかった
-- （Stripe課金もservice_invoicesの発行も無し）。契約開始時（start_annual_plan /
-- change_to_annual_plan）に限り、主催者がクレジットカードでの即時決済を
-- 選べるようにする（年次更新時の自動課金は対象外・別途検討）。

alter table service_contracts add column billing_method text not null default 'invoice'
  check (billing_method in ('invoice', 'card'));

alter table service_invoices drop constraint service_invoices_charge_kind_check;
alter table service_invoices add constraint service_invoices_charge_kind_check
  check (charge_kind in ('base_fee', 'overage', 'annual_fee'));

-- 年間プラン契約の年額をクレジットカードで課金するための請求行を確定する。
-- charge_event_base_fee と同じ立て付け（本人がauth.uid()で直接呼ぶ。実際の
-- Stripe課金は呼び出し側のTypeScriptで行う）。event_idを持たないため
-- charge_kind='annual_fee'の行はevent_idがnullのまま作成する。
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
  if v_contract.id is null or not is_organizer_member(v_contract.organizer_organization_id) then
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

-- start_annual_plan / change_to_annual_plan にbilling_methodを渡せるよう拡張する
-- （デフォルト'invoice'のため、引数を渡さない既存の呼び出しがあっても挙動は変わらない）。

create or replace function start_annual_plan(p_org_id uuid, p_annual_plan_config_id uuid, p_billing_method text default 'invoice')
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
  if auth.uid() is null or not is_organizer_member(p_org_id) then
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

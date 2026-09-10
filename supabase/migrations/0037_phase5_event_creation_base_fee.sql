-- 0037_phase5_event_creation_base_fee.sql
-- 基本料金をイベント作成時に即時課金し、イベント終了日起点の自動課金は
-- 超過分（従量課金）のみに変更する。1イベントにつき最大2行（base_fee/overage）の
-- service_invoicesを持てるよう区分列を追加する。

alter table service_invoices add column charge_kind text not null default 'base_fee'
  check (charge_kind in ('base_fee', 'overage'));

drop index uq_service_invoices_event;
create unique index uq_service_invoices_event_kind on service_invoices(event_id, charge_kind) where event_id is not null;

-- イベント作成時に、作成した本人（authenticated）が直接呼ぶ。cron専用の
-- finalize_event_service_invoiceとは異なり、通常のauth.uid()チェックで守る。
-- 金額計算・請求行の確定のみを行い、実際のStripe課金は呼び出し側（TypeScript）で行う。
create or replace function charge_event_base_fee(p_event_id uuid)
returns service_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_event events;
  v_contract service_contracts;
  v_pc pricing_configs;
  v_invoice service_invoices;
  v_idempotency_key text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_event from events where id = p_event_id;
  if v_event.id is null or not is_organizer_member(v_event.organizer_organization_id) then
    raise exception 'not authorized';
  end if;
  v_org_id := v_event.organizer_organization_id;

  select * into v_contract
  from service_contracts
  where organizer_organization_id = v_org_id and status = 'active' and plan_type = 'standard';
  if v_contract.id is null then
    raise exception 'no active standard contract for this organization';
  end if;

  select * into v_pc from pricing_configs where id = v_contract.pricing_config_id;
  if v_pc.id is null then
    raise exception 'pricing config not found';
  end if;

  v_idempotency_key := 'service_invoice:event:' || p_event_id || ':base_fee';

  insert into service_invoices (
    organizer_organization_id, service_contract_id, event_id, charge_kind,
    billing_period_start, billing_period_end,
    base_fee_yen, overage_count, overage_amount_yen, tax_amount_yen, total_amount_yen,
    status, idempotency_key
  )
  values (
    v_org_id, v_contract.id, p_event_id, 'base_fee',
    coalesce(v_event.start_date, current_date), coalesce(v_event.end_date, current_date),
    v_pc.base_fee_yen, 0, 0, 0, v_pc.base_fee_yen,
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

-- finalize_event_service_invoice（0036版）：基本料金を含めず、超過分のみを計算・課金対象にする。
-- 超過が0件の場合は行を作らずnullを返す（課金の必要がないため）。
create or replace function finalize_event_service_invoice(p_event_id uuid)
returns service_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_event events;
  v_contract service_contracts;
  v_pc pricing_configs;
  v_billable_count integer;
  v_overage_count integer;
  v_overage_amount integer;
  v_invoice service_invoices;
  v_idempotency_key text;
begin
  select * into v_event from events where id = p_event_id;
  if v_event.id is null then
    return null;
  end if;
  v_org_id := v_event.organizer_organization_id;

  select * into v_contract
  from service_contracts
  where organizer_organization_id = v_org_id and status = 'active' and plan_type = 'standard';
  if v_contract.id is null then
    return null;
  end if;

  select * into v_pc from pricing_configs where id = v_contract.pricing_config_id;
  if v_pc.id is null then
    return null;
  end if;

  v_idempotency_key := 'service_invoice:event:' || p_event_id || ':overage';

  -- 既に確定済みならそれを返す（冪等）。
  select * into v_invoice from service_invoices where idempotency_key = v_idempotency_key;
  if v_invoice.id is not null then
    return v_invoice;
  end if;

  select greatest(coalesce(sum(quantity), 0), 0) into v_billable_count
  from usage_ledger
  where service_contract_id = v_contract.id
    and event_id = p_event_id
    and billed_in_invoice_id is null;

  -- 超過が0件でも行自体は作る（total_amount_yen=0）。「この時点で確認済み」の
  -- マーカーとして使うことで、cronバッチが同じイベントを無期限に再スキャンし
  -- 続けるのを防ぐ（0円の場合は呼び出し側でStripe課金自体をスキップする）。
  v_overage_count := greatest(v_billable_count - v_pc.included_participants, 0);
  v_overage_amount := v_overage_count * v_pc.overage_unit_yen;

  insert into service_invoices (
    organizer_organization_id, service_contract_id, event_id, charge_kind,
    billing_period_start, billing_period_end,
    base_fee_yen, overage_count, overage_amount_yen, tax_amount_yen, total_amount_yen,
    status, idempotency_key
  )
  values (
    v_org_id, v_contract.id, p_event_id, 'overage',
    v_event.start_date, v_event.end_date,
    0, v_overage_count, v_overage_amount, 0, v_overage_amount,
    'finalized', v_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning * into v_invoice;

  if v_invoice.id is null then
    select * into v_invoice from service_invoices where idempotency_key = v_idempotency_key;
    return v_invoice;
  end if;

  update usage_ledger
  set billed_in_invoice_id = v_invoice.id
  where service_contract_id = v_contract.id
    and event_id = p_event_id
    and billed_in_invoice_id is null;

  insert into audit_logs (organization_id, action_type, entity_type, entity_id, after_json)
  values (v_org_id, 'finalize_event_service_invoice', 'service_invoice', v_invoice.id, to_jsonb(v_invoice));

  return v_invoice;
end;
$$;

revoke execute on function finalize_event_service_invoice(uuid) from public, anon, authenticated;
grant execute on function finalize_event_service_invoice(uuid) to service_role;

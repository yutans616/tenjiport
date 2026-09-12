-- 0051_phase12_annual_plan_invoice_billing.sql
-- 年間プランで「請求書払い」を選んだ場合に、クレカ課金と同じ適格請求書フォーマットで
-- PDFを発行できるようにする。支払期限（振込期日）を持たせるため due_date を追加する。

alter table service_invoices add column due_date date;

-- 年間プラン契約の年額を「請求書払い（銀行振込）」で確定するための請求行を作る。
-- charge_annual_plan_fee と同じ立て付けだが、Stripe課金は行わずdue_dateを持つ
-- 点のみが異なる（実際のPDF生成・発番は呼び出し側のTypeScriptで行う）。
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
  if v_contract.id is null or not is_organizer_member(v_contract.organizer_organization_id) then
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

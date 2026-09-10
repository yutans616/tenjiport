-- 0036_phase5_event_billing_execution.sql
-- 自動課金の実行（イベント終了時課金）。
--
-- 確定した課金モデル：「サービス1回の利用＝1イベント」を単位とし、イベント終了日を
-- 起点に、そのイベント単体の参加社数に対して都度課金する（暦月での集計は行わない）。
-- 基本料金・含まれ参加社数の無料枠は「登録時に1回だけ」ではなく、イベントごとに
-- 毎回適用される（例：30社含む9,800円のプランで、35社のイベントAと10社の
-- イベントBを開催した場合、Aは9,800+(35-30)*300=11,300円、Bは9,800円をそれぞれ
-- 個別に課金する）。

alter table service_invoices add column event_id uuid references events(id);
alter table service_invoices add column stripe_payment_intent_id text;
alter table service_invoices add column retry_count integer not null default 0;
alter table service_invoices add column last_charge_attempt_at timestamptz;

create unique index uq_service_invoices_event on service_invoices(event_id) where event_id is not null;

-- generate_service_invoice（0011版、日付範囲で集計）と同じ料金計算式を、
-- event_idでスコープして計算する版。cronからservice roleで呼ぶ専用関数のため
-- auth.uid()チェックは行わず、代わりにREVOKE/GRANTで一般ユーザーから直接
-- 呼べないようにする（このDBの他のSECURITY DEFINER関数はauth.uid()チェックに
-- 依存しているが、これはcron専用のため異なる防御方式を取る）。
create function finalize_event_service_invoice(p_event_id uuid)
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
  v_total integer;
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

  v_idempotency_key := 'service_invoice:event:' || p_event_id;

  -- quantityの符号付き合計。補正行（-1）を単純な行数でカウントしないよう SUM(quantity) を使う。
  select greatest(coalesce(sum(quantity), 0), 0) into v_billable_count
  from usage_ledger
  where service_contract_id = v_contract.id
    and event_id = p_event_id
    and billed_in_invoice_id is null;

  v_overage_count := greatest(v_billable_count - v_pc.included_participants, 0);
  v_overage_amount := v_overage_count * v_pc.overage_unit_yen;
  v_total := v_pc.base_fee_yen + v_overage_amount;

  insert into service_invoices (
    organizer_organization_id, service_contract_id, event_id,
    billing_period_start, billing_period_end,
    base_fee_yen, overage_count, overage_amount_yen, tax_amount_yen, total_amount_yen,
    status, idempotency_key
  )
  values (
    v_org_id, v_contract.id, p_event_id,
    v_event.start_date, v_event.end_date,
    v_pc.base_fee_yen, v_overage_count, v_overage_amount, 0, v_total,
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

-- 0011_phase5_usage_billing.sql
-- Phase 5: SaaS従量課金（通常プラン）
--
-- 設計方針：
--   - Stripeのカード登録・自動課金はキー未設定のため本マイグレーションでは扱わない。
--     ここではUsageLedger・料金計算・ServiceInvoice生成という「お金の勘定」部分を
--     Stripeに依存せず先に実装し、自動テストで料金式の正しさ（30社=9,800円等）を検証する。
--   - Phase 2-4では組織にServiceContractが存在しなかったため、submit_current_versionは
--     UsageLedgerへ書き込んでいなかった（意図的な先送り）。本マイグレーションで
--     ①今後の提出はアクティブな通常プラン契約があればリアルタイムでUsageLedgerに記録し、
--     ②契約開始時に、それまでに課金対象となっていた参加（is_billable=true）を
--     バックフィルする、の両方に対応する。
--   - UsageLedgerは追記専用。アプリのDBロールへのUPDATE/DELETE権限は付与しない
--     （Supabase接続時にダッシュボードのロール設定で行う運用。RLSは書き込みポリシーを
--     一切定義しないことで同等の効果を持たせる＝直接クライアントからは一切書き込めない）。

-- ============================================================
-- RLS：閲覧のみ許可（書き込みはすべてRPC経由）
-- ============================================================

create policy "organizer can select own service contracts"
  on service_contracts for select
  using (is_organizer_member(organizer_organization_id));

create policy "organizer can select own usage ledger"
  on usage_ledger for select
  using (is_organizer_member(organizer_organization_id));

create policy "organizer can select own service invoices"
  on service_invoices for select
  using (is_organizer_member(organizer_organization_id));

create policy "organizer can select own pricing configs"
  on pricing_configs for select
  using (true);

create policy "organizer can select own annual plan configs"
  on annual_plan_configs for select
  using (true);

-- ============================================================
-- submit_current_version：アクティブな通常プラン契約があればUsageLedgerへ記録する
-- ============================================================

create or replace function submit_current_version(p_submission_version_id uuid, p_answers jsonb)
returns submission_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version submission_versions;
  v_participation event_participations;
  v_profile exhibitor_profiles;
  v_org_id uuid;
  v_contract service_contracts;
  v_is_first_submit boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select sv.* into v_version from submission_versions sv where sv.id = p_submission_version_id;
  if v_version.id is null then
    raise exception 'submission version not found';
  end if;

  select ep.* into v_participation from event_participations ep where ep.id = v_version.event_participation_id;

  if not exists (
    select 1 from exhibitor_memberships m
    where m.exhibitor_profile_id = v_participation.exhibitor_profile_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) then
    raise exception 'not authorized';
  end if;

  if v_version.status <> 'draft' then
    raise exception 'only a draft version can be submitted';
  end if;

  v_is_first_submit := v_participation.first_submitted_at is null;

  update submission_versions
  set data_snapshot_json = p_answers, status = 'submitted', submitted_at = now()
  where id = v_version.id
  returning * into v_version;

  update event_participations
  set
    status = 'submitted',
    first_submitted_at = coalesce(first_submitted_at, now()),
    is_billable = true
  where id = v_participation.id
  returning * into v_participation;

  update exhibitor_profiles set
    brand_name = coalesce(nullif(p_answers->>'brand_name', ''), brand_name),
    company_name = coalesce(nullif(p_answers->>'company_name', ''), company_name),
    default_contact_name = coalesce(nullif(p_answers->>'default_contact_name', ''), default_contact_name),
    default_contact_email = coalesce(nullif(p_answers->>'default_contact_email', ''), default_contact_email),
    default_contact_phone = coalesce(nullif(p_answers->>'default_contact_phone', ''), default_contact_phone),
    website = coalesce(nullif(p_answers->>'website', ''), website),
    description = coalesce(nullif(p_answers->>'description', ''), description),
    updated_at = now()
  where id = v_participation.exhibitor_profile_id
  returning * into v_profile;

  -- 初回提出時、アクティブな通常プラン契約があればUsageLedgerへ計上する
  if v_is_first_submit then
    select e.organizer_organization_id into v_org_id from events e where e.id = v_participation.event_id;
    select * into v_contract from service_contracts where organizer_organization_id = v_org_id and status = 'active' and plan_type = 'standard';

    if v_contract.id is not null then
      insert into usage_ledger (
        organizer_organization_id, service_contract_id, event_id, event_participation_id,
        entry_type, quantity, unit_price_yen, amount_yen, idempotency_key, occurred_at, created_by
      )
      select
        v_org_id, v_contract.id, v_participation.event_id, v_participation.id,
        'billable_participation', 1, pc.overage_unit_yen, pc.overage_unit_yen,
        'participation:' || v_participation.id || ':first_submit', now(), auth.uid()
      from pricing_configs pc where pc.id = v_contract.pricing_config_id
      on conflict (idempotency_key) do nothing;
    end if;
  end if;

  insert into duplicate_flags (event_id, participation_id_a, participation_id_b, match_reason)
  select v_participation.event_id, v_participation.id, other_ep.id, 'email'
  from event_participations other_ep
  join exhibitor_profiles other_profile on other_profile.id = other_ep.exhibitor_profile_id
  where other_ep.event_id = v_participation.event_id
    and other_ep.exhibitor_profile_id <> v_participation.exhibitor_profile_id
    and other_ep.status <> 'merged'
    and v_profile.default_contact_email is not null
    and other_profile.default_contact_email = v_profile.default_contact_email
    and not exists (
      select 1 from duplicate_flags df
      where df.event_id = v_participation.event_id
        and (
          (df.participation_id_a = v_participation.id and df.participation_id_b = other_ep.id)
          or (df.participation_id_a = other_ep.id and df.participation_id_b = v_participation.id)
        )
    );

  return v_version;
end;
$$;

-- ============================================================
-- RPC：主催者側
-- ============================================================

-- 通常プラン契約を開始する。既存のis_billable参加のうちUsageLedger未計上のものをバックフィルする。
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
  if not is_organizer_member(p_org_id) then
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

-- ダッシュボード表示用：現在の契約に基づく見込み請求額（未確定・未請求ぶんの集計）
create or replace function calculate_current_billing(p_org_id uuid)
returns table (
  service_contract_id uuid,
  pricing_config_name text,
  is_test boolean,
  billable_count bigint,
  base_fee_yen integer,
  included_participants integer,
  overage_count bigint,
  overage_unit_yen integer,
  overage_amount_yen bigint,
  total_amount_yen bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not is_organizer_member(p_org_id) then
    raise exception 'not authorized';
  end if;

  -- quantity は billable_participation=+1 / correction_credit=-1 のように符号を持つため、
  -- 行数（count）ではなく SUM(quantity) で集計する（補正行があるとcountでは過大計上になる）。
  return query
  select
    sc.id,
    pc.name,
    pc.is_test,
    greatest(coalesce(sum(ul.quantity), 0), 0)::bigint as billable_count,
    pc.base_fee_yen,
    pc.included_participants,
    greatest(coalesce(sum(ul.quantity), 0) - pc.included_participants, 0)::bigint as overage_count,
    pc.overage_unit_yen,
    (greatest(coalesce(sum(ul.quantity), 0) - pc.included_participants, 0) * pc.overage_unit_yen)::bigint as overage_amount_yen,
    (pc.base_fee_yen + greatest(coalesce(sum(ul.quantity), 0) - pc.included_participants, 0) * pc.overage_unit_yen)::bigint as total_amount_yen
  from service_contracts sc
  join pricing_configs pc on pc.id = sc.pricing_config_id
  left join usage_ledger ul on ul.service_contract_id = sc.id and ul.billed_in_invoice_id is null
  where sc.organizer_organization_id = p_org_id and sc.status = 'active' and sc.plan_type = 'standard'
  group by sc.id, pc.name, pc.is_test, pc.base_fee_yen, pc.included_participants, pc.overage_unit_yen;
end;
$$;

-- 未請求ぶんのUsageLedgerを集計してServiceInvoiceを確定する（再実行しても二重請求しない：
-- billed_in_invoice_id IS NULLの行だけを対象にし、一度請求に含めた行は次回の対象から外れる）
create or replace function generate_service_invoice(
  p_service_contract_id uuid,
  p_billing_period_start timestamptz,
  p_billing_period_end timestamptz
)
returns service_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_pc pricing_configs;
  v_billable_count integer;
  v_overage_count integer;
  v_overage_amount integer;
  v_total integer;
  v_invoice service_invoices;
  v_idempotency_key text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select sc.organizer_organization_id into v_org_id
  from service_contracts sc
  where sc.id = p_service_contract_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  select pc.* into v_pc
  from service_contracts sc
  join pricing_configs pc on pc.id = sc.pricing_config_id
  where sc.id = p_service_contract_id;

  v_idempotency_key := 'service_invoice:' || p_service_contract_id || ':' || p_billing_period_start::text || ':' || p_billing_period_end::text;

  -- quantityの符号付き合計。補正行（-1）を単純な行数でカウントしないよう SUM(quantity) を使う。
  select greatest(coalesce(sum(quantity), 0), 0) into v_billable_count
  from usage_ledger
  where service_contract_id = p_service_contract_id
    and billed_in_invoice_id is null
    and occurred_at >= p_billing_period_start
    and occurred_at < p_billing_period_end;

  v_overage_count := greatest(v_billable_count - v_pc.included_participants, 0);
  v_overage_amount := v_overage_count * v_pc.overage_unit_yen;
  v_total := v_pc.base_fee_yen + v_overage_amount;

  insert into service_invoices (
    organizer_organization_id, service_contract_id, billing_period_start, billing_period_end,
    base_fee_yen, overage_count, overage_amount_yen, tax_amount_yen, total_amount_yen,
    status, idempotency_key
  )
  values (
    v_org_id, p_service_contract_id, p_billing_period_start, p_billing_period_end,
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
  where service_contract_id = p_service_contract_id
    and billed_in_invoice_id is null
    and occurred_at >= p_billing_period_start
    and occurred_at < p_billing_period_end;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), v_org_id, 'generate_service_invoice', 'service_invoice', v_invoice.id, to_jsonb(v_invoice));

  return v_invoice;
end;
$$;

-- 重複・テスト登録の課金訂正（既存行は変更せず、理由付きの補正行を追加する）
create or replace function add_usage_correction(p_event_participation_id uuid, p_reason text)
returns usage_ledger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_original usage_ledger;
  v_result usage_ledger;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason is required';
  end if;

  select organizer_organization_id into v_org_id
  from usage_ledger
  where event_participation_id = p_event_participation_id and entry_type = 'billable_participation'
  order by created_at
  limit 1;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized or no billable entry found';
  end if;

  select * into v_original
  from usage_ledger
  where event_participation_id = p_event_participation_id and entry_type = 'billable_participation'
  order by created_at
  limit 1;

  insert into usage_ledger (
    organizer_organization_id, service_contract_id, event_id, event_participation_id,
    entry_type, quantity, unit_price_yen, amount_yen, idempotency_key, related_entry_id, reason, occurred_at, created_by
  )
  values (
    v_original.organizer_organization_id, v_original.service_contract_id, v_original.event_id, p_event_participation_id,
    'correction_credit', -1, v_original.unit_price_yen, -v_original.unit_price_yen,
    'correction:' || p_event_participation_id || ':' || extract(epoch from now())::bigint,
    v_original.id, p_reason, now(), auth.uid()
  )
  returning * into v_result;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), v_org_id, 'add_usage_correction', 'usage_ledger', v_result.id, to_jsonb(v_result));

  return v_result;
end;
$$;

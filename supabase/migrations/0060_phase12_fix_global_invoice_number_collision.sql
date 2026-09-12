-- 0060_phase12_fix_global_invoice_number_collision.sql
-- 前のマイグレーション（0059）の検証中に偶然発見した、別系統の実バグを修正する。
--
-- exhibitor_invoices.invoice_number の一意インデックス（idx_exhibitor_invoices_number、
-- 0032_phase10_invoice_numbering.sqlで作成）が組織をまたいだ「完全グローバル」な
-- 一意制約になっていた。一方、取引先コード（client_code、organizer_exhibitor_codes）は
-- 組織ごとに"001"から採番される設計のため、**別々の2組織がそれぞれ最初の取引先へ
-- 同じ月に初めての請求書を発行すると、両者とも"001-202609-001"のような同一の
-- invoice_numberを生成してしまい、後から発行した側がDB制約違反で失敗する**。
-- 実際に検証用の新規組織を作って再現し、既存の本番データ（001-202609-001）と
-- 衝突することを確認した。TenjiPortは複数の主催者組織が同時に使うSaaSのため、
-- 有料顧客が増えるほど高確率で踏む不具合。
--
-- 修正：exhibitor_invoicesにorganizer_organization_id列を追加（既存行は
-- event_participations経由で逆引きしてバックフィル）し、一意制約を
-- 「組織単位」に変更する。

alter table exhibitor_invoices add column organizer_organization_id uuid references organizer_organizations(id);

update exhibitor_invoices inv
set organizer_organization_id = e.organizer_organization_id
from event_participations ep
join events e on e.id = ep.event_id
where ep.id = inv.event_participation_id;

alter table exhibitor_invoices alter column organizer_organization_id set not null;

drop index idx_exhibitor_invoices_number;
create unique index idx_exhibitor_invoices_number
  on exhibitor_invoices(organizer_organization_id, invoice_number)
  where invoice_number is not null;

-- create_exhibitor_invoice / create_exhibitor_invoices_bulk（0032版）に、
-- 新しいorganizer_organization_id列への値設定を追加したもの（他のロジックは無変更）。
create or replace function create_exhibitor_invoice(
  p_event_participation_id uuid,
  p_invoice_file_id uuid,
  p_amount_yen integer,
  p_due_date date,
  p_organizer_internal_memo text default null
)
returns exhibitor_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_profile_id uuid;
  v_invoice_number text;
  v_result exhibitor_invoices;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select e.organizer_organization_id, ep.exhibitor_profile_id into v_org_id, v_profile_id
  from event_participations ep
  join events e on e.id = ep.event_id
  where ep.id = p_event_participation_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  if p_amount_yen < 0 then
    raise exception 'amount must not be negative';
  end if;

  v_invoice_number := generate_invoice_number(v_org_id, v_profile_id);

  insert into exhibitor_invoices (
    event_participation_id, invoice_file_id, amount_yen, due_date, organizer_internal_memo, created_by_user_id,
    invoice_number, organizer_organization_id
  )
  values (
    p_event_participation_id, p_invoice_file_id, p_amount_yen, p_due_date, p_organizer_internal_memo, auth.uid(),
    v_invoice_number, v_org_id
  )
  returning * into v_result;

  insert into notification_deliveries (event_participation_id, channel, template_type, related_entity_type, related_entity_id, idempotency_key)
  values (
    p_event_participation_id, 'email', 'invoice_publish', 'exhibitor_invoice', v_result.id,
    'invoice_publish:' || v_result.id
  )
  on conflict (idempotency_key) do nothing;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), v_org_id, 'create', 'exhibitor_invoice', v_result.id, to_jsonb(v_result));

  return v_result;
end;
$$;

create or replace function create_exhibitor_invoices_bulk(
  p_event_participation_ids uuid[],
  p_due_date date,
  p_organizer_internal_memo text default null
)
returns table (
  event_participation_id uuid,
  invoice_id uuid,
  amount_yen integer,
  result_status text,
  message text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pid uuid;
  v_org_id uuid;
  v_profile_id uuid;
  v_price integer;
  v_existing_invoice_id uuid;
  v_invoice_number text;
  v_new_invoice exhibitor_invoices;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  foreach v_pid in array p_event_participation_ids loop
    select e.organizer_organization_id, ep.exhibitor_profile_id into v_org_id, v_profile_id
    from event_participations ep
    join events e on e.id = ep.event_id
    where ep.id = v_pid;

    if v_org_id is null then
      raise exception 'participation not found: %', v_pid;
    end if;

    if not exists (
      select 1 from organizer_memberships m
      where m.organization_id = v_org_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    ) then
      raise exception 'not authorized';
    end if;

    select ep.resolved_price_yen into v_price from event_participations ep where ep.id = v_pid;
    select ei.id into v_existing_invoice_id
      from exhibitor_invoices ei
      where ei.event_participation_id = v_pid
      order by ei.created_at desc
      limit 1;

    if v_price is null then
      event_participation_id := v_pid;
      invoice_id := null;
      amount_yen := null;
      result_status := 'skipped_no_price';
      message := '確定金額が未設定のためスキップしました。';
      return next;
      continue;
    end if;

    if v_existing_invoice_id is not null then
      event_participation_id := v_pid;
      invoice_id := v_existing_invoice_id;
      amount_yen := v_price;
      result_status := 'skipped_existing_invoice';
      message := 'すでに請求書が発行済みのためスキップしました。';
      return next;
      continue;
    end if;

    v_invoice_number := generate_invoice_number(v_org_id, v_profile_id);

    insert into exhibitor_invoices (
      event_participation_id, invoice_file_id, amount_yen, due_date, organizer_internal_memo, created_by_user_id,
      invoice_number, organizer_organization_id
    )
    values (
      v_pid, null, v_price, p_due_date, p_organizer_internal_memo, auth.uid(),
      v_invoice_number, v_org_id
    )
    returning * into v_new_invoice;

    insert into notification_deliveries (event_participation_id, channel, template_type, related_entity_type, related_entity_id, idempotency_key)
    values (
      v_pid, 'email', 'invoice_publish', 'exhibitor_invoice', v_new_invoice.id,
      'invoice_publish:' || v_new_invoice.id
    )
    on conflict (idempotency_key) do nothing;

    insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
    values (auth.uid(), v_org_id, 'create', 'exhibitor_invoice', v_new_invoice.id, to_jsonb(v_new_invoice));

    event_participation_id := v_pid;
    invoice_id := v_new_invoice.id;
    amount_yen := v_new_invoice.amount_yen;
    result_status := 'created';
    message := '請求書を発行しました。';
    return next;
  end loop;
end;
$$;

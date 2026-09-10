-- 0031_phase10_bulk_invoices_fix.sql
-- 0030のcreate_exhibitor_invoices_bulkにあった不具合を修正する。
-- RETURNS TABLE の出力列名 event_participation_id が、関数内で
-- `where event_participation_id = v_pid` のように無条件参照した
-- exhibitor_invoices.event_participation_id 列名と衝突し、
-- 「column reference "event_participation_id" is ambiguous」で
-- 呼び出しが必ず失敗していた（実データでの検証で発覚）。
-- テーブル別名で明示的に修飾して解消する。

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
  v_price integer;
  v_existing_invoice_id uuid;
  v_new_invoice exhibitor_invoices;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  foreach v_pid in array p_event_participation_ids loop
    select e.organizer_organization_id into v_org_id
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

    insert into exhibitor_invoices (
      event_participation_id, invoice_file_id, amount_yen, due_date, organizer_internal_memo, created_by_user_id
    )
    values (
      v_pid, null, v_price, p_due_date, p_organizer_internal_memo, auth.uid()
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

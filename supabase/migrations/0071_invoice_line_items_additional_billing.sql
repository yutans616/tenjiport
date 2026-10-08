-- 0071_invoice_line_items_additional_billing.sql
-- 出展者ごとに請求書を何枚でも発行でき、出展料とオプション品などを別々のタイミングで
-- 請求できるようにする（追加請求）。
--
-- (1) exhibitor_invoices.line_items_json：その請求書で請求した品目
--     [{field_key, label, price_yen, quantity}, ...]。フォームの価格付き選択肢の品目は
--     field_keyに項目キーが入り、「現在の選択内容 − 発行済み請求書の品目」で未請求分を求める。
--     特殊キー：__residual__（確定金額と品目合計の差額）、__adjust__（金額訂正による調整）、
--     __manual__（品目を指定せず金額を手入力した請求）。NULLはこの列の導入前に作られ、
--     品目を復元できなかった請求書。
-- (2) create_exhibitor_invoice：品目と、二重発行防止用の「発行済み合計の想定値」を受け取る。
--     参加者の行をロックしてから発行済み合計を照合し、画面表示後に他の請求書が発行されて
--     いた場合は発行しない（一括発行の二重送信・同時操作で同じ品目を二重請求しないため）。
-- (3) update_invoice_details：金額訂正時に品目（調整行）も更新できるようにする。
-- (4) replace_invoice_pdf：金額訂正後に自動生成PDFを作り直して差し替えるため
--     （attach_invoice_pdfは未添付時のみ添付できる）。
-- (5) 旧一括発行RPC（請求書がある参加者を一律スキップする）は廃止し、一括発行は
--     アプリ側で未請求分を計算してcreate_exhibitor_invoiceを呼ぶ方式にする。

alter table exhibitor_invoices add column line_items_json jsonb;

drop function if exists create_exhibitor_invoice(uuid, uuid, integer, date, text);

create function create_exhibitor_invoice(
  p_event_participation_id uuid,
  p_invoice_file_id uuid,
  p_amount_yen integer,
  p_due_date date,
  p_organizer_internal_memo text default null,
  p_line_items jsonb default null,
  p_expected_invoiced_total integer default null
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
  v_invoiced_total integer;
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

  if p_line_items is not null and jsonb_typeof(p_line_items) <> 'array' then
    raise exception 'line items must be an array';
  end if;

  perform 1 from event_participations where id = p_event_participation_id for update;

  if p_expected_invoiced_total is not null then
    select coalesce(sum(amount_yen), 0) into v_invoiced_total
    from exhibitor_invoices
    where event_participation_id = p_event_participation_id;

    if v_invoiced_total <> p_expected_invoiced_total then
      raise exception 'invoice_state_changed';
    end if;
  end if;

  v_invoice_number := generate_invoice_number(v_org_id, v_profile_id);

  insert into exhibitor_invoices (
    event_participation_id, invoice_file_id, amount_yen, due_date, organizer_internal_memo, created_by_user_id,
    invoice_number, organizer_organization_id, line_items_json
  )
  values (
    p_event_participation_id, p_invoice_file_id, p_amount_yen, p_due_date, p_organizer_internal_memo, auth.uid(),
    v_invoice_number, v_org_id, p_line_items
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

drop function if exists update_invoice_details(uuid, integer, date, text);

create function update_invoice_details(
  p_invoice_id uuid,
  p_amount_yen integer,
  p_due_date date,
  p_organizer_internal_memo text,
  p_line_items jsonb default null
)
returns exhibitor_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_before exhibitor_invoices;
  v_after exhibitor_invoices;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select e.organizer_organization_id into v_org_id
  from exhibitor_invoices inv
  join event_participations ep on ep.id = inv.event_participation_id
  join events e on e.id = ep.event_id
  where inv.id = p_invoice_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  if p_amount_yen < 0 then
    raise exception 'amount must not be negative';
  end if;

  if p_line_items is not null and jsonb_typeof(p_line_items) <> 'array' then
    raise exception 'line items must be an array';
  end if;

  select * into v_before from exhibitor_invoices where id = p_invoice_id;

  update exhibitor_invoices
  set amount_yen = p_amount_yen,
      due_date = p_due_date,
      organizer_internal_memo = p_organizer_internal_memo,
      line_items_json = coalesce(p_line_items, line_items_json)
  where id = p_invoice_id
  returning * into v_after;

  if v_before.amount_yen is distinct from v_after.amount_yen then
    insert into invoice_change_logs (exhibitor_invoice_id, changed_by_user_id, field_changed, old_value, new_value)
    values (p_invoice_id, auth.uid(), 'amount_yen', v_before.amount_yen::text, v_after.amount_yen::text);
  end if;
  if v_before.due_date is distinct from v_after.due_date then
    insert into invoice_change_logs (exhibitor_invoice_id, changed_by_user_id, field_changed, old_value, new_value)
    values (p_invoice_id, auth.uid(), 'due_date', v_before.due_date::text, v_after.due_date::text);
  end if;
  if v_before.organizer_internal_memo is distinct from v_after.organizer_internal_memo then
    insert into invoice_change_logs (exhibitor_invoice_id, changed_by_user_id, field_changed, old_value, new_value)
    values (p_invoice_id, auth.uid(), 'organizer_internal_memo', v_before.organizer_internal_memo, v_after.organizer_internal_memo);
  end if;

  return v_after;
end;
$$;

create or replace function replace_invoice_pdf(p_invoice_id uuid, p_file_asset_id uuid)
returns exhibitor_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_result exhibitor_invoices;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select e.organizer_organization_id into v_org_id
  from exhibitor_invoices inv
  join event_participations ep on ep.id = inv.event_participation_id
  join events e on e.id = ep.event_id
  where inv.id = p_invoice_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  if not exists (select 1 from file_assets where id = p_file_asset_id and organizer_organization_id = v_org_id) then
    raise exception 'not authorized';
  end if;

  update exhibitor_invoices
  set invoice_file_id = p_file_asset_id
  where id = p_invoice_id
  returning * into v_result;

  return v_result;
end;
$$;

drop function if exists create_exhibitor_invoices_bulk(uuid[], date, text);

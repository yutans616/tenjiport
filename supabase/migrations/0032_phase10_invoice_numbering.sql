-- 0032_phase10_invoice_numbering.sql
-- 請求書番号の自動採番（取引先コード-年月-取引先ごとの連番、例：001-202609-001）と、
-- 適格請求書発行事業者登録番号（インボイス制度の登録番号）の組織設定を追加する。
--
-- 取引先コードはexhibitor_profiles単体には持たせない。start_or_resume_submissionが
-- 「ユーザーの既存プロフィールを再利用する」設計のため、同じexhibitor_profileが
-- 複数の主催者組織にまたがって使われうる（別の主催者のイベントにも同じブランドで
-- 出展している場合）。そのため主催者ごとに割り当てるための中間テーブルを設ける。

alter table organizer_bank_accounts add column qualified_invoice_registration_number text;

create table organizer_exhibitor_codes (
  organization_id uuid not null references organizer_organizations(id),
  exhibitor_profile_id uuid not null references exhibitor_profiles(id),
  client_code text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, exhibitor_profile_id)
);
create unique index idx_organizer_exhibitor_codes_org_code on organizer_exhibitor_codes(organization_id, client_code);

alter table organizer_exhibitor_codes enable row level security;

create policy "organizer can select own exhibitor codes"
  on organizer_exhibitor_codes for select
  using (is_organizer_member(organization_id));

alter table exhibitor_invoices add column invoice_number text;
create unique index idx_exhibitor_invoices_number on exhibitor_invoices(invoice_number) where invoice_number is not null;

-- 主催者組織内で3桁の取引先コードを取得または新規採番する。
create or replace function get_or_create_client_code(p_organization_id uuid, p_exhibitor_profile_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_next int;
begin
  select client_code into v_code from organizer_exhibitor_codes
  where organization_id = p_organization_id and exhibitor_profile_id = p_exhibitor_profile_id;
  if v_code is not null then
    return v_code;
  end if;

  -- 採番の競合を避けるため、この組織の採番処理を直列化する。
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':client_code', 0));

  select client_code into v_code from organizer_exhibitor_codes
  where organization_id = p_organization_id and exhibitor_profile_id = p_exhibitor_profile_id;
  if v_code is not null then
    return v_code;
  end if;

  select coalesce(max(client_code::int), 0) + 1 into v_next
  from organizer_exhibitor_codes
  where organization_id = p_organization_id;

  v_code := lpad(v_next::text, 3, '0');

  insert into organizer_exhibitor_codes (organization_id, exhibitor_profile_id, client_code)
  values (p_organization_id, p_exhibitor_profile_id, v_code);

  return v_code;
end;
$$;

-- 請求書番号（取引先コード-発行年月-その取引先への発行回数）を生成する。
create or replace function generate_invoice_number(p_organization_id uuid, p_exhibitor_profile_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_code text;
  v_year_month text;
  v_seq int;
begin
  v_client_code := get_or_create_client_code(p_organization_id, p_exhibitor_profile_id);
  v_year_month := to_char(now(), 'YYYYMM');

  -- 同一取引先・同一年月内の採番を直列化する。
  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_exhibitor_profile_id::text || ':' || v_year_month, 0)
  );

  select count(*) + 1 into v_seq
  from exhibitor_invoices inv
  join event_participations ep on ep.id = inv.event_participation_id
  where ep.exhibitor_profile_id = p_exhibitor_profile_id
    and ep.event_id in (select id from events where organizer_organization_id = p_organization_id)
    and to_char(inv.created_at, 'YYYYMM') = v_year_month;

  return v_client_code || '-' || v_year_month || '-' || lpad(v_seq::text, 3, '0');
end;
$$;

-- create_exhibitor_invoice / create_exhibitor_invoices_bulk 双方に請求書番号の自動採番を追加する。
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
    event_participation_id, invoice_file_id, amount_yen, due_date, organizer_internal_memo, created_by_user_id, invoice_number
  )
  values (
    p_event_participation_id, p_invoice_file_id, p_amount_yen, p_due_date, p_organizer_internal_memo, auth.uid(), v_invoice_number
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
      event_participation_id, invoice_file_id, amount_yen, due_date, organizer_internal_memo, created_by_user_id, invoice_number
    )
    values (
      v_pid, null, v_price, p_due_date, p_organizer_internal_memo, auth.uid(), v_invoice_number
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

-- 自動生成した請求書PDFをfile_assetsとしてアップロードした後、請求書に紐付けるためのRPC。
-- 直接UPDATEはRLSで禁止しているため（invoice_change_logsを経由しない軽微な更新のみここで許可）、
-- 手動アップロード済みの請求書を誤って上書きしないようinvoice_file_idがnullの場合のみ更新する。
create or replace function attach_invoice_pdf(p_invoice_id uuid, p_file_asset_id uuid)
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

  update exhibitor_invoices
  set invoice_file_id = p_file_asset_id
  where id = p_invoice_id and invoice_file_id is null
  returning * into v_result;

  return v_result;
end;
$$;

-- 0010_phase4_invoices.sql
-- Phase 4: 請求書・入金管理
--
-- 設計方針：
--   - exhibitor_invoicesにはannouncementsのような下書き状態を設けない。
--     主催者が金額・支払期限・請求書PDFを揃えて作成した時点で、その出展者にのみ即座に
--     可視化され、Phase 3の通知基盤（notification_deliveries）を再利用して1件だけ通知する。
--   - 「請求書確認状態」（出展者が更新）と「入金状態」（主催者のみ更新）は別カラム・別RPC・
--     別更新者に完全分離する。相互に自動連動させない（ブリーフ7章の要求そのまま）。
--   - 金額・支払期限等の訂正、入金状態の変更は、すべてinvoice_change_logsへ
--     変更者・日時・旧値・新値を強制記録するRPC経由でのみ行う（直接UPDATEはRLSで禁止する）。
--   - 請求書PDFはfile_assetsの既存の仕組み（Service Role経由アップロード、
--     can_access_file_assetでの認可）をそのまま再利用する。

-- ============================================================
-- RLS：exhibitor_invoices（読み取りのみ直接許可。書き込みはRPC経由）
-- ============================================================

create policy "organizer can select invoices in own events"
  on exhibitor_invoices for select
  using (
    exists (
      select 1 from event_participations ep
      join events e on e.id = ep.event_id
      where ep.id = exhibitor_invoices.event_participation_id and is_organizer_member(e.organizer_organization_id)
    )
  );

create policy "exhibitor can select own invoices"
  on exhibitor_invoices for select
  using (
    exists (
      select 1 from event_participations ep
      where ep.id = exhibitor_invoices.event_participation_id and is_exhibitor_member(ep.exhibitor_profile_id)
    )
  );

create policy "organizer can select invoice change logs in own events"
  on invoice_change_logs for select
  using (
    exists (
      select 1 from exhibitor_invoices inv
      join event_participations ep on ep.id = inv.event_participation_id
      join events e on e.id = ep.event_id
      where inv.id = invoice_change_logs.exhibitor_invoice_id and is_organizer_member(e.organizer_organization_id)
    )
  );

-- ============================================================
-- RPC：主催者側
-- ============================================================

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
  v_result exhibitor_invoices;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select e.organizer_organization_id into v_org_id
  from event_participations ep
  join events e on e.id = ep.event_id
  where ep.id = p_event_participation_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  if p_amount_yen < 0 then
    raise exception 'amount must not be negative';
  end if;

  insert into exhibitor_invoices (
    event_participation_id, invoice_file_id, amount_yen, due_date, organizer_internal_memo, created_by_user_id
  )
  values (
    p_event_participation_id, p_invoice_file_id, p_amount_yen, p_due_date, p_organizer_internal_memo, auth.uid()
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

-- 金額・支払期限・内部メモの訂正（変更したフィールドごとにinvoice_change_logsへ1行ずつ記録）
create or replace function update_invoice_details(
  p_invoice_id uuid,
  p_amount_yen integer,
  p_due_date date,
  p_organizer_internal_memo text
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

  select * into v_before from exhibitor_invoices where id = p_invoice_id;

  update exhibitor_invoices
  set amount_yen = p_amount_yen, due_date = p_due_date, organizer_internal_memo = p_organizer_internal_memo
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

-- 入金状態の変更（主催者のみ。請求書確認状態には一切影響しない）
create or replace function update_invoice_payment_status(
  p_invoice_id uuid,
  p_payment_status text,
  p_paid_at timestamptz default null,
  p_note text default null
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

  if p_payment_status not in ('unpaid', 'paid') then
    raise exception 'invalid payment_status: %', p_payment_status;
  end if;

  select e.organizer_organization_id into v_org_id
  from exhibitor_invoices inv
  join event_participations ep on ep.id = inv.event_participation_id
  join events e on e.id = ep.event_id
  where inv.id = p_invoice_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  select * into v_before from exhibitor_invoices where id = p_invoice_id;

  update exhibitor_invoices
  set payment_status = p_payment_status, paid_at = case when p_payment_status = 'paid' then coalesce(p_paid_at, now()) else null end
  where id = p_invoice_id
  returning * into v_after;

  insert into invoice_change_logs (exhibitor_invoice_id, changed_by_user_id, field_changed, old_value, new_value, note)
  values (p_invoice_id, auth.uid(), 'payment_status', v_before.payment_status, v_after.payment_status, p_note);

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, before_json, after_json)
  values (auth.uid(), v_org_id, 'update_payment_status', 'exhibitor_invoice', p_invoice_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

-- ============================================================
-- RPC：出展者側（請求書の内容確認のみ。入金状態は変更不可）
-- ============================================================

create or replace function confirm_invoice(p_invoice_id uuid)
returns exhibitor_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_result exhibitor_invoices;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select ep.exhibitor_profile_id into v_profile_id
  from exhibitor_invoices inv
  join event_participations ep on ep.id = inv.event_participation_id
  where inv.id = p_invoice_id;

  if v_profile_id is null or not is_exhibitor_member(v_profile_id) then
    raise exception 'not authorized';
  end if;

  update exhibitor_invoices
  set invoice_ack_status = 'confirmed', invoice_ack_at = now(), invoice_ack_by_user_id = auth.uid()
  where id = p_invoice_id
  returning * into v_result;

  return v_result;
end;
$$;

-- ============================================================
-- 通知バッチ取得関数を請求書通知にも対応させる（announcement_version / exhibitor_invoice の両対応）
-- ============================================================

create or replace function get_pending_notification_batch(p_limit integer default 20)
returns table (
  delivery_id uuid,
  event_participation_id uuid,
  template_type text,
  related_entity_type text,
  related_entity_id uuid,
  recipient_email text,
  public_form_token uuid,
  announcement_title text,
  announcement_body text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select
    nd.id::uuid,
    nd.event_participation_id::uuid,
    nd.template_type::text,
    nd.related_entity_type::text,
    nd.related_entity_id::uuid,
    u.email::text,
    e.public_form_token::uuid,
    coalesce(av.title, '請求書のご案内')::text,
    coalesce(av.body, '請求書と支払期限をご確認ください。')::text,
    nd.attempt_count::integer
  from notification_deliveries nd
  join event_participations ep on ep.id = nd.event_participation_id
  join events e on e.id = ep.event_id
  join exhibitor_memberships m on m.exhibitor_profile_id = ep.exhibitor_profile_id and m.role = 'owner' and m.status = 'active'
  join auth.users u on u.id = m.user_id
  left join announcement_versions av on av.id = nd.related_entity_id and nd.related_entity_type = 'announcement_version'
  where nd.status = 'pending'
  order by nd.created_at
  limit p_limit;
end;
$$;

revoke execute on function get_pending_notification_batch(integer) from public;
revoke execute on function get_pending_notification_batch(integer) from anon;
revoke execute on function get_pending_notification_batch(integer) from authenticated;
grant execute on function get_pending_notification_batch(integer) to service_role;

-- ============================================================
-- 請求書PDFへのアクセス可否も can_access_file_asset に追加する
-- ============================================================

create or replace function can_access_file_asset(p_file_asset_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select organizer_organization_id into v_org_id from file_assets where id = p_file_asset_id;
  if v_org_id is not null and is_organizer_member(v_org_id) then
    return true;
  end if;

  if exists (
    select 1
    from announcement_attachments att
    join announcement_versions av on av.id = att.announcement_version_id
    join announcements a on a.id = av.announcement_id
    join announcement_audiences aud on aud.announcement_version_id = av.id
    join event_participations ep on ep.event_id = a.event_id
    join exhibitor_memberships m on m.exhibitor_profile_id = ep.exhibitor_profile_id
    where att.file_asset_id = p_file_asset_id
      and av.status = 'published'
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (
        aud.audience_type = 'all'
        or (aud.audience_type = 'individual' and ep.id = any (aud.event_participation_ids))
      )
  ) then
    return true;
  end if;

  return exists (
    select 1
    from exhibitor_invoices inv
    join event_participations ep on ep.id = inv.event_participation_id
    join exhibitor_memberships m on m.exhibitor_profile_id = ep.exhibitor_profile_id
    where inv.invoice_file_id = p_file_asset_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
end;
$$;

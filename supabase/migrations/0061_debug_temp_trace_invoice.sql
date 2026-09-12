-- 0061_debug_temp_trace_invoice.sql
-- 一時デバッグ用。0060適用後もcreate_exhibitor_invoiceがorganizer_organization_idに
-- NULLを書き込もうとするエラーが再現するため、実行時のv_org_idの実際の値を
-- 直接記録して原因を切り分ける。原因判明後、次のマイグレーションで削除する。

create table if not exists debug_trace (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table debug_trace enable row level security;

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

  insert into debug_trace (label, payload)
  values ('create_exhibitor_invoice', jsonb_build_object(
    'p_event_participation_id', p_event_participation_id,
    'v_org_id', v_org_id,
    'v_profile_id', v_profile_id
  ));

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

-- 0024_phase9_invoice_reminder.sql
-- 請求書の再請求（リマインド）通知。notification_deliveries.template_typeには
-- 元々 'invoice_reminder' が予約されていたが、修正依頼と同様に一度も
-- 実装されていなかった。未入金の請求書に対して、その場で再通知できるようにする。

create or replace function resend_invoice_reminder(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_invoice exhibitor_invoices;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_invoice from exhibitor_invoices where id = p_invoice_id;
  if v_invoice.id is null then
    raise exception '請求書が見つかりません。';
  end if;

  select e.organizer_organization_id into v_org_id
  from event_participations ep
  join events e on e.id = ep.event_id
  where ep.id = v_invoice.event_participation_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  if v_invoice.payment_status = 'paid' then
    raise exception '入金済みの請求書には再請求できません。';
  end if;

  insert into notification_deliveries (event_participation_id, channel, template_type, related_entity_type, related_entity_id, idempotency_key)
  values (
    v_invoice.event_participation_id,
    'email',
    'invoice_reminder',
    'exhibitor_invoice',
    p_invoice_id,
    'invoice_reminder:' || p_invoice_id || ':' || extract(epoch from now())::bigint
  );
end;
$$;

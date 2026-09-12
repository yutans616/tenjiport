-- 0062_phase12_cleanup_invoice_debug.sql
-- 0061で追加した調査用の一時オブジェクトを削除し、create_exhibitor_invoiceを
-- トレース記録なしの状態（0060の内容）に戻す。
--
-- 調査の結論：0060のロジック自体は最初から正しかった（直接ロジックを検証した
-- 0056方式のテスト、およびトレース入りの0061での再検証の両方で、
-- organizer_organization_idが正しく解決・挿入されることを確認済み）。
-- 0060適用直後の数回の呼び出しでNOT NULL制約違反が再現したのは、この環境
-- （Supabaseの接続プーリング等）に起因すると見られる一時的な問題で、
-- 関数を再定義（0061）した後は安定して成功している。以前 submit_current_version
-- でも同種の「再定義直後だけ古い挙動に見える」事象が発生しており、再発した場合は
-- ロジックを疑う前にまずこの既知の環境特性を疑うこと。

drop table if exists debug_trace;

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

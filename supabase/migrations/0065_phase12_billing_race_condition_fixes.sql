-- 0065_phase12_billing_race_condition_fixes.sql
-- 全体バグ点検で見つかった、決済まわりの競合状態を修正する。
--
-- 返金処理（refundServiceInvoiceAction）は、残額の判定（SELECT）とrefunded_amount_yenの
-- 加算（UPDATE）が別々のステートメントで、行ロックもDB制約も無かった。管理者が同じ
-- 請求書に対して同時に2回操作すると、両方が同じ古いrefunded_amount_yenを読んで
-- 判定をパスし、Stripe側では2件の実返金が成立し得るのに、ローカルの加算は
-- 非原子的なためロストアップデートが起きる（記録される返金額が実際より少なくなる）。
--
-- 「残額予約」を1つのUPDATE文（WHERE句に残額チェックを含む）で原子的に行うAPIを
-- 用意し、Stripe呼び出しの前に必ずこれを通す設計に変更する。予約後にStripe側の
-- 呼び出しが失敗した場合は release 関数で予約を戻す。

create or replace function reserve_service_invoice_refund(p_invoice_id uuid, p_amount_yen integer)
returns service_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result service_invoices;
begin
  if p_amount_yen is null or p_amount_yen <= 0 then
    raise exception 'amount must be positive';
  end if;

  update service_invoices
  set
    refunded_amount_yen = refunded_amount_yen + p_amount_yen,
    status = case when refunded_amount_yen + p_amount_yen >= total_amount_yen then 'refunded' else status end
  where id = p_invoice_id
    and status = 'charged'
    and stripe_payment_intent_id is not null
    and refunded_amount_yen + p_amount_yen <= total_amount_yen
  returning * into v_result;

  return v_result;
end;
$$;

-- Stripe側の返金呼び出しが失敗した場合に、予約した金額を戻す。
create or replace function release_service_invoice_refund_reservation(p_invoice_id uuid, p_amount_yen integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update service_invoices
  set
    refunded_amount_yen = greatest(refunded_amount_yen - p_amount_yen, 0),
    status = case
      when status = 'refunded' and refunded_amount_yen - p_amount_yen < total_amount_yen then 'charged'
      else status
    end
  where id = p_invoice_id;
end;
$$;

-- 管理画面（サービスロール）からのみ呼ぶ内部関数。他のRPCと違い、一般セッションから
-- 直接叩かれると残額チェックを経ずに任意の金額を予約されてしまうため制限する。
revoke execute on function reserve_service_invoice_refund(uuid, integer) from public, anon, authenticated;
revoke execute on function release_service_invoice_refund_reservation(uuid, integer) from public, anon, authenticated;

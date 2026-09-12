"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/admin/context";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createStripeClient } from "@/lib/stripe";
import { notifyRefundIssued } from "@/lib/billing/notifyOrganizer";

// 年間プラン「請求書払い」（銀行振込）の入金確認。Stripe Webhookを経由しないため
// finalized→chargedの遷移をここで手動で行う（それ以外のservice_invoicesの状態遷移は
// すべてWebhook経由のため、対象をcharge_kind='annual_fee'かつdue_dateがある行に限定する）。
export async function markServiceInvoicePaidAction(orgId: string, invoiceId: string, formData: FormData) {
  const adminUser = await requirePlatformAdmin();
  const serviceClient = createServiceRoleClient();

  const paidAtRaw = String(formData.get("paid_at") ?? "").trim();
  const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();

  const { data: invoice } = await serviceClient
    .from("service_invoices")
    .select("id, charge_kind, status, due_date")
    .eq("id", invoiceId)
    .eq("organizer_organization_id", orgId)
    .single();
  if (!invoice) redirect(`/admin/organizations/${orgId}?adminError=invoice_not_found`);
  if (invoice.charge_kind !== "annual_fee" || !invoice.due_date) {
    redirect(`/admin/organizations/${orgId}?adminError=not_eligible_for_manual_payment`);
  }
  if (invoice.status !== "finalized") redirect(`/admin/organizations/${orgId}?adminError=already_processed`);

  const { error: updateError } = await serviceClient
    .from("service_invoices")
    .update({ status: "charged", charged_at: paidAt.toISOString() })
    .eq("id", invoiceId);
  if (updateError) {
    console.error(`markServiceInvoicePaidAction: update failed for ${invoiceId}:`, updateError.message);
    redirect(`/admin/organizations/${orgId}?adminError=update_failed`);
  }

  await serviceClient.from("audit_logs").insert({
    actor_user_id: adminUser.id,
    organization_id: orgId,
    action_type: "mark_service_invoice_paid",
    entity_type: "service_invoice",
    entity_id: invoiceId,
    after_json: { paid_at: paidAt.toISOString() },
  });

  revalidatePath(`/admin/organizations/${orgId}`);
  revalidatePath("/admin/organizations");
  revalidatePath("/admin");
}

// TenjiPort利用料請求（service_invoices）の返金。全額・部分返金の両方に対応する。
// 返金額が請求額（の未返金残り）に達した時点でのみstatus='refunded'に遷移させる
// （新しい中間ステータスは増やさず、refunded_amount_yenとの差分で判別する設計）。
//
// 残額の判定とrefunded_amount_yenの加算を、reserve_service_invoice_refund
// （1つのUPDATE文でWHERE句に残額チェックを含む原子的な操作）で先に確定させてから
// Stripeを呼ぶ。二重クリックや複数タブからの同時操作でも、後から予約しようとした
// 側は残額不足として確実に弾かれる（読み取り→判定→書き込みが別ステートメントに
// 分かれていた旧実装のロストアップデートを防ぐ）。Stripe呼び出しが失敗した場合は
// release_service_invoice_refund_reservationで予約を戻す。
export async function refundServiceInvoiceAction(orgId: string, invoiceId: string, formData: FormData) {
  const adminUser = await requirePlatformAdmin();
  const serviceClient = createServiceRoleClient();

  const reason = String(formData.get("reason") ?? "").trim();
  const amountRaw = Number(formData.get("amount_yen"));
  if (!reason) redirect(`/admin/organizations/${orgId}?adminError=reason_required`);
  if (!Number.isFinite(amountRaw) || amountRaw <= 0) redirect(`/admin/organizations/${orgId}?adminError=invalid_amount`);
  const amountYen = Math.round(amountRaw);

  const { data: invoiceBefore } = await serviceClient
    .from("service_invoices")
    .select("id, event_id, events(name)")
    .eq("id", invoiceId)
    .eq("organizer_organization_id", orgId)
    .single();
  if (!invoiceBefore) redirect(`/admin/organizations/${orgId}?adminError=invoice_not_found`);

  const { data: reserved, error: reserveError } = await serviceClient.rpc("reserve_service_invoice_refund", {
    p_invoice_id: invoiceId,
    p_amount_yen: amountYen,
  });
  // ガード条件（残額チェック）に一致する行が無かった場合、RPCはSQL NULLではなく
  // 全フィールドがnullの行オブジェクトを返す（PostgRESTのcomposite戻り値の挙動）。
  // reservedの真偽値だけで判定すると常にtruthyになり素通りしてしまうため、
  // 主キーの有無で判定する。
  if (reserveError || !reserved?.id) {
    redirect(`/admin/organizations/${orgId}?adminError=refund_amount_exceeds_remaining`);
  }

  const stripe = createStripeClient();
  let refund;
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: reserved.stripe_payment_intent_id!,
        amount: amountYen,
        metadata: { reason, service_invoice_id: invoiceId },
      },
      { idempotencyKey: `refund:${invoiceId}:${amountYen}:${Date.now()}` },
    );
  } catch (err) {
    // Stripe側が失敗した場合、予約した残額を必ず戻す（二重に残額を消費したままにしない）。
    await serviceClient.rpc("release_service_invoice_refund_reservation", {
      p_invoice_id: invoiceId,
      p_amount_yen: amountYen,
    });
    console.error(`refundServiceInvoiceAction: stripe refund failed for ${invoiceId}:`, err);
    redirect(`/admin/organizations/${orgId}?adminError=stripe_refund_failed`);
    return;
  }

  const { error: insertError } = await serviceClient.from("service_invoice_refunds").insert({
    service_invoice_id: invoiceId,
    amount_yen: amountYen,
    reason,
    stripe_refund_id: refund.id,
    created_by: adminUser.id,
  });
  if (insertError) {
    // Stripe側の返金は既に成立しているため、記録の保存失敗だけで予約を戻すと
    // 二重返金の危険がある。記録漏れはログに残し、運用で手動対応する。
    console.error(`service_invoice_refunds insert failed for ${invoiceId}:`, insertError.message);
  }

  const isFullRefund = reserved.refunded_amount_yen >= reserved.total_amount_yen;

  await serviceClient.from("audit_logs").insert({
    actor_user_id: adminUser.id,
    organization_id: orgId,
    action_type: "refund_service_invoice",
    entity_type: "service_invoice",
    entity_id: invoiceId,
    after_json: { amount_yen: amountYen, reason, stripe_refund_id: refund.id, is_full_refund: isFullRefund },
  });

  const event = Array.isArray(invoiceBefore.events) ? invoiceBefore.events[0] : invoiceBefore.events;
  await notifyRefundIssued({
    organizationId: orgId,
    eventName: event?.name ?? "（不明なイベント）",
    amountYen,
    isFullRefund,
  });

  revalidatePath(`/admin/organizations/${orgId}`);
  revalidatePath("/admin/organizations");
  revalidatePath("/admin");
}

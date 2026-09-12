"use server";

import { revalidatePath } from "next/cache";
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
  if (!invoice) throw new Error("請求書が見つかりません。");
  if (invoice.charge_kind !== "annual_fee" || !invoice.due_date) {
    throw new Error("この請求書は入金確認の対象ではありません。");
  }
  if (invoice.status !== "finalized") throw new Error("この請求書は既に処理済みです。");

  await serviceClient
    .from("service_invoices")
    .update({ status: "charged", charged_at: paidAt.toISOString() })
    .eq("id", invoiceId);

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
export async function refundServiceInvoiceAction(orgId: string, invoiceId: string, formData: FormData) {
  const adminUser = await requirePlatformAdmin();
  const serviceClient = createServiceRoleClient();

  const reason = String(formData.get("reason") ?? "").trim();
  const amountRaw = Number(formData.get("amount_yen"));
  if (!reason) throw new Error("返金理由は必須です。");
  if (!Number.isFinite(amountRaw) || amountRaw <= 0) throw new Error("返金額を正しく入力してください。");
  const amountYen = Math.round(amountRaw);

  const { data: invoice } = await serviceClient
    .from("service_invoices")
    .select("id, organizer_organization_id, event_id, total_amount_yen, refunded_amount_yen, status, stripe_payment_intent_id, events(name)")
    .eq("id", invoiceId)
    .eq("organizer_organization_id", orgId)
    .single();
  if (!invoice) throw new Error("請求書が見つかりません。");
  if (invoice.status !== "charged") throw new Error("課金済みの請求書のみ返金できます。");
  if (!invoice.stripe_payment_intent_id) throw new Error("この請求書には決済情報が紐づいていません。");

  const remaining = invoice.total_amount_yen - invoice.refunded_amount_yen;
  if (amountYen > remaining) {
    throw new Error(`返金額は残額（¥${remaining.toLocaleString("ja-JP")}）以下にしてください。`);
  }

  const stripe = createStripeClient();
  const refund = await stripe.refunds.create(
    {
      payment_intent: invoice.stripe_payment_intent_id,
      amount: amountYen,
      metadata: { reason, service_invoice_id: invoiceId },
    },
    { idempotencyKey: `refund:${invoiceId}:${Date.now()}` },
  );

  const { error: insertError } = await serviceClient.from("service_invoice_refunds").insert({
    service_invoice_id: invoiceId,
    amount_yen: amountYen,
    reason,
    stripe_refund_id: refund.id,
    created_by: adminUser.id,
  });
  if (insertError) throw new Error(`返金記録の保存に失敗しました: ${insertError.message}`);

  const newRefundedAmount = invoice.refunded_amount_yen + amountYen;
  const isFullRefund = newRefundedAmount >= invoice.total_amount_yen;
  await serviceClient
    .from("service_invoices")
    .update({
      refunded_amount_yen: newRefundedAmount,
      ...(isFullRefund ? { status: "refunded" } : {}),
    })
    .eq("id", invoiceId);

  await serviceClient.from("audit_logs").insert({
    actor_user_id: adminUser.id,
    organization_id: orgId,
    action_type: "refund_service_invoice",
    entity_type: "service_invoice",
    entity_id: invoiceId,
    after_json: { amount_yen: amountYen, reason, stripe_refund_id: refund.id, is_full_refund: isFullRefund },
  });

  const event = Array.isArray(invoice.events) ? invoice.events[0] : invoice.events;
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

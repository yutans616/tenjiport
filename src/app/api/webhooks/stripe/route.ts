import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { createStripeClient } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { notifyBillingRetriesExhausted, notifyChargeFailed, notifyChargeSucceeded } from "@/lib/billing/notifyOrganizer";
import { generateAndAttachServiceInvoicePdf } from "@/lib/billing/generateServiceInvoiceDocument";
import { MAX_RETRY_COUNT } from "@/lib/billing/runEventBilling";

// service_invoicesの状態を更新し、対応するpayment_events行をprocessedにする。
// service_invoice_idがmetadataに無い（このアプリが発行したPaymentIntentではない）
// 場合は何もせずignoredとして扱う。
async function reflectPaymentIntentResult(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  paymentEventId: string,
  paymentIntent: Stripe.PaymentIntent,
  outcome: "charged" | "failed",
) {
  const invoiceId = paymentIntent.metadata?.service_invoice_id;
  if (!invoiceId) {
    await serviceClient
      .from("payment_events")
      .update({ processing_status: "ignored", processed_at: new Date().toISOString() })
      .eq("id", paymentEventId);
    return;
  }

  const { data: invoice } = await serviceClient
    .from("service_invoices")
    .select("id, organizer_organization_id, total_amount_yen, event_id, status, retry_count, stripe_payment_intent_id, events(name)")
    .eq("id", invoiceId)
    .single();
  if (!invoice) {
    await serviceClient
      .from("payment_events")
      .update({ processing_status: "ignored", processed_at: new Date().toISOString() })
      .eq("id", paymentEventId);
    return;
  }

  // Stripeはwebhookの配信順序を保証しない。attemptChargeはリトライのたびに新しい
  // PaymentIntentを作りstripe_payment_intent_idを都度上書きするため、古いリトライの
  // 失敗イベントが新しいリトライの成功イベントより後に届くと、正しく確定済みの状態を
  // 誤って巻き戻してしまう。このイベントが請求書の「現在の」試行に対するものでない
  // 場合は、状態を変更せずignoredとして扱う。
  if (invoice.stripe_payment_intent_id !== paymentIntent.id) {
    await serviceClient
      .from("payment_events")
      .update({ processing_status: "ignored", processed_at: new Date().toISOString(), related_service_invoice_id: invoiceId })
      .eq("id", paymentEventId);
    return;
  }

  // 失敗の場合、既にuncollectible（自動リトライ打ち切り済み）なら再度「打ち切り」扱いにはせず
  // statusもuncollectibleのまま維持する（手動再試行が再び失敗しただけのケース）。
  // まだ打ち切っていない請求が、このリトライで上限（retry_countは課金試行時に既に加算済み）に
  // 達していればuncollectibleへ遷移し、専用の通知を一度だけ送る。
  const alreadyUncollectible = invoice.status === "uncollectible";
  const isExhausting = outcome === "failed" && !alreadyUncollectible && invoice.retry_count >= MAX_RETRY_COUNT;
  const finalStatus = outcome === "charged" ? "charged" : alreadyUncollectible ? "uncollectible" : isExhausting ? "uncollectible" : "failed";

  await serviceClient
    .from("service_invoices")
    .update({
      status: finalStatus,
      charged_at: outcome === "charged" ? new Date().toISOString() : null,
      payment_event_id: paymentEventId,
    })
    .eq("id", invoiceId);

  await serviceClient
    .from("payment_events")
    .update({
      processing_status: "processed",
      processed_at: new Date().toISOString(),
      related_service_invoice_id: invoiceId,
    })
    .eq("id", paymentEventId);

  const event = Array.isArray(invoice.events) ? invoice.events[0] : invoice.events;
  const eventName = event?.name ?? "（不明なイベント）";
  if (outcome === "charged") {
    await generateAndAttachServiceInvoicePdf(serviceClient, invoiceId);
    await notifyChargeSucceeded({
      organizationId: invoice.organizer_organization_id,
      eventName,
      totalAmountYen: invoice.total_amount_yen,
    });
  } else if (isExhausting) {
    await notifyBillingRetriesExhausted({
      organizationId: invoice.organizer_organization_id,
      eventName,
      totalAmountYen: invoice.total_amount_yen,
    });
  } else {
    await notifyChargeFailed({
      organizationId: invoice.organizer_organization_id,
      eventName,
      totalAmountYen: invoice.total_amount_yen,
    });
  }
}

// Stripe Webhook受信エンドポイント。署名検証 → payment_events への冪等な記録 →
// イベント種別に応じた業務処理（自動課金結果のservice_invoicesへの反映）を行う。
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = createStripeClient();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: `signature verification failed: ${err}` }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();

  // provider_event_id の一意制約により、Stripeからの再送でも二重処理しない。
  const { data: paymentEvent, error: insertError } = await serviceClient
    .from("payment_events")
    .insert({
      provider: "stripe",
      provider_event_id: event.id,
      event_type: event.type,
      payload_json: event as unknown as Record<string, unknown>,
      processing_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !paymentEvent) {
    // unique制約違反 = 既知の重複配信。副作用を再実行せずそのまま200を返す。
    if (insertError?.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json({ error: insertError?.message }, { status: 500 });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      await reflectPaymentIntentResult(serviceClient, paymentEvent.id, event.data.object as Stripe.PaymentIntent, "charged");
    } else if (event.type === "payment_intent.payment_failed") {
      await reflectPaymentIntentResult(serviceClient, paymentEvent.id, event.data.object as Stripe.PaymentIntent, "failed");
    } else {
      await serviceClient
        .from("payment_events")
        .update({ processing_status: "ignored", processed_at: new Date().toISOString() })
        .eq("id", paymentEvent.id);
    }
  } catch (err) {
    // Stripe側の再送ループを避けるため、処理失敗時もHTTP 200を返す。
    console.error(`stripe webhook: failed to process event ${event.id} (${event.type}):`, err);
    await serviceClient.from("payment_events").update({ processing_status: "error" }).eq("id", paymentEvent.id);
  }

  return NextResponse.json({ received: true });
}

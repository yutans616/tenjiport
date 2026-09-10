import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createStripeClient } from "@/lib/stripe";
import { notifyChargeFailed, notifyInvoiceAwaitingPaymentMethod } from "./notifyOrganizer";

const GRACE_PERIOD_DAYS = 1;
const RETRY_INTERVAL_DAYS = 3;
const MAX_RETRY_COUNT = 3;

type ServiceInvoiceRow = {
  id: string;
  organizer_organization_id: string;
  event_id: string | null;
  total_amount_yen: number;
  status: string;
  retry_count: number;
  stripe_payment_intent_id: string | null;
};

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// 確定済み（finalized・課金未試行）または前回失敗（failed）の請求に対してカード課金を
// 試みる。成功・失敗の最終的な状態遷移はWebhook側（payment_intent.succeeded /
// payment_intent.payment_failed）に一本化し、ここでは同期的なエラーはログのみに
// 留める（二重更新・通知の重複を避けるため）。
export async function attemptCharge(invoice: ServiceInvoiceRow, eventName: string) {
  const serviceClient = createServiceRoleClient();

  const { data: org } = await serviceClient
    .from("organizer_organizations")
    .select("payment_provider_customer_id, stripe_default_payment_method_id")
    .eq("id", invoice.organizer_organization_id)
    .single();

  const nextRetryCount = invoice.retry_count + 1;

  if (!org?.payment_provider_customer_id || !org?.stripe_default_payment_method_id) {
    await serviceClient
      .from("service_invoices")
      .update({ retry_count: nextRetryCount, last_charge_attempt_at: new Date().toISOString() })
      .eq("id", invoice.id);
    await notifyInvoiceAwaitingPaymentMethod({
      organizationId: invoice.organizer_organization_id,
      eventName,
      totalAmountYen: invoice.total_amount_yen,
    });
    return;
  }

  const stripe = createStripeClient();
  try {
    // JPYはゼロ小数通貨のため、金額はそのまま円単位で渡す（100倍しない）。
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: invoice.total_amount_yen,
        currency: "jpy",
        customer: org.payment_provider_customer_id,
        payment_method: org.stripe_default_payment_method_id,
        off_session: true,
        confirm: true,
        metadata: { service_invoice_id: invoice.id },
      },
      { idempotencyKey: `charge_invoice:${invoice.id}:${nextRetryCount}` },
    );

    await serviceClient
      .from("service_invoices")
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        retry_count: nextRetryCount,
        last_charge_attempt_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
  } catch (err) {
    // カードエラー等の同期例外。PaymentIntentが実際に作成されていればStripe側で
    // payment_intent.payment_failed webhookが飛び、そちらでstatus='failed'に遷移する。
    // ここでは記録のみ行い、statusの更新はWebhookに任せる。
    const stripePaymentIntentId =
      err && typeof err === "object" && "payment_intent" in err
        ? ((err as { payment_intent?: { id?: string } }).payment_intent?.id ?? null)
        : null;
    await serviceClient
      .from("service_invoices")
      .update({
        stripe_payment_intent_id: stripePaymentIntentId ?? invoice.stripe_payment_intent_id,
        retry_count: nextRetryCount,
        last_charge_attempt_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
    console.error(`event billing: charge attempt failed for invoice ${invoice.id}:`, err);
    if (!stripePaymentIntentId) {
      // PaymentIntent自体が作られなかった（webhookも来ない）ケースのみ、ここから直接通知する。
      await notifyChargeFailed({
        organizationId: invoice.organizer_organization_id,
        eventName,
        totalAmountYen: invoice.total_amount_yen,
      });
    }
  }
}

export async function runEventBilling() {
  const serviceClient = createServiceRoleClient();
  const results: { eventId: string; eventName: string; invoiceId: string; action: string }[] = [];

  // 1) まだ請求が確定していない、終了済み（猶予1日）・非下書きイベントを確定させる。
  const cutoff = daysAgo(GRACE_PERIOD_DAYS).toISOString().slice(0, 10);
  const { data: candidateEvents } = await serviceClient
    .from("events")
    .select("id, name, organizer_organization_id, end_date")
    .not("end_date", "is", null)
    .lte("end_date", cutoff)
    .neq("status", "draft");

  const { data: activeContracts } = await serviceClient
    .from("service_contracts")
    .select("organizer_organization_id")
    .eq("status", "active")
    .eq("plan_type", "standard");
  const orgsWithActiveStandardContract = new Set((activeContracts ?? []).map((c) => c.organizer_organization_id));

  const { data: alreadyInvoiced } = await serviceClient.from("service_invoices").select("event_id").not("event_id", "is", null);
  const invoicedEventIds = new Set((alreadyInvoiced ?? []).map((r) => r.event_id));

  const eligibleEvents = (candidateEvents ?? []).filter(
    (e) => orgsWithActiveStandardContract.has(e.organizer_organization_id) && !invoicedEventIds.has(e.id),
  );

  for (const event of eligibleEvents) {
    const { data: invoice, error } = await serviceClient.rpc("finalize_event_service_invoice", { p_event_id: event.id });
    if (error || !invoice) {
      if (error) console.error(`event billing: finalize failed for event ${event.id}:`, error.message);
      continue;
    }
    const typedInvoice = invoice as ServiceInvoiceRow;
    // finalize_event_service_invoiceは冪等（既存行があればそれを返す）ため、
    // 万一すでに課金試行済み・完了済みの請求が返ってきた場合は二重課金を避けて何もしない。
    if (typedInvoice.status !== "finalized" && typedInvoice.status !== "failed") {
      continue;
    }
    await attemptCharge(typedInvoice, event.name);
    results.push({ eventId: event.id, eventName: event.name, invoiceId: typedInvoice.id, action: "finalized_and_charged" });
  }

  // 2) 未課金（finalized・カード未登録等）または失敗（failed）の請求を、間隔をあけて自動再試行する。
  const retryBefore = daysAgo(RETRY_INTERVAL_DAYS).toISOString();
  const { data: retryCandidates } = await serviceClient
    .from("service_invoices")
    .select("id, organizer_organization_id, event_id, total_amount_yen, status, retry_count, stripe_payment_intent_id, events(name)")
    .in("status", ["finalized", "failed"])
    .lt("retry_count", MAX_RETRY_COUNT)
    .or(`last_charge_attempt_at.is.null,last_charge_attempt_at.lte.${retryBefore}`);

  for (const row of retryCandidates ?? []) {
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    await attemptCharge(row as ServiceInvoiceRow, event?.name ?? "（不明なイベント）");
    results.push({ eventId: row.event_id ?? "", eventName: event?.name ?? "", invoiceId: row.id, action: "retried" });
  }

  return results;
}

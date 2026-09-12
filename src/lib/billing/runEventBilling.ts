import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createStripeClient } from "@/lib/stripe";
import { notifyBillingRetriesExhausted, notifyChargeFailed, notifyInvoiceAwaitingPaymentMethod } from "./notifyOrganizer";

const GRACE_PERIOD_DAYS = 1;
const RETRY_INTERVAL_DAYS = 3;
export const MAX_RETRY_COUNT = 3;

export type ServiceInvoiceRow = {
  id: string;
  organizer_organization_id: string;
  event_id: string | null;
  charge_kind?: string;
  total_amount_yen: number;
  status: string;
  retry_count: number;
  stripe_payment_intent_id: string | null;
};

export type AttemptChargeOutcome =
  | { outcome: "skipped_zero_amount" }
  | { outcome: "no_payment_method" }
  | { outcome: "charge_attempted"; paymentIntentStatus: string; paymentIntentId: string }
  | { outcome: "charge_error"; paymentIntentId: string | null };

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// events.end_dateは（JST基準で運用されるイベントの）タイムゾーン無しのdate型のため、
// サーバーの実行タイムゾーン（Vercelは既定でUTC）に関わらずJSTの暦日で比較する必要がある。
// 現状のcron実行時刻（毎日0:00 UTC=9:00 JST）ではUTC暦日とJST暦日がたまたま常に一致するため
// 実害は出ていないが、cronの実行時刻が変わった場合に暦日がずれるのを防ぐため明示的に計算する。
function daysAgoJstDateString(days: number): string {
  const instant = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(instant);
}

// 確定済み（finalized・課金未試行）または前回失敗（failed）の請求に対してカード課金を
// 試みる。成功・失敗の最終的な状態遷移はWebhook側（payment_intent.succeeded /
// payment_intent.payment_failed）に一本化し、ここでは同期的なエラーはログのみに
// 留める（二重更新・通知の重複を避けるため）。呼び出し元が結果を見て判断できるよう
// 戻り値で結果を返す（例: イベント作成時の即時課金では失敗時に作成をロールバックする）。
// offSession: cronからの自動課金（顧客不在）はtrue、イベント作成時のような顧客が
// 操作中の即時課金はfalseで呼ぶ（Stripeの推奨に合わせる）。
export async function attemptCharge(
  invoice: ServiceInvoiceRow,
  eventName: string,
  offSession: boolean = true,
): Promise<AttemptChargeOutcome> {
  const serviceClient = createServiceRoleClient();

  if (invoice.total_amount_yen <= 0) {
    return { outcome: "skipped_zero_amount" };
  }

  const { data: org } = await serviceClient
    .from("organizer_organizations")
    .select("payment_provider_customer_id, stripe_default_payment_method_id")
    .eq("id", invoice.organizer_organization_id)
    .single();

  const nextRetryCount = invoice.retry_count + 1;
  // このリトライで上限に達し、かつまだuncollectibleに遷移していない場合のみ「打ち切り」扱いにする
  // （すでにuncollectibleな請求への手動再試行が再度失敗しても、毎回この通知を送り直さないため）。
  const isExhausting = nextRetryCount >= MAX_RETRY_COUNT && invoice.status !== "uncollectible";

  if (!org?.payment_provider_customer_id || !org?.stripe_default_payment_method_id) {
    await serviceClient
      .from("service_invoices")
      .update({
        retry_count: nextRetryCount,
        last_charge_attempt_at: new Date().toISOString(),
        ...(isExhausting ? { status: "uncollectible" } : {}),
      })
      .eq("id", invoice.id);
    if (isExhausting) {
      await notifyBillingRetriesExhausted({
        organizationId: invoice.organizer_organization_id,
        eventName,
        totalAmountYen: invoice.total_amount_yen,
      });
    } else {
      await notifyInvoiceAwaitingPaymentMethod({
        organizationId: invoice.organizer_organization_id,
        eventName,
        totalAmountYen: invoice.total_amount_yen,
      });
    }
    return { outcome: "no_payment_method" };
  }

  const stripe = createStripeClient();
  try {
    // JPYはゼロ小数通貨のため、金額はそのまま円単位で渡す（100倍しない）。
    // allow_redirects:'never' でリダイレクト系決済手段（3DS等の追加認証を要する場合を含む）を
    // 明示的に無効化する。保存済みカードへの単純な即時課金のみを想定しており、
    // 今回のスコープでは追加認証が必要なケースも「課金失敗」として扱う（本格的な3DS対応は別途）。
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: invoice.total_amount_yen,
        currency: "jpy",
        customer: org.payment_provider_customer_id,
        payment_method: org.stripe_default_payment_method_id,
        off_session: offSession,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
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

    return { outcome: "charge_attempted", paymentIntentStatus: paymentIntent.status, paymentIntentId: paymentIntent.id };
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
        ...(!stripePaymentIntentId && isExhausting ? { status: "uncollectible" } : {}),
      })
      .eq("id", invoice.id);
    console.error(`event billing: charge attempt failed for invoice ${invoice.id}:`, err);
    if (!stripePaymentIntentId) {
      // PaymentIntent自体が作られなかった（webhookも来ない）ケースのみ、ここから直接通知する。
      if (isExhausting) {
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
    return { outcome: "charge_error", paymentIntentId: stripePaymentIntentId };
  }
}

export async function runEventBilling() {
  const serviceClient = createServiceRoleClient();
  const results: { eventId: string; eventName: string; invoiceId: string; action: string }[] = [];

  // 1) まだ請求が確定していない、終了済み（猶予1日）・非下書きイベントを確定させる。
  const cutoff = daysAgoJstDateString(GRACE_PERIOD_DAYS);
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
  // 運営者アカウント（billing_exempt）は課金対象外。既存の契約が残っていても除外する。
  const { data: exemptOrgs } = await serviceClient.from("organizer_organizations").select("id").eq("billing_exempt", true);
  const exemptOrgIds = new Set((exemptOrgs ?? []).map((o) => o.id));
  const orgsWithActiveStandardContract = new Set(
    (activeContracts ?? []).map((c) => c.organizer_organization_id).filter((id) => !exemptOrgIds.has(id)),
  );

  // 「超過分」の確認が既に済んでいるイベントだけを除外する（base_fee行はイベント作成時に
  // 作られるが、それは超過分の確定とは無関係なので対象から外してはいけない）。
  const { data: alreadyInvoiced } = await serviceClient
    .from("service_invoices")
    .select("event_id")
    .eq("charge_kind", "overage")
    .not("event_id", "is", null);
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
    // 超過0件（total_amount_yen=0）の行は「確認済みマーカー」のため課金しない。
    if (typedInvoice.status !== "finalized" && typedInvoice.status !== "failed") {
      continue;
    }
    if (typedInvoice.total_amount_yen <= 0) {
      results.push({ eventId: event.id, eventName: event.name, invoiceId: typedInvoice.id, action: "finalized_no_overage" });
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
    .gt("total_amount_yen", 0)
    .lt("retry_count", MAX_RETRY_COUNT)
    .or(`last_charge_attempt_at.is.null,last_charge_attempt_at.lte.${retryBefore}`);

  for (const row of retryCandidates ?? []) {
    if (exemptOrgIds.has(row.organizer_organization_id)) continue;
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    await attemptCharge(row as ServiceInvoiceRow, event?.name ?? "（不明なイベント）");
    results.push({ eventId: row.event_id ?? "", eventName: event?.name ?? "", invoiceId: row.id, action: "retried" });
  }

  return results;
}

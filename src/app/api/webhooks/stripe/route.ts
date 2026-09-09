import { NextResponse, type NextRequest } from "next/server";
import { createStripeClient } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Stripe Webhook受信エンドポイント（現時点ではダッシュボード未登録・待機状態）。
// 署名検証 → payment_events への冪等な記録、の基盤のみ用意する。
// 実際のイベント種別ごとの業務処理（自動課金結果の反映等）は、通常プランの
// 自動課金実行機能を実装する際にここへ追加する。
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
  const { error: insertError } = await serviceClient.from("payment_events").insert({
    provider: "stripe",
    provider_event_id: event.id,
    event_type: event.type,
    payload_json: event as unknown as Record<string, unknown>,
    processing_status: "pending",
  });

  if (insertError) {
    // unique制約違反 = 既知の重複配信。副作用を再実行せずそのまま200を返す。
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // TODO: 自動課金実行機能の実装時に、event.type に応じた業務処理をここへ追加する
  // （payment_intent.succeeded / payment_intent.payment_failed 等）。
  // 処理後は processing_status を 'processed' に更新すること。

  return NextResponse.json({ received: true });
}

import Stripe from "stripe";

// 決済実行レイヤーとしてのみ使用する。金額計算・利用量集計は行わず、
// UsageLedger / ServiceInvoice（自社台帳）で確定した金額を元に
// カード登録・課金・Webhook検証のみを担当させる方針（実装計画5章参照）。
export function createStripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-08-26.dahlia",
  });
}

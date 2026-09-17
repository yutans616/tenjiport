import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { createStripeClient } from "@/lib/stripe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmPaymentForm } from "./ConfirmPaymentForm";

// カードの3Dセキュア等の追加認証待ちになっている請求を、主催者本人がその場で
// 完了させるためのページ。attemptCharge（オフセッション・リダイレクト無効）では
// 完了できない認証を、ここではオンセッションのStripe.js（confirmCardPayment）で行う。
// 完了後の実際の請求書ステータス更新は、既存のStripe Webhook（payment_intent.succeeded/
// payment_intent.payment_failed）に一本化されるため、このページ自体はDBを更新しない。
export default async function ConfirmPaymentPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("service_invoices")
    .select("id, charge_kind, total_amount_yen, status, requires_payment_authentication, stripe_payment_intent_id, events(name)")
    .eq("id", invoiceId)
    .eq("organizer_organization_id", context.organizationId)
    .single();
  if (!invoice) notFound();

  const event = Array.isArray(invoice.events) ? invoice.events[0] : invoice.events;
  const displayName = event?.name ?? (invoice.charge_kind === "annual_fee" ? "年間プラン契約" : "（不明なイベント）");

  if (!invoice.requires_payment_authentication || !invoice.stripe_payment_intent_id) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 text-center">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-base">この請求はすでに処理済みです</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              認証の完了、または別の方法での処理が既に行われている可能性があります。「プラン・課金」ページで最新の状態をご確認ください。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stripe = createStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id);

  if (!paymentIntent.client_secret) {
    // すでに別の手段（自動リトライの成功等）で確定してしまっている等の想定外ケース。
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 text-center">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-base">この請求はすでに処理済みです</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">「プラン・課金」ページで最新の状態をご確認ください。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">お支払いの認証を完了する</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <p className="text-muted-foreground">{displayName}</p>
            <p className="font-medium">¥{invoice.total_amount_yen.toLocaleString("ja-JP")}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            カード発行会社による追加認証が必要です。下のボタンから認証を完了してください。
          </p>
          <ConfirmPaymentForm clientSecret={paymentIntent.client_secret} />
        </CardContent>
      </Card>
    </div>
  );
}

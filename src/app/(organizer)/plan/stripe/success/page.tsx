import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { createStripeClient } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Webhookに依存せず、Checkout完了直後のリダイレクトでセッション状態を直接検証して確定する。
export default async function StripeSetupSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  const context = await getOrganizerContext();
  if (!context) redirect("/login");
  if (!sessionId) redirect("/plan");

  const stripe = createStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["setup_intent"],
  });

  const setupIntent = typeof session.setup_intent === "object" ? session.setup_intent : null;
  // このセッションが今アクティブな組織のために作られたものかを検証する（複数組織に
  // 所属するユーザーが登録中にアクティブ組織を切り替えた場合、別組織のカードが誤って
  // 紐付けられるのを防ぐ。client_reference_idはstartCardRegistrationで設定している）。
  const belongsToCurrentOrg = session.client_reference_id === context.organizationId;
  const succeeded = belongsToCurrentOrg && session.status === "complete" && setupIntent?.status === "succeeded";
  const paymentMethodId =
    typeof setupIntent?.payment_method === "string" ? setupIntent.payment_method : setupIntent?.payment_method?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (succeeded && paymentMethodId && customerId) {
    const supabase = await createClient();
    await supabase.rpc("record_payment_method_setup", {
      p_org_id: context.organizationId,
      p_stripe_customer_id: customerId,
      p_stripe_payment_method_id: paymentMethodId,
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 text-center">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">{succeeded ? "カードを登録しました" : "カード登録を確認できませんでした"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {succeeded
              ? "今後の請求はこのカードへ自動で行われます。"
              : "もう一度お試しいただくか、時間をおいてから確認してください。"}
          </p>
          <Button render={<Link href="/plan">プラン・課金へ戻る</Link>} className="self-center" />
        </CardContent>
      </Card>
    </div>
  );
}

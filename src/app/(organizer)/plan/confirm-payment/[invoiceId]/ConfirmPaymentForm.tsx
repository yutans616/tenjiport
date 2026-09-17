"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// mode:setup（カード登録）と違いStripe Checkoutのホスト画面へ遷移する方式は使えない
// （オフセッション課金の追加認証はPaymentIntentのconfirmCardPaymentでその場で行う必要が
// あるため）。この画面で唯一、クライアント側でStripe.jsを読み込む。
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

export function ConfirmPaymentForm({ clientSecret }: { clientSecret: string }) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  async function handleConfirm() {
    setIsProcessing(true);
    setError(null);

    const stripe = await stripePromise;
    if (!stripe) {
      setError("決済モジュールの読み込みに失敗しました。時間をおいて再度お試しください。");
      setIsProcessing(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(clientSecret);

    if (confirmError) {
      setError(confirmError.message ?? "認証を完了できませんでした。もう一度お試しください。");
      setIsProcessing(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      setSucceeded(true);
      // 実際の請求書ステータス更新はStripe Webhook（payment_intent.succeeded）で行われる。
      // 反映まで一瞬ラグがあり得るため、少し待ってから/planへ戻す。
      setTimeout(() => {
        router.push("/plan");
        router.refresh();
      }, 1500);
      return;
    }

    setIsProcessing(false);
    setError("認証が完了しませんでした。もう一度お試しいただくか、別のお支払い方法をご検討ください。");
  }

  if (succeeded) {
    return <p className="text-sm text-muted-foreground">認証が完了しました。プラン・課金ページへ戻ります…</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleConfirm} disabled={isProcessing} className="w-full">
        {isProcessing && <Loader2 className="size-3.5 animate-spin" />}
        {isProcessing ? "処理中..." : "認証を完了する"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { createStripeClient } from "@/lib/stripe";

// カード登録用のStripe Checkoutセッション（mode: setup）を作成し、Stripeのホスト画面へ遷移する。
// Webhookに依存せず、完了後のリダイレクト先（/plan/stripe/success）でセッションを直接検証する。
export async function startCardRegistration() {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizer_organizations")
    .select("id, name, billing_email, payment_provider_customer_id")
    .eq("id", context.organizationId)
    .single();
  if (!org) throw new Error("組織が見つかりません。");

  const stripe = createStripeClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let customerId = org.payment_provider_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      email: org.billing_email,
      metadata: { organizer_organization_id: org.id },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    payment_method_types: ["card"],
    // 完了後のリダイレクト先でこのセッションが本当にこの組織のために作られたかを
    // 検証するために埋め込む（複数組織に所属するユーザーが登録中にアクティブ組織を
    // 切り替えた場合、別組織のカードが誤って紐付けられるのを防ぐ）。
    client_reference_id: context.organizationId,
    success_url: `${appUrl}/plan/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/plan`,
  });

  if (!session.url) throw new Error("Checkoutセッションの作成に失敗しました。");
  redirect(session.url);
}

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createResendClient } from "@/lib/resend";

// 請求関連の通知は出展者向けのnotification_deliveries（event_participation_id必須）に
// 乗せられないため、主催者の招待メール（team/actions.ts）と同じ直接送信パターンを使う。
// 送信失敗は課金処理自体を止めないよう、呼び出し側でエラーを握りつぶせる形にする。
async function sendBillingEmail(organizationId: string, subject: string, html: string) {
  const serviceClient = createServiceRoleClient();
  const { data: org } = await serviceClient
    .from("organizer_organizations")
    .select("billing_email, name")
    .eq("id", organizationId)
    .single();
  if (!org?.billing_email) return;

  const resend = createResendClient();
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: org.billing_email,
    subject,
    html,
  });
}

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function notifyInvoiceAwaitingPaymentMethod(params: {
  organizationId: string;
  eventName: string;
  totalAmountYen: number;
}) {
  await sendBillingEmail(
    params.organizationId,
    `【TenjiPort】${params.eventName}のご利用料金が確定しました`,
    `
      <p>${params.eventName}のご利用料金 ¥${params.totalAmountYen.toLocaleString("ja-JP")} が確定しました。</p>
      <p>お支払い方法が未登録のため、自動課金を保留しています。サービスのご利用は引き続きお使いいただけます。</p>
      <p>下記よりお支払い方法をご登録いただくと、登録完了後に自動で課金されます。</p>
      <p><a href="${appUrl()}/plan">${appUrl()}/plan</a></p>
    `,
  );
}

export async function notifyChargeSucceeded(params: {
  organizationId: string;
  eventName: string;
  totalAmountYen: number;
}) {
  await sendBillingEmail(
    params.organizationId,
    `【TenjiPort】${params.eventName}のご利用料金のお支払いが完了しました`,
    `
      <p>${params.eventName}のご利用料金 ¥${params.totalAmountYen.toLocaleString("ja-JP")} のお支払いが完了しました。</p>
      <p>ご利用ありがとうございます。</p>
    `,
  );
}

export async function notifyChargeFailed(params: {
  organizationId: string;
  eventName: string;
  totalAmountYen: number;
}) {
  await sendBillingEmail(
    params.organizationId,
    `【TenjiPort】${params.eventName}のご利用料金のお支払いに失敗しました`,
    `
      <p>${params.eventName}のご利用料金 ¥${params.totalAmountYen.toLocaleString("ja-JP")} の決済に失敗しました。</p>
      <p>サービスのご利用に制限はありませんが、お支払い方法をご確認のうえ更新をお願いいたします。ご登録済みの場合は自動で再試行いたします。</p>
      <p><a href="${appUrl()}/plan">${appUrl()}/plan</a></p>
    `,
  );
}

// 自動リトライ（最大3回）を使い切った場合の一度限りの通知。以降は自動での再試行を
// 停止するため、その旨と手動再試行の導線を案内する（notifyChargeFailedと同じ文面を
// 繰り返し送り続けるのを避けるための専用メッセージ）。
export async function notifyBillingRetriesExhausted(params: {
  organizationId: string;
  eventName: string;
  totalAmountYen: number;
}) {
  await sendBillingEmail(
    params.organizationId,
    `【重要】${params.eventName}のご利用料金の自動引き落としを停止しました`,
    `
      <p>${params.eventName}のご利用料金 ¥${params.totalAmountYen.toLocaleString("ja-JP")} について、自動での引き落としを複数回試みましたが、いずれも完了しませんでした。</p>
      <p>これ以上の自動再試行は行いません。サービスのご利用に制限はありませんが、お支払い方法をご確認・更新のうえ、下記ページから再試行をお願いいたします。</p>
      <p><a href="${appUrl()}/plan">${appUrl()}/plan</a></p>
    `,
  );
}

export async function notifyRefundIssued(params: {
  organizationId: string;
  eventName: string;
  amountYen: number;
  isFullRefund: boolean;
}) {
  await sendBillingEmail(
    params.organizationId,
    `【TenjiPort】${params.eventName}のご利用料金を返金いたしました`,
    `
      <p>${params.eventName}のご利用料金について、¥${params.amountYen.toLocaleString("ja-JP")}${params.isFullRefund ? "（全額）" : "（一部）"}を返金いたしました。</p>
      <p>ご登録のカードへの返金反映まで、数営業日いただく場合がございます。</p>
      <p><a href="${appUrl()}/plan">${appUrl()}/plan</a></p>
    `,
  );
}

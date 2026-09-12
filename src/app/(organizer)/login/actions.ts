"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createResendClient } from "@/lib/resend";
import { getClientIp } from "@/lib/security/clientIp";

const RESET_LIMIT_PER_IP = 8; // 10分あたり
const RESET_WINDOW_SECONDS_PER_IP = 600;
const RESET_LIMIT_PER_EMAIL = 3; // 1時間あたり
const RESET_WINDOW_SECONDS_PER_EMAIL = 3600;

export type SendPasswordResetResult = { ok: true } | { ok: false; error: string };

// パスワード再設定メールを送る。出展者側のexhibitorAccessLinkと同じ方式（Admin APIで
// トークンだけ発行し、/auth/confirm形式のURLを自前で組み立ててResend経由で送信）を使う。
// Supabase自体のメール送信・ダッシュボードのテンプレート設定に依存しないための選択。
//
// メールアドレスの存在有無を外部から判別できないよう（列挙対策）、対象ユーザーが
// 存在しない場合もResendへの送信自体を行わずに ok:true を返す。
export async function sendPasswordResetEmail(email: string): Promise<SendPasswordResetResult> {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    return { ok: false, error: "メールアドレスを入力してください。" };
  }

  const ip = await getClientIp();
  const serviceClient = createServiceRoleClient();

  const [ipAllowed, emailAllowed] = await Promise.all([
    serviceClient.rpc("check_and_increment_rate_limit", {
      p_scope: "password_reset_ip",
      p_key: ip,
      p_limit: RESET_LIMIT_PER_IP,
      p_window_seconds: RESET_WINDOW_SECONDS_PER_IP,
    }),
    serviceClient.rpc("check_and_increment_rate_limit", {
      p_scope: "password_reset_email",
      p_key: trimmedEmail.toLowerCase(),
      p_limit: RESET_LIMIT_PER_EMAIL,
      p_window_seconds: RESET_WINDOW_SECONDS_PER_EMAIL,
    }),
  ]);

  if (ipAllowed.data === false || emailAllowed.data === false) {
    return { ok: false, error: "リクエストが多すぎます。しばらく時間をおいて再度お試しください。" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: "recovery",
    email: trimmedEmail,
    options: { redirectTo: `${appUrl}/reset-password` },
  });

  if (error || !data?.properties?.hashed_token) {
    // 対象アカウントが存在しない場合もここに来るが、列挙を防ぐため成功として扱う。
    return { ok: true };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!resendApiKey || !fromEmail) {
    return { ok: false, error: "メール送信が設定されていません。管理者にお問い合わせください。" };
  }

  const link = `${appUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=${encodeURIComponent("/reset-password")}`;

  const resend = createResendClient();
  const { error: sendError } = await resend.emails.send({
    from: fromEmail,
    to: trimmedEmail,
    subject: "パスワード再設定のご案内",
    html: `
      <p>パスワード再設定のリクエストを受け付けました。</p>
      <p>下記リンクから新しいパスワードを設定してください。</p>
      <p><a href="${link}">${link}</a></p>
      <p>このリンクは一定時間で無効になります。心当たりがない場合はこのメールは無視してください。</p>
    `,
  });
  if (sendError) {
    return { ok: false, error: `メール送信に失敗しました: ${sendError.message}` };
  }

  return { ok: true };
}

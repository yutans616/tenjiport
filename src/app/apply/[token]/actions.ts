"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getClientIp } from "@/lib/security/clientIp";

const OTP_LIMIT_PER_IP = 8; // 10分あたり
const OTP_WINDOW_SECONDS_PER_IP = 600;
const OTP_LIMIT_PER_EMAIL = 3; // 1時間あたり
const OTP_WINDOW_SECONDS_PER_EMAIL = 3600;

export type RequestOtpResult = { ok: true } | { ok: false; error: string };

export async function requestExhibitorOtp(
  token: string,
  email: string,
  honeypot: string,
): Promise<RequestOtpResult> {
  // ハニーポット：人間には見えない項目。埋まっていればBotとみなし、
  // 相手に手がかりを与えないよう成功したふりをして何もしない。
  if (honeypot) {
    return { ok: true };
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    return { ok: false, error: "メールアドレスを入力してください。" };
  }

  const ip = await getClientIp();
  const serviceClient = createServiceRoleClient();

  const [ipAllowed, emailAllowed] = await Promise.all([
    serviceClient.rpc("check_and_increment_rate_limit", {
      p_scope: "otp_request_ip",
      p_key: ip,
      p_limit: OTP_LIMIT_PER_IP,
      p_window_seconds: OTP_WINDOW_SECONDS_PER_IP,
    }),
    serviceClient.rpc("check_and_increment_rate_limit", {
      p_scope: "otp_request_email",
      p_key: trimmedEmail.toLowerCase(),
      p_limit: OTP_LIMIT_PER_EMAIL,
      p_window_seconds: OTP_WINDOW_SECONDS_PER_EMAIL,
    }),
  ]);

  if (ipAllowed.data === false || emailAllowed.data === false) {
    return { ok: false, error: "リクエストが多すぎます。しばらく時間をおいて再度お試しください。" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options: {
      // メールテンプレート側で {{ .RedirectTo }} を /auth/confirm?...&next=... に埋め込むため、
      // ここでは行き先のプレーンなURLのみを渡す（/auth/confirm を含めるとURLが二重にネストして壊れる）。
      emailRedirectTo: `${appUrl}/apply/${token}/form`,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

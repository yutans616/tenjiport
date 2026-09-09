import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * 通知メールに埋め込む、受信者・対象・有効期限を署名検証済みの認可付きリンクを発行する。
 * Supabase Admin APIでマジックリンクの検証トークンのみ発行し、実際のメール送信は
 * こちらのResend経由で行う（Supabase側のメール送信機能は使わない）。
 * リンクは1回開くとその場でセッションが確立し、nextPathへ遷移する。
 */
export async function createExhibitorAccessLink(email: string, nextPath: string): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const serviceClient = createServiceRoleClient();

  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: appUrl },
  });

  if (error || !data?.properties?.hashed_token) {
    throw new Error(`認可付きリンクの発行に失敗しました: ${error?.message ?? "unknown error"}`);
  }

  const verificationType = data.properties.verification_type ?? "magiclink";
  return `${appUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=${verificationType}&next=${encodeURIComponent(nextPath)}`;
}

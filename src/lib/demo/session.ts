import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

/**
 * デモ専用の固定アカウントへ、メール送信なしでサイレントログインする（セッションCookieを
 * 直接発行する）。既存の招待・パスワードリセット（team/actions.ts・login/actions.ts）と
 * 同じadmin.generateLinkパターンを流用するが、メールも送らずリダイレクトも経由せず、
 * このリクエストの中でverifyOtpまで完結させる点が異なる
 * （tenjiport_demo_lp_spec.md 4.3節：認証はSupabase Authを経由するが実メールは送らない）。
 * `/auth/confirm`（メール経由の確認リンク限定で、事前スキャン対策のワンクリック確認を挟む
 * ようになった）を経由しないことで、デモの「ワンクリックで即アプリ」という体験を維持する。
 * 対象メールアドレスは事前にadmin.createUserで作成済みの固定デモアカウントに限定して使うこと。
 * 呼び出し元（Route Handler）はこの後 redirect(next) すること。
 */
export async function silentSignIn(email: string): Promise<void> {
  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(`デモ用ログインリンクの発行に失敗しました: ${error?.message ?? "unknown error"}`);
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verifyError) {
    throw new Error(`デモ用ログインに失敗しました: ${verifyError.message}`);
  }
}

/** 指定した組織に紐づく、現在openなデモイベントを取得する（訪問者ごとに組織が異なる）。 */
export async function getDemoEventForOrganization(organizationId: string): Promise<{ eventId: string; publicFormToken: string }> {
  const serviceClient = createServiceRoleClient();
  const { data: event, error: eventError } = await serviceClient
    .from("events")
    .select("id, public_form_token")
    .eq("organizer_organization_id", organizationId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (eventError || !event) {
    throw new Error(`デモイベントが見つかりません（organization_id=${organizationId}）。`);
  }
  return { eventId: event.id, publicFormToken: event.public_form_token };
}

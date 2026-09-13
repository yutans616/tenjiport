import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * デモ専用の固定アカウントへ、メール送信なしでサイレントログインするためのURLを組み立てる。
 * 既存の招待・パスワードリセット（team/actions.ts・login/actions.ts）と同じ
 * admin.generateLink → /auth/confirm?token_hash=... のパターンを流用するが、
 * メール送信はせずサーバー側でそのままリダイレクトする点だけが異なる
 * （tenjiport_demo_lp_spec.md 4.3節：認証はSupabase Authを経由するが実メールは送らない）。
 * 対象メールアドレスは事前にadmin.createUserで作成済みの固定デモアカウントに限定して使うこと。
 */
export async function buildSilentLoginUrl(email: string, next: string): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${appUrl}${next}` },
  });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(`デモ用ログインリンクの発行に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  const verificationType = data.properties.verification_type ?? "magiclink";
  return `${appUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=${verificationType}&next=${encodeURIComponent(next)}`;
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

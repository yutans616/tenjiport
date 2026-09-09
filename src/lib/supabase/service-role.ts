import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// RLS を bypass するサービスロールクライアント。
// Webhook ハンドラや Cron ジョブなど、ユーザーセッションを持たない信頼された
// サーバー処理からのみ使用する。Client Component やユーザーリクエスト直下では
// 絶対に使わないこと（テナント分離が効かなくなるため）。
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

import { createServiceRoleClient } from "@/lib/supabase/service-role";

const THROTTLE_MS = 10 * 60 * 1000;

// 主催者画面を開いたメンバーの最終利用日時を記録する（運営者ページの組織一覧で使う）。
// 画面遷移のたびに書き込まないよう、前回から10分以上経っている場合だけ更新する。
// 本人のメンバー行だけを対象にするため、権限確認済みのcontextから呼ぶこと。
export async function recordMemberActivity(userId: string, organizationId: string) {
  const threshold = new Date(Date.now() - THROTTLE_MS).toISOString();
  const { error } = await createServiceRoleClient()
    .from("organizer_memberships")
    .update({ last_active_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .or(`last_active_at.is.null,last_active_at.lt.${threshold}`);
  if (error) console.warn(`recording member activity failed: ${error.message}`);
}

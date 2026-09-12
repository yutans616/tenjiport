import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// TenjiPort運営者（組織横断で全主催者組織を管理できる特別な立場）を表す。
// 現状運営者は1名のみのため、簡易的にメールアドレスのハードコード許可とする。
// 将来複数名になった場合は、このハードコード配列をテーブル（例：platform_admins）に置き換える。
const PLATFORM_ADMIN_EMAILS = ["yutans616@gmail.com"];

// サイドバーへの管理者メニュー表示可否など、リダイレクトを伴わない単純な判定用。
export function isPlatformAdminEmail(email: string | null) {
  return PLATFORM_ADMIN_EMAILS.includes(email ?? "");
}

// 未ログインならログイン画面へ。ログイン済みだが運営者でない場合は、
// 管理ページの存在自体を伏せるため404を返す（403にしない）。
export async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  if (!PLATFORM_ADMIN_EMAILS.includes(user.email ?? "")) {
    notFound();
  }
  return user;
}

import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * メール確認リンクの着地点。Supabaseダッシュボードの確認メールテンプレートを
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/onboard
 * の形式にカスタマイズしておく必要がある。
 * サーバー側でセッションを確立してからリダイレクトすることで、以降のServer Componentが
 * ログイン状態を認識できるようにする。
 */
// "next"はアプリ内の相対パスのみを許可する（オープンリダイレクト対策。
// "/"始まりかつ"//"始まりでない＝プロトコル相対URLでもない、を条件にする）。
function isSafeNextPath(next: string | null): next is string {
  return !!next && next.startsWith("/") && !next.startsWith("//");
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");
  const next = isSafeNextPath(nextParam) ? nextParam : "/onboard";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(next);
    }
  }

  redirect("/login?error=confirm_failed");
}

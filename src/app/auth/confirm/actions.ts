"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// "next"はアプリ内の相対パスのみを許可する（オープンリダイレクト対策。
// "/"始まりかつ"//"始まりでない＝プロトコル相対URLでもない、を条件にする）。
function isSafeNextPath(next: string | null): next is string {
  return !!next && next.startsWith("/") && !next.startsWith("//");
}

// 実際の検証（verifyOtp）はここでのみ行う。GETでの自動検証をやめ、
// ユーザーの明示的なクリック（このServer Actionの呼び出し）があって初めて
// トークンを消費する設計にしている。これはGmail等のメールクライアントが
// リンクを安全性スキャンのため自動で事前アクセスし、ワンタイムトークンを
// 本人のクリック前に消費してしまう問題への対策（page.tsx参照）。
export async function confirmEmailAction(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  const nextParam = String(formData.get("next") ?? "");
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

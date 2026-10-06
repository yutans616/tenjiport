"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// "next"はアプリ内のパスのみを許可する（オープンリダイレクト対策）。
// Supabaseメールテンプレートの{{ .RedirectTo }}は絶対URLで届くため、
// 自サイトと同一オリジンの絶対URLはパス部分に変換して受け付ける。
function resolveSafeNextPath(next: string): string | null {
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  try {
    const url = new URL(next);
    const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").origin;
    if (url.origin === appOrigin) return `${url.pathname}${url.search}`;
  } catch {}
  return null;
}

// 実際の検証（verifyOtp）はここでのみ行う。GETでの自動検証をやめ、
// ユーザーの明示的なクリック（このServer Actionの呼び出し）があって初めて
// トークンを消費する設計にしている。これはGmail等のメールクライアントが
// リンクを安全性スキャンのため自動で事前アクセスし、ワンタイムトークンを
// 本人のクリック前に消費してしまう問題への対策（page.tsx参照）。
export async function confirmEmailAction(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  // Supabaseの「Confirm signup」テンプレートでは{{ .Type }}が空で展開されるため、
  // 空なら"email"（signup・magiclinkどちらのtoken_hashも検証できる）を使う。
  const type = (String(formData.get("type") ?? "") || "email") as EmailOtpType;
  const next = resolveSafeNextPath(String(formData.get("next") ?? "")) ?? "/onboard";

  if (tokenHash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(next);
    }
  }

  redirect("/login?error=confirm_failed");
}

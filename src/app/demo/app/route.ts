import { NextResponse } from "next/server";
import { DEMO_ORGANIZER_EMAIL } from "@/lib/demo/constants";
import { buildSilentLoginUrl } from "@/lib/demo/session";

// 営業LP・営業メールから案内する操作デモの入口（固定URL）。tenjiport_demo_lp_spec.md 1章。
// デモ専用組織の固定アカウントへメール送信なしでサインインし、実アプリの主催者側画面
// （/events以下）へそのまま遷移する。登録・メール入力は不要。
export async function GET() {
  const url = await buildSilentLoginUrl(DEMO_ORGANIZER_EMAIL, "/events");
  return NextResponse.redirect(url);
}

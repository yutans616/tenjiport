import { NextResponse } from "next/server";
import { DEMO_FEATURED_EXHIBITOR_EMAIL } from "@/lib/demo/constants";
import { buildSilentLoginUrl, getDemoEventEntry } from "@/lib/demo/session";

// 操作デモの「出展者側に切り替える」導線（tenjiport_demo_lp_spec.md 4.2節 手順4）。
// デモ専用の出展者固定アカウントへサインインし、実際の応募URL（apply/[token]）と
// 同じ画面へ遷移する。既にログイン済みの状態でアクセスするため、メール確認手順は発生しない。
export async function GET() {
  const { publicFormToken } = await getDemoEventEntry();
  const url = await buildSilentLoginUrl(DEMO_FEATURED_EXHIBITOR_EMAIL, `/apply/${publicFormToken}`);
  return NextResponse.redirect(url);
}

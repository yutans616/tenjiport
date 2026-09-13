import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SESSION_COOKIE } from "@/lib/demo/constants";
import { getOrCreateDemoSession } from "@/lib/demo/ephemeral";
import { buildSilentLoginUrl } from "@/lib/demo/session";

// 営業LP・営業メールから案内する操作デモの入口（固定URL）。tenjiport_demo_lp_spec.md 1章。
// 訪問者ごとに専用のデモ組織を発行・再利用し（4.3節P2：訪問者間の完全分離）、
// メール送信なしでその組織の主催者アカウントへサインインしたうえで実アプリの
// 主催者側画面（/events以下）へそのまま遷移する。登録・メール入力は不要。
export async function GET(request: NextRequest) {
  const cookieToken = request.cookies.get(DEMO_SESSION_COOKIE)?.value;
  const session = await getOrCreateDemoSession(cookieToken);

  const url = await buildSilentLoginUrl(`demo-${session.token}-organizer@example.com`, "/events");
  const response = NextResponse.redirect(url);
  response.cookies.set(DEMO_SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt),
  });
  return response;
}

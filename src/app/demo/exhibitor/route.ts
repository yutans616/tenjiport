import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { DEMO_SESSION_COOKIE } from "@/lib/demo/constants";
import { getOrCreateDemoSession } from "@/lib/demo/ephemeral";
import { silentSignIn, getDemoEventForOrganization } from "@/lib/demo/session";

// 操作デモの「出展者側に切り替える」導線（tenjiport_demo_lp_spec.md 4.2節 手順4）。
// 既存のCookie（/demo/appで発行済み）があればそのセッションのデモ組織を再利用し、
// なければこの入口から新規にセッションを発行する（訪問者ごとの完全分離、4.3節P2）。
// デモ専用の出展者固定アカウントへサインインし、実際の応募URL（apply/[token]）と
// 同じ画面へ遷移する。既にログイン済みの状態でアクセスするため、メール確認手順は発生しない。
export async function GET(request: NextRequest) {
  const cookieToken = request.cookies.get(DEMO_SESSION_COOKIE)?.value;
  const session = await getOrCreateDemoSession(cookieToken);
  const { publicFormToken } = await getDemoEventForOrganization(session.organizationId);

  const cookieStore = await cookies();
  cookieStore.set(DEMO_SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt),
  });

  await silentSignIn(`demo-${session.token}-featured@example.com`);
  redirect(`/apply/${publicFormToken}`);
}

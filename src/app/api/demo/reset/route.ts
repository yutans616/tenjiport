import { NextResponse, type NextRequest } from "next/server";
import { cleanupExpiredDemoSessions } from "@/lib/demo/ephemeral";

// デモ環境の期限切れセッション清掃（tenjiport_demo_lp_spec.md 4.3節P2の安全網）。
// 訪問者ごとのエフェメラルなデモ組織は新規発行のたびにも少しずつ清掃されるが
// （src/lib/demo/ephemeral.ts）、アクセスが途絶えた場合の保険としてVercel Cronから
// 毎日1回呼び出す。ガード方式は/api/notifications/processと同じ
// （CRON_SECRET未設定時はローカル許可）。
async function runCleanup() {
  const cleaned = await cleanupExpiredDemoSessions(50);
  return NextResponse.json({ ok: true, cleanedSessions: cleaned });
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get("x-cron-secret");
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    return await runCleanup();
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

// Vercel CronはGETリクエストでトリガーするため、Vercelネイティブの
// Authorization: Bearer $CRON_SECRET 規約で別途受け付ける。
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    return await runCleanup();
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

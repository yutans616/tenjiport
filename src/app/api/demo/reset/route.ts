import { NextResponse, type NextRequest } from "next/server";
import { resetDemoEnvironment } from "@/lib/demo/seed";

// デモ環境の深夜強制リセット（tenjiport_demo_lp_spec.md 4.3節の安全網）。
// 「最初に戻す」ボタン（src/app/demo/actions.ts）を訪問者が押し忘れた場合や、
// 複数訪問者の操作が混ざった場合に備え、Vercel Cronから毎日1回呼び出す。
// ガード方式はsrc/app/api/notifications/process/route.tsと同じ（CRON_SECRET未設定時はローカル許可）。
async function runReset() {
  const result = await resetDemoEnvironment();
  return NextResponse.json({ ok: true, ...result });
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
    return await runReset();
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
    return await runReset();
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

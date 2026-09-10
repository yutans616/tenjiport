import { NextResponse, type NextRequest } from "next/server";
import { runEventBilling } from "@/lib/billing/runEventBilling";

// イベント終了時の自動課金バッチ。本番ではVercel Cronから定期的に呼び出す想定。
// Vercel Cronのネイティブ規約（Authorization: Bearer $CRON_SECRET）で認証する。
// CRON_SECRETが未設定の場合はローカル開発用に許可する。
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const results = await runEventBilling();
    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

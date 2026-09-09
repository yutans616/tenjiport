import { NextResponse, type NextRequest } from "next/server";
import { processPendingNotifications } from "@/lib/notifications/processPendingNotifications";

// 通知配信バッチ処理。本番ではVercel Cron等から定期的に呼び出す想定。
// CRON_SECRET が設定されている場合はヘッダー一致を必須とする（未設定時はローカル開発用に許可）。
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get("x-cron-secret");
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const results = await processPendingNotifications(20);
    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

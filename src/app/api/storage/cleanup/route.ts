import { NextResponse, type NextRequest } from "next/server";
import { runStorageRetentionCleanup } from "@/lib/storage/runStorageRetentionCleanup";

// 終了から2年経過したイベントの、保存義務のないファイルを定期削除するバッチ。
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
    const result = await runStorageRetentionCleanup();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

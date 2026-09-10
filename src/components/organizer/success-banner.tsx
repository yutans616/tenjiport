import { CheckCircle2 } from "lucide-react";

const MESSAGES: Record<string, string> = {
  saved: "保存しました。",
  published: "公開しました。出展者はこの共有URLから入力できます。",
  regenerated: "URLを再発行しました。以前のURLは無効になりました。",
  invited: "招待メールを送信しました。",
  processed: "送信処理を実行しました。",
  invoice_resent: "請求書を再送しました。",
};

function resolveMessage(done: string, count?: string): string {
  if (done === "resent") {
    const n = Number(count ?? 0);
    return n > 0 ? `${n}件に再通知しました。` : "全員確認済みのため、再通知の対象者はいませんでした。";
  }
  if (done === "bulk_invoices_created") {
    const n = Number(count ?? 0);
    return n > 0 ? `${n}件の請求書を発行しました。` : "対象者がいなかったため、請求書は発行されませんでした。";
  }
  return MESSAGES[done] ?? "完了しました。";
}

export function SuccessBanner({ done, count }: { done?: string; count?: string }) {
  if (!done) return null;
  const message = resolveMessage(done, count);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
      <CheckCircle2 className="size-4 shrink-0" />
      {message}
    </div>
  );
}

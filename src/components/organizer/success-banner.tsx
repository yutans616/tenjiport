import { CheckCircle2 } from "lucide-react";

const MESSAGES: Record<string, string> = {
  saved: "保存しました。",
  published: "公開しました。出展者はこの共有URLから入力できます。",
  regenerated: "URLを再発行しました。以前のURLは無効になりました。",
};

export function SuccessBanner({ done }: { done?: string }) {
  if (!done) return null;
  const message = MESSAGES[done] ?? "完了しました。";

  return (
    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
      <CheckCircle2 className="size-4 shrink-0" />
      {message}
    </div>
  );
}

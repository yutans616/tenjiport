"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RootRouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <AlertTriangle className="size-5" />
            問題が発生しました
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            予期しないエラーが発生しました。時間をおいて再度お試しください。
          </p>
          {error.digest && <p className="text-xs text-muted-foreground">エラーコード: {error.digest}</p>}
          <div className="flex gap-2">
            <Button onClick={() => retry()}>もう一度試す</Button>
            {/* エラー画面からの復帰はクライアントルーターの状態に依存しない
                通常のページ遷移（フルリロード）にする */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <Button variant="outline" render={<a href="/">トップに戻る</a>} />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

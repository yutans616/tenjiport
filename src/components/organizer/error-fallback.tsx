"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// error.tsx（Next.js のルートエラーバウンダリ）向けの共通フォールバックUI。
// 本番ビルドではServer Component/Server Action由来のエラーメッセージは
// セキュリティ上の理由で汎用メッセージに置き換えられる（digestのみ利用可能）ため、
// ここでは常に案内文を自前で表示し、error.digestは参照用に添える。
export function OrganizerErrorFallback({
  error,
  retry,
  backHref,
  backLabel,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  backHref: string;
  backLabel: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center py-12">
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
            <Button variant="outline" render={<a href={backHref}>{backLabel}</a>} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

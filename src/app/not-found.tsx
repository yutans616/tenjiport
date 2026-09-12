import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-4 p-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">ページが見つかりません</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        お探しのページは存在しないか、移動または削除された可能性があります。URLをご確認ください。
      </p>
      <Button render={<Link href="/">トップページに戻る</Link>} className="mt-2" />
    </main>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-4 p-16 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
        展
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">出展者情報・資料共有管理SaaS</h1>
      <p className="max-w-md text-muted-foreground">
        展示会の出展者情報収集・資料共有・入金管理を一か所で。
      </p>
      <div className="mt-2 flex gap-3">
        <Button render={<Link href="/login">主催者ログイン</Link>} />
        <Button variant="outline" render={<Link href="/health">ヘルスチェック</Link>} />
      </div>
      <Link href="/legal/tokushoho" className="mt-6 text-xs text-muted-foreground underline-offset-4 hover:underline">
        特定商取引法に基づく表記
      </Link>
    </main>
  );
}

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-6 bg-white p-16 text-center">
      <div className="relative w-full max-w-xl" style={{ aspectRatio: "2172 / 724" }}>
        <Image src="/tenjiport_logo.png" alt="TenjiPort" fill priority className="object-contain" />
      </div>
      <p className="max-w-md text-muted-foreground">展示会の出展者情報収集・資料共有・入金管理を一か所で。</p>
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

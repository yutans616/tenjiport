import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-6 bg-black p-16 text-center">
      <div className="relative w-full max-w-xl overflow-hidden" style={{ aspectRatio: "1536 / 880" }}>
        {/* 元画像は制作用シートのため左上の版番号"01"を上方向にクロップして隠している */}
        <Image
          src="/tenjiport_logo.png"
          alt="TenjiPort"
          fill
          priority
          className="object-cover"
          style={{ objectPosition: "center -13%" }}
        />
      </div>
      <p className="max-w-md text-zinc-400">展示会の出展者情報収集・資料共有・入金管理を一か所で。</p>
      <div className="mt-2 flex gap-3">
        <Button render={<Link href="/login">主催者ログイン</Link>} />
        <Button
          variant="outline"
          className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900 hover:text-white"
          render={<Link href="/health">ヘルスチェック</Link>}
        />
      </div>
      <Link href="/legal/tokushoho" className="mt-6 text-xs text-zinc-500 underline-offset-4 hover:underline">
        特定商取引法に基づく表記
      </Link>
    </main>
  );
}

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function ApplyDonePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <CheckCircle2 className="size-10 text-primary" />
      <h1 className="text-lg font-semibold tracking-tight">提出が完了しました</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        ご協力ありがとうございました。主催者からの資料公開・請求書のご案内は、登録いただいたメールアドレス宛にお送りします。
      </p>
      <div className="flex gap-2">
        <Button variant="outline" render={<Link href={`/apply/${token}/announcements`}>資料一覧を見る</Link>} />
        <Button variant="outline" render={<Link href={`/apply/${token}/invoices`}>請求書を見る</Link>} />
      </div>
    </main>
  );
}

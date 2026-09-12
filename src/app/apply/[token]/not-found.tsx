export default function ExhibitorNotFound() {
  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-4 p-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">ページが見つかりません</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        お探しのページは存在しないか、移動または削除された可能性があります。ご案内メールに記載のリンクからやり直すか、主催者にお問い合わせください。
      </p>
    </main>
  );
}

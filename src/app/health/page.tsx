export default function HealthPage() {
  const checkedAt = new Date().toISOString();

  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-2 p-16 text-center">
      <h1 className="text-2xl font-semibold text-primary">OK</h1>
      <p className="text-sm text-muted-foreground">出展者情報・資料共有管理SaaS — ヘルスチェック</p>
      <p className="text-xs text-muted-foreground">checked at: {checkedAt}</p>
    </main>
  );
}

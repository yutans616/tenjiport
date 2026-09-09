import { Card, CardContent } from "@/components/ui/card";

const ROWS: { label: string; value: string }[] = [
  { label: "事業者名", value: "【要入力】株式会社BlackishGear" },
  { label: "運営統括責任者", value: "【要入力】" },
  { label: "所在地", value: "【要入力】請求があった場合には遅滞なく開示します" },
  { label: "電話番号", value: "【要入力】請求があった場合には遅滞なく開示します" },
  { label: "メールアドレス", value: "【要入力】" },
  { label: "販売価格", value: "各プランのご案内ページに記載の金額（税別）" },
  { label: "商品代金以外の必要料金", value: "振込手数料等はお客様のご負担となります。" },
  { label: "お支払い方法", value: "クレジットカード決済（通常プラン・年間プラン契約時）" },
  { label: "お支払い時期", value: "通常プランは利用開始時および超過分の月次精算時、年間プランは契約時および年次更新時" },
  { label: "サービスの提供時期", value: "決済完了後、直ちにご利用いただけます。" },
  { label: "キャンセル・返金について", value: "【要入力】本番提供開始までに規定します。" },
];

export default function TokushohoPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 py-16">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">特定商取引法に基づく表記</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          このページは仮の内容です。【要入力】の項目は、本番公開前に正式な事業者情報へ差し替えてください。
        </p>
      </div>

      <Card>
        <CardContent className="py-2">
          <dl className="divide-y">
            {ROWS.map((row) => (
              <div key={row.label} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-muted-foreground">{row.label}</dt>
                <dd className="text-sm sm:col-span-2">{row.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </main>
  );
}

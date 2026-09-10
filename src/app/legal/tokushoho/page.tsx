import { Card, CardContent } from "@/components/ui/card";

const ROWS: { label: string; value: string }[] = [
  { label: "事業者名", value: "株式会社BlackishGear" },
  { label: "運営統括責任者", value: "長尾湧太" },
  { label: "所在地", value: "埼玉県川越市天沼新田221-10-B105" },
  { label: "電話番号", value: "070-9297-0866" },
  { label: "メールアドレス", value: "info@blackishgear.com" },
  { label: "販売価格", value: "各プランのご案内ページに記載の金額（税別）" },
  { label: "商品代金以外の必要料金", value: "振込手数料等はお客様のご負担となります。" },
  { label: "お支払い方法", value: "クレジットカード決済（通常プラン・年間プラン契約時）" },
  { label: "お支払い時期", value: "通常プランはイベント作成時（基本料金）およびイベント終了時（超過分）の都度、年間プランは契約時および年次更新時" },
  { label: "サービスの提供時期", value: "決済完了後、直ちにご利用いただけます。" },
  {
    label: "キャンセル・返金について",
    value:
      "お客様都合による解約の場合、お支払い済みの料金（月額・年額とも）の返金は原則として行いません。次回更新日までに解約手続きを行うことで、以降のご請求を停止できます。サービス内容に重大な不備があった場合は、個別にご相談のうえ対応いたします。",
  },
];

export default function TokushohoPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 py-16">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">特定商取引法に基づく表記</h1>
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

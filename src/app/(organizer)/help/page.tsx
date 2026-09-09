import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  { title: "1. イベントを作成する", body: "「イベント一覧」から新規イベントを作成し、名称・会場・開催日を入力します。" },
  { title: "2. フォームを設計する", body: "「フォーム設定」でセクション・入力項目を追加します。よく使う項目はテンプレートから一括追加できます。" },
  { title: "3. プレビューで確認する", body: "「出展者としてプレビュー」で、実際に出展者へ表示される画面を公開前に確認できます。" },
  {
    title: "4. イベントとフォームを公開する",
    body: "概要ページで「イベントの状態」を公開中にし、フォーム設定ページで「公開して出展者を募集する」を押します。どちらか一方だけでは出展者は入力できません。",
  },
  { title: "5. 共有URLを配布する", body: "フォーム設定ページに表示される共有URLを、出展者へメールやWebサイトで案内します。" },
  { title: "6. 提出状況を確認する", body: "「出展者一覧」から提出内容を確認し、必要であれば修正を依頼できます。" },
  { title: "7. 資料を公開する", body: "「資料」から案内文書を作成し、「公開して通知」を押すと出展者へ自動でメール通知されます（下書き保存では通知されません）。" },
  { title: "8. 請求書を発行・入金管理する", body: "「請求書」から個別に請求書を作成し、入金確認後に入金済みへ更新します。出展者側の確認状態とは別に管理されます。" },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "「イベントの状態」と「フォームの公開」の違いは何ですか？両方とも公開にする必要がありますか？",
    a: "はい、両方が必要です。「イベントの状態」（概要ページ）はイベント自体を募集受付中として扱うかどうか、「フォームの公開」（フォーム設定ページ）はその共有URLを実際に開放するかどうかを表します。どちらか一方だけでは、出展者は「現在、入力フォームは準備中です」という画面になり入力できません。",
  },
  {
    q: "出展者はアカウント登録やパスワードが必要ですか？",
    a: "不要です。共有URLからメールアドレスを入力すると確認メールが届き、そのリンクを開くだけで入力を開始できます（パスワードレス）。再訪問時も同じ方法で再入力できます。",
  },
  {
    q: "出展者からの確認メールのリンクを開いても入力画面に進めません。",
    a: "URLの有効期限切れ、または既に一度使用したリンクの可能性があります。共有URLのページからメールアドレスを再入力し、新しい確認メールを取得してください。それでも解決しない場合はお問い合わせください。",
  },
  {
    q: "請求書の「確認状態」と「入金状態」は何が違いますか？",
    a: "「確認状態」は出展者が請求書の内容を確認したかどうかを示すもので、出展者側の操作で更新されます。「入金状態」は実際に入金があったかどうかを示すもので、主催者のみが手動で更新できます。両者は連動しないため、入金確認は必ず主催者側で行ってください。",
  },
  {
    q: "利用料金（従量課金）はどのように数えられますか？",
    a: "出展者（ブランド単位の参加）が初めてフォームを提出完了した時点で1件としてカウントされます。同じ会社でも複数ブランドで出展する場合は、ブランドごとに1件ずつカウントされます。下書き保存や再提出、通知の再送では二重にカウントされません。",
  },
  {
    q: "重複登録に気づいた場合はどうすればよいですか？",
    a: "「重複登録レビュー」画面でメールアドレスや社名が近い登録候補を確認し、統合または訂正できます。統合してもデータは削除されず、履歴として残ります。誤って課金された分は補正行として事後的に是正されます。",
  },
  {
    q: "年間プランと通常プラン（従量課金）の違いは何ですか？",
    a: "通常プランは提出完了した出展者数に応じて都度課金されます。年間プランは年額固定で、契約期間中は出展者数に応じた従量課金は発生しません（上限に近づいても出展者の入力・提出は継続できます）。年間プランは大型のご利用を想定した個別のご案内となっており、ご希望の場合はお見積りをいたしますので担当者までお問い合わせください。",
  },
  {
    q: "出力したCSV・ZIPに他社の情報が混ざっていないか心配です。",
    a: "出力機能は組織・イベントの権限に基づいて生成されるため、他の主催者や他イベントのデータが混ざることはありません。ファイルZIP出力も、ダウンロード時に都度アクセス権限を再確認しています。",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">使い方・よくある質問</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          TenjiPortの基本的な使い方と、よくいただく質問をまとめています。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本の流れ</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {STEPS.map((step) => (
            <div key={step.title}>
              <p className="text-sm font-medium">{step.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">よくある質問</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group border-b py-3 last:border-b-0">
              <summary className="cursor-pointer list-none text-sm font-medium marker:content-none">
                <span className="flex items-start justify-between gap-2">
                  {faq.q}
                  <span className="shrink-0 text-muted-foreground group-open:hidden">+</span>
                  <span className="hidden shrink-0 text-muted-foreground group-open:inline">−</span>
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{faq.a}</p>
            </details>
          ))}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        解決しない場合は、サービス管理者までお問い合わせください。
      </p>
    </div>
  );
}

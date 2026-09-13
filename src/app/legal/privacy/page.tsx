import { Card, CardContent } from "@/components/ui/card";

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. 取得する情報",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>主催者アカウント情報（氏名、メールアドレス、組織名、請求先情報等）</li>
        <li>出展者から提供される情報（会社名、担当者名、連絡先、出展申込フォームへの入力内容、添付ファイル等）</li>
        <li>決済に関する情報（決済代行会社Stripe, Inc.を通じて処理され、当社はカード番号等の情報を保持しません）</li>
        <li>本サービスの利用状況に関するログ・アクセス解析情報</li>
      </ul>
    ),
  },
  {
    title: "2. 利用目的",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>本サービスの提供・維持・改善</li>
        <li>お問い合わせへの対応</li>
        <li>利用料金の請求・決済処理</li>
        <li>重要なお知らせの通知</li>
        <li>不正利用の防止・セキュリティの確保</li>
        <li>統計的に処理した上でのサービス改善・分析</li>
      </ul>
    ),
  },
  {
    title: "3. 第三者提供",
    body: "当社は、法令に基づく場合を除き、ご本人の同意なく個人情報を第三者に提供しません。ただし、次条に定める委託先への提供はこの限りではありません。",
  },
  {
    title: "4. 業務委託・外部サービスの利用",
    body: (
      <>
        <p className="mb-2">
          本サービスは、以下の外部サービスを利用して運営されています。各サービスの提供事業者は、それぞれのプライバシーポリシーに基づき情報を取り扱います。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>データベース・認証・ファイル保存：Supabase, Inc.</li>
          <li>ホスティング：Vercel Inc.</li>
          <li>決済処理：Stripe, Inc.</li>
          <li>メール配信：Resend</li>
          <li>スパム対策：Cloudflare, Inc.（Turnstile）</li>
          <li>アクセス解析：Google LLC（Google Analytics）</li>
        </ul>
      </>
    ),
  },
  {
    title: "5. Cookie・アクセス解析ツールについて",
    body: "本サービスの紹介ページ（操作デモを含む）では、利用状況を把握するためGoogle Analytics（GA4）を使用しています。Google Analyticsは、Cookie等を利用して匿名の利用状況データを収集しますが、氏名・メールアドレス等の個人を特定できる情報を送信することはありません。取得したデータの取り扱いについては、Googleのプライバシーポリシーをご確認ください。ブラウザの設定によりCookieを無効化することも可能です。",
  },
  {
    title: "6. 個人情報の開示・訂正・利用停止等",
    body: "ご本人からの個人情報の開示、訂正、利用停止等のご請求には、法令に従い適切に対応いたします。下記のお問い合わせ窓口までご連絡ください。",
  },
  {
    title: "7. 安全管理措置",
    body: "当社は、取得した個人情報の漏えい、滅失又は毀損の防止その他の安全管理のために、必要かつ適切な措置を講じます。",
  },
  {
    title: "8. 本ポリシーの変更",
    body: "本ポリシーの内容は、法令の変更や本サービスの内容変更等に応じて、予告なく変更することがあります。変更後のポリシーは、本ページに掲載した時点から効力を生じるものとします。",
  },
  {
    title: "9. お問い合わせ窓口",
    body: (
      <>
        <p>株式会社BlackishGear</p>
        <p>Eメール：info@blackishgear.com</p>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 py-16">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">プライバシーポリシー</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          株式会社BlackishGear（以下「当社」）は、当社が提供する展示会・出展者管理クラウド「テンジポート」（以下「本サービス」）における、お客様の個人情報の取り扱いについて、本ポリシーを定めます。
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6 py-6 text-sm leading-[1.8]">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="mb-2 font-semibold">{s.title}</h2>
              <div className="text-muted-foreground">{s.body}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">制定日：2026年9月13日</p>
    </main>
  );
}

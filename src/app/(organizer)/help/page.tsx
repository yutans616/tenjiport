import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Shot = { src: string; width: number; height: number; alt: string };

type Step = {
  title: string;
  paragraphs: string[];
  shots?: Shot[];
};

function StepImage({ src, width, height, alt }: Shot) {
  return (
    <Image
      src={src}
      width={width}
      height={height}
      alt={alt}
      className="rounded-lg border"
      style={{ width: "100%", height: "auto" }}
    />
  );
}

function StepBlock({ step }: { step: Step }) {
  return (
    <div className="flex flex-col gap-3 border-b pb-6 last:border-b-0 last:pb-0">
      <p className="text-sm font-semibold">{step.title}</p>
      {step.paragraphs.map((p, i) => (
        <p key={i} className="text-sm text-muted-foreground">
          {p}
        </p>
      ))}
      {step.shots && (
        <div className="flex flex-col gap-3">
          {step.shots.map((shot) => (
            <StepImage key={shot.src} {...shot} />
          ))}
        </div>
      )}
    </div>
  );
}

const ORGANIZER_STEPS: Step[] = [
  {
    title: "1. イベントを作成する",
    paragraphs: [
      "「イベント一覧」の右上にある「+ 新規イベント作成」を押します。",
      "イベント名・会場・開始日・終了日を入力し（例：イベント名「キャンプエキスポ」、会場「東京ビッグサイト」）、「作成する」を押します。",
    ],
    shots: [
      { src: "/help/events-list.jpg", width: 1857, height: 276, alt: "イベント一覧画面" },
      { src: "/help/event-create-form.jpg", width: 684, height: 532, alt: "新規イベント作成フォーム" },
    ],
  },
  {
    title: "2. イベントの状態を確認する",
    paragraphs: [
      "作成すると概要ページが開きます。上部のタブ（概要／フォーム設定／出展者一覧／資料／請求書／重複レビュー／データ出力）から各機能に移動できます。",
      "「状態」プルダウンでは下書き・公開中・終了・アーカイブを選べますが、これは管理画面での一覧表示・整理用のラベルです。出展者が実際に入力できるかどうかは、次の「フォーム設定」の公開操作とあわせて決まります（両方が必要です）。",
    ],
    shots: [
      { src: "/help/event-overview.jpg", width: 1557, height: 732, alt: "イベント概要ページ" },
      { src: "/help/event-status-dropdown.jpg", width: 591, height: 503, alt: "状態プルダウンを開いた状態" },
    ],
  },
  {
    title: "3. フォームを設計して公開する",
    paragraphs: [
      "「フォーム設定」タブで、出展者への共有URLと入力フォームの項目を管理します。",
      "「+ブランド共通情報」などのテンプレートボタンを押すと、よく使うセクション（ブランド共通情報・広報素材・開催別情報・電源備品・車両搬入出・スタッフ）を項目ごと一括で追加できます。個別に項目を追加することもできます。",
      "項目を用意したら「公開して出展者を募集する」を押すと、共有URLが実際に開放されます。",
    ],
    shots: [{ src: "/help/form-settings.jpg", width: 1485, height: 912, alt: "フォーム設定ページ" }],
  },
  {
    title: "4. 公開前にプレビューで確認する",
    paragraphs: [
      "「出展者としてプレビュー」を押すと、実際に出展者に表示される画面を公開前に確認できます（このプレビュー画面から入力・送信はできません）。",
    ],
    shots: [{ src: "/help/form-preview.jpg", width: 781, height: 761, alt: "フォームプレビュー画面" }],
  },
  {
    title: "5. 出展者からの提出を確認する",
    paragraphs: [
      "「出展者一覧」では、提出状態・請求書・資料確認の状況を1つの表で確認できます。",
      "状態で絞り込んだり、提出日時・ブランド名で並べ替えたりできるほか、チェックボックスで選んだ出展者だけをまとめてダウンロード（提出内容CSV＋アップロード済みファイル）することもできます。",
    ],
    shots: [{ src: "/help/exhibitors-list.jpg", width: 1601, height: 353, alt: "出展者一覧画面" }],
  },
  {
    title: "6. 出展者の詳細を確認・修正依頼する",
    paragraphs: [
      "ブランド名をクリックすると詳細画面が開きます。「確認済みにする」で内容を確認済みに、「修正を依頼する」で出展者に再入力をお願いできます（例：「電話番号が間違っています。修正をお願いいたします。」）。",
      "依頼を送ると「修正依頼中」の表示に変わり、依頼内容が履歴として記録されます。",
    ],
    shots: [
      { src: "/help/exhibitor-detail.jpg", width: 686, height: 767, alt: "出展者詳細画面（修正依頼前）" },
      { src: "/help/exhibitor-detail-revision.jpg", width: 656, height: 733, alt: "出展者詳細画面（修正依頼後）" },
    ],
  },
  {
    title: "7. 資料（案内文書）を作成・公開する",
    paragraphs: [
      "「資料」タブの「+ 新規作成」から作成します。",
      "タイトル・本文を入力し、公開対象を「全出展者」または「個別選択」から選びます（例：タイトル「出店要項」、本文「出店要項を公開しました。ご確認よろしくお願いいたします。」）。「全出展者」を選ぶと個別選択のチェックは自動的に外れます。",
      "作成すると下書きの詳細ページが開きます。公開するには添付ファイルが1件以上必要で、未添付の間は「公開して通知」を押せません。",
      "ファイルを選択するか、この枠にドラッグ＆ドロップすると自動的にアップロードされます（複数選択可）。追加したファイルは右側のゴミ箱アイコンからいつでも削除できます。",
      "「公開して通知」を押すと、対象の出展者へその場でメール通知が送られます。公開後は「未確認者へ再通知」（未確認の相手にだけ再送し、何件に送ったか表示されます）、「送信処理を実行」（送信待ちを今すぐ処理）が使えます。",
    ],
    shots: [
      { src: "/help/announcements-empty.jpg", width: 1608, height: 455, alt: "資料一覧（作成前）" },
      { src: "/help/announcement-create-filled.jpg", width: 540, height: 518, alt: "資料作成フォーム（入力例）" },
      { src: "/help/announcement-no-attachment.jpg", width: 651, height: 400, alt: "資料詳細（添付ファイルなし・公開ボタン無効）" },
      { src: "/help/announcement-with-attachment.jpg", width: 688, height: 404, alt: "資料詳細（添付ファイルあり）" },
      { src: "/help/announcement-published.jpg", width: 653, height: 336, alt: "資料詳細（公開後）" },
    ],
  },
  {
    title: "8. 請求書を作成する",
    paragraphs: [
      "「請求書」タブの「+ 新規作成」から作成します。",
      "対象の出展者・金額・支払期限を入力し、必要であれば請求書ファイル（PDF等）を添付します（例：金額300,000円、支払期限2026/09/30）。「主催者内部メモ」は出展者には表示されません。",
      "「作成して通知する」を押すと、その場で出展者へメール通知されます。",
      "請求書詳細ページの「入金確認」欄で入金日・メモを入力し「入金済みにする」を押すと入金状態を更新できます。出展者側の「確認状態」とは別に管理されており、入金状態は主催者のみが変更できます。",
    ],
    shots: [
      { src: "/help/invoices-empty.jpg", width: 1607, height: 291, alt: "請求書一覧（作成前）" },
      { src: "/help/invoice-create-filled.jpg", width: 552, height: 525, alt: "請求書作成フォーム（入力例）" },
      { src: "/help/invoice-detail-organizer.jpg", width: 550, height: 650, alt: "請求書詳細（主催者側）" },
    ],
  },
  {
    title: "9. 重複登録を確認する",
    paragraphs: [
      "「重複レビュー」タブでは、メールアドレスや社名が近い登録候補が自動的に一覧表示されます。統合してもデータは削除されず、履歴として残ります。",
    ],
    shots: [{ src: "/help/duplicates-review.jpg", width: 1611, height: 246, alt: "重複登録レビュー画面" }],
  },
  {
    title: "10. データを出力する",
    paragraphs: [
      "「データ出力」タブでは、出展者一覧（全項目）のほか、電源・備品一覧／車両一覧／スタッフ一覧のようにテンプレート別に絞り込んだCSV、ブランド紹介CSV＋ロゴZIPを出力できます。非公開メモ・請求書ファイルは出力に含まれません。",
    ],
    shots: [{ src: "/help/export-page.jpg", width: 1605, height: 562, alt: "データ出力ページ" }],
  },
  {
    title: "11. プラン・課金を確認する",
    paragraphs: [
      "サイドバーの「プラン・課金」では、現在の課金対象出展者数・基本料金・超過分・今期の見込み金額、請求履歴を確認できます。カード登録もここから行います。",
    ],
    shots: [{ src: "/help/plan-page.jpg", width: 657, height: 541, alt: "プラン・課金ページ" }],
  },
  {
    title: "12. チームメンバーを招待する",
    paragraphs: [
      "サイドバーの「チーム管理」から、メールアドレスとロール（管理者／スタッフ）を指定してメンバーを招待できます。イベント設定担当と請求書担当が別の人の場合など、それぞれが自分のログインで作業できるようになります。",
      "招待するとメール送信直後に「招待中」欄に表示され、期限内であれば「取り消す」こともできます。",
      "現在のロールは「オーナー／管理者／スタッフ」の3段階で、課金・チーム管理を除きすべて同じ操作が可能です。機能ごとの細かい権限分けは今後の対応予定です。",
    ],
    shots: [
      { src: "/help/team-page.jpg", width: 676, height: 531, alt: "チーム管理ページ" },
      { src: "/help/team-role-dropdown.jpg", width: 676, height: 517, alt: "招待時のロール選択" },
      { src: "/help/team-invite-pending.jpg", width: 641, height: 139, alt: "招待中のメンバー表示" },
    ],
  },
];

const EXHIBITOR_STEPS: Step[] = [
  {
    title: "1. メールアドレスを入力する",
    paragraphs: [
      "主催者から共有されたURLを開くと、イベント名・会場・開催日とメールアドレス入力欄が表示されます。アカウント登録やパスワードは不要です。",
      "「確認メールを送信」を押すと確認メールが届きます。",
    ],
    shots: [
      { src: "/help/exhibitor-entry-email.jpg", width: 606, height: 480, alt: "出展者エントリー画面" },
      { src: "/help/exhibitor-entry-sent.jpg", width: 561, height: 420, alt: "確認メール送信後の画面" },
    ],
  },
  {
    title: "2. フォームに入力する",
    paragraphs: [
      "メール内のリンクを開くと入力画面が表示されます。入力内容は自動保存されるため、途中で中断しても後から再開できます（画面右上に「自動保存されました」と表示されます）。",
    ],
    shots: [{ src: "/help/exhibitor-form-filled.jpg", width: 516, height: 936, alt: "出展者フォーム入力画面（入力例）" }],
  },
  {
    title: "3. 提出する",
    paragraphs: [
      "「この内容で提出する」を押すと提出完了です。以降は「資料一覧を見る」「請求書を見る」から、自分向けに公開された情報を確認できます。",
    ],
    shots: [{ src: "/help/exhibitor-submit-done.jpg", width: 533, height: 398, alt: "提出完了画面" }],
  },
  {
    title: "4. 資料を確認する",
    paragraphs: [
      "主催者が資料を公開すると、メールで通知が届きます。内容を確認したら「確認しました」を押してください（「確認必須」に設定されている場合、この操作をしないと未確認のままになります）。",
    ],
    shots: [{ src: "/help/exhibitor-announcement-view.jpg", width: 486, height: 226, alt: "出展者側の資料確認画面" }],
  },
  {
    title: "5. 請求書を確認する",
    paragraphs: [
      "請求書が発行されると通知が届きます。「請求書ファイルをダウンロード」で内容を確認し、「内容を確認しました」を押します。",
      "入金確認は主催者側で行われるため、実際の入金状況はこの画面には反映されません。振込後は主催者からの確認をお待ちください。",
    ],
    shots: [{ src: "/help/invoice-detail-exhibitor.jpg", width: 493, height: 287, alt: "出展者側の請求書確認画面" }],
  },
  {
    title: "6. チームに招待された場合",
    paragraphs: [
      "組織のメンバーとして招待された場合は、メール内のリンクを開くと招待内容（組織名・ロール）が表示されます。「組織に参加する」を押すと参加完了です（初めて利用する場合は、その場でログイン用のパスワード設定もあわせて行います）。",
    ],
    shots: [{ src: "/help/invite-accept.jpg", width: 396, height: 206, alt: "招待受諾画面" }],
  },
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
  {
    q: "チームメンバーのロールは何が違いますか？",
    a: "オーナー・管理者・スタッフの3段階です。現在は課金（プラン・課金画面）とチーム管理（招待・削除・ロール変更）を除き、すべてのロールで同じ操作が可能です。機能エリアごとの細かい権限分け（例：請求書担当にはイベント編集権限を与えない）は今後の対応予定です。",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">使い方・よくある質問</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          TenjiPortの使い方を画面キャプチャつきで詳しく説明します。まずは下の「主催者編」から順にお読みください。
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-1 py-4 text-sm">
          <a href="#organizer" className="text-primary underline-offset-4 hover:underline">
            主催者編（イベント作成〜チーム招待まで）
          </a>
          <a href="#exhibitor" className="text-primary underline-offset-4 hover:underline">
            出展者編（招待された側が見る画面）
          </a>
          <a href="#faq" className="text-primary underline-offset-4 hover:underline">
            よくある質問
          </a>
        </CardContent>
      </Card>

      <Card id="organizer">
        <CardHeader>
          <CardTitle className="text-base">主催者編</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {ORGANIZER_STEPS.map((step) => (
            <StepBlock key={step.title} step={step} />
          ))}
        </CardContent>
      </Card>

      <Card id="exhibitor">
        <CardHeader>
          <CardTitle className="text-base">出展者編</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {EXHIBITOR_STEPS.map((step) => (
            <StepBlock key={step.title} step={step} />
          ))}
        </CardContent>
      </Card>

      <Card id="faq">
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

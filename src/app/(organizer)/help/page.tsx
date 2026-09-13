import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Shot = { src: string; width: number; height: number; alt: string };

type Step = {
  id: string;
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
    <div id={step.id} className="flex scroll-mt-6 flex-col gap-3 border-b pb-6 last:border-b-0 last:pb-0">
      <p className="text-sm font-semibold">{step.title}</p>
      {step.paragraphs.map((p, i) => (
        <p key={i} className="text-sm text-muted-foreground whitespace-pre-line">
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

// 「しくみ」セクション用：番号つきの手順として繋がりを説明するブロック。
function FlowStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
      </span>
      <span className="text-sm text-muted-foreground">{children}</span>
    </li>
  );
}

const ORGANIZER_STEPS: Step[] = [
  {
    id: "org-1",
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
    id: "org-2",
    title: "2. イベントの状態を確認する",
    paragraphs: [
      "作成すると概要ページが開きます。上部のタブ（概要／フォーム設定／出展者一覧／資料／請求書／重複レビュー／データ出力）から各機能に移動できます。",
      "「状態」プルダウンでは下書き・公開中・終了・アーカイブを選べますが、これは管理画面での一覧表示・整理用のラベルです。出展者が実際に入力できるかどうかは、次の「フォーム設定」の公開操作とあわせて決まります（両方が必要です）。",
      "ダッシュボードには出展者数・未確認の資料・未入金・通知の送信失敗のタイル（クリックで該当ページへ移動）と、提出状況の内訳バー（未提出／下書き中／提出済み／修正依頼中／確認済み）が表示されます。「通知の送信失敗」タイルは、資料・請求書・修正依頼のうち実際に失敗が多い種類のページへ自動的に案内されます。",
    ],
    shots: [
      { src: "/help/event-overview.jpg", width: 1557, height: 732, alt: "イベント概要ページ" },
      { src: "/help/event-status-dropdown.jpg", width: 591, height: 503, alt: "状態プルダウンを開いた状態" },
    ],
  },
  {
    id: "org-3",
    title: "3. フォームを設計して公開する",
    paragraphs: [
      "「フォーム設定」タブで、出展者への共有URLと入力フォームの項目を管理します。",
      "「+ブランド共通情報」などのテンプレートボタンを押すと、よく使うセクション（ブランド共通情報・広報素材・開催別情報・電源備品・車両搬入出・スタッフ）を項目ごと一括で追加できます。個別に項目を追加することもできます。",
      "単一選択・複数選択の項目は、通常の「選択肢（カンマ区切り）」の代わりに「価格・在庫付きの選択肢」を使うと、コマ選択のような価格・在庫管理付きの項目にできます。1行に「選択肢名,価格円,在庫上限」の形式で入力します（例：「コマA(3m×3m),15000,10」「コマB(3m×6m),28000,5」。在庫上限は空欄で無制限）。これを設定すると、出展者の選択（数量含む）に応じた金額が自動計算され、出展者一覧・請求書に反映されます。金額の連携の詳細は下の「しくみ：料金はこう繋がっています」を参照してください。",
      "項目を用意したら「公開して出展者を募集する」を押すと、共有URLが実際に開放されます。",
    ],
    shots: [
      { src: "/help/form-settings.jpg", width: 1485, height: 912, alt: "フォーム設定ページ" },
      { src: "/help/form-priced-choice-list.jpg", width: 1400, height: 900, alt: "価格・在庫付きの選択肢を設定した項目の表示例" },
    ],
  },
  {
    id: "org-4",
    title: "4. 公開前にプレビューで確認する",
    paragraphs: [
      "「出展者としてプレビュー」を押すと、実際に出展者に表示される画面を公開前に確認できます（このプレビュー画面から入力・送信はできません）。",
    ],
    shots: [{ src: "/help/form-preview.jpg", width: 781, height: 761, alt: "フォームプレビュー画面" }],
  },
  {
    id: "org-5",
    title: "5. 出展者からの提出を確認する",
    paragraphs: [
      "「出展者一覧」では、提出状態・請求書・資料確認の状況を1つの表で確認できます。",
      "状態で絞り込んだり、提出日時・ブランド名で並べ替えたりできるほか、チェックボックスで選んだ出展者だけをまとめてダウンロード（提出内容CSV＋アップロード済みファイル）することもできます。",
      "「表示項目」から「確定金額（コマ等）」列を追加すると、価格・在庫付きの選択肢を設定している場合に、各出展者の選択内容から自動計算された金額をこの一覧上で確認できます（下のスクリーンショットは表示項目に追加した状態）。",
    ],
    shots: [
      { src: "/help/exhibitors-list.jpg", width: 1601, height: 353, alt: "出展者一覧画面" },
      { src: "/help/exhibitors-list-with-price.jpg", width: 1400, height: 900, alt: "出展者一覧画面（確定金額列を表示した状態）" },
    ],
  },
  {
    id: "org-6",
    title: "6. 出展者の詳細を確認・修正依頼する",
    paragraphs: [
      "ブランド名をクリックすると詳細画面が開きます。「確認済みにする」で内容を確認済みに、「修正を依頼する」で出展者に再入力をお願いできます（例：「電話番号が間違っています。修正をお願いいたします。」）。",
      "依頼を送ると「修正依頼中」の表示に変わり、依頼内容が履歴として記録されます。各依頼の通知が「失敗」した場合は、履歴カードに赤字でエラー内容が表示され、「修正依頼を再送する」ボタンから同じ内容を再送できます（出展者がまだ修正依頼に対応していない場合のみ表示されます）。",
    ],
    shots: [
      { src: "/help/exhibitor-detail.jpg", width: 686, height: 767, alt: "出展者詳細画面（修正依頼前）" },
      { src: "/help/exhibitor-detail-revision.jpg", width: 656, height: 733, alt: "出展者詳細画面（修正依頼後）" },
      { src: "/help/exhibitor-detail-revision-resend.jpg", width: 1400, height: 1329, alt: "出展者詳細画面（通知失敗時の再送ボタン）" },
    ],
  },
  {
    id: "org-7",
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
    id: "org-8",
    title: "8. 発行元情報・銀行口座を設定する",
    paragraphs: [
      "サイドバーの「設定」（オーナー・管理者のみ）で、組織名・請求先メールアドレスに加えて、請求書PDFに記載する発行元情報（会社名・郵便番号・住所・電話番号・適格請求書発行事業者登録番号）と、出展者への振込先となる銀行口座（銀行名・支店名・口座種別・口座番号・口座名義）を登録します。",
      "この情報が請求書にどう反映されるかは、下の「しくみ：発行元・銀行口座はこう反映されます」で詳しく説明しています。次の「請求書を作成する」より先に、一度ここを設定しておくことをおすすめします。",
    ],
    shots: [{ src: "/help/settings-page.jpg", width: 1400, height: 1452, alt: "設定ページ（発行元情報・銀行口座）" }],
  },
  {
    id: "org-9",
    title: "9. 請求書を作成する",
    paragraphs: [
      "請求書の作成方法は2通りあります。用途に応じて使い分けてください。",
      "【個別に作成する】「+ 新規作成」から、対象の出展者・金額・支払期限を入力し、必要であれば請求書ファイル（PDF等）を添付します（例：金額300,000円、支払期限2026/09/30）。金額欄は空欄からのスタートで自動入力されないため、出展者一覧・出展者詳細に表示されている「確定金額（コマ等）」を見ながら手入力してください。ファイルを添付しなかった場合は、設定した発行元情報・銀行口座をもとにPDFが自動生成されます。「主催者内部メモ」は出展者には表示されません。",
      "【まとめて発行する（一括発行、オーナー・管理者のみ）】「一括発行」ボタンから、フォームの選択内容による確定金額をもとに、対象の出展者を選んでまとめて発行できます。個別作成と違い金額欄は無く、確定金額がそのまま請求書の金額として使われます。確定金額が未設定、またはすでに請求書が発行済みの出展者は自動的に対象外になります。",
      "「作成して通知する」（個別）・「発行する」（一括）を押すと、その場で出展者へメール通知されます。",
      "発行済みの請求書の金額と、フォームの確定金額があとから食い違った場合（出展者が再提出で選択内容を変更した場合など）は、請求書詳細ページに警告バナーが表示されます。金額はそのままにするか、「内容を訂正する」で修正するかを選べます。未入金の請求書には「請求書を再送する」ボタンもあります。",
      "請求書詳細ページの「入金確認」欄で入金日・メモを入力し「入金済みにする」を押すと入金状態を更新できます。出展者側の「確認状態」とは別に管理されており、入金状態は主催者のみが変更できます。",
    ],
    shots: [
      { src: "/help/invoices-empty.jpg", width: 1607, height: 291, alt: "請求書一覧（作成前）" },
      { src: "/help/invoice-create-filled.jpg", width: 552, height: 525, alt: "請求書作成フォーム（入力例）" },
      { src: "/help/invoices-bulk-preview.jpg", width: 1400, height: 900, alt: "一括請求書発行プレビュー（確定金額が自動入力された状態）" },
      { src: "/help/invoice-detail-organizer.jpg", width: 550, height: 650, alt: "請求書詳細（主催者側）" },
      { src: "/help/invoice-detail-mismatch.jpg", width: 1400, height: 1005, alt: "請求書詳細（金額不一致の警告バナー）" },
    ],
  },
  {
    id: "org-10",
    title: "10. 重複登録を確認する",
    paragraphs: [
      "「重複レビュー」タブでは、メールアドレスが一致する登録、または社名の表記ゆれを吸収したうえで類似度の高い登録候補が自動的に一覧表示されます。統合してもデータは削除されず、履歴として残ります。",
      "重複判定は、出展者がフォームを提出した時だけでなく、出展者がブランドプロフィール（会社名・連絡先メールアドレス等）を編集した時にも再実行されます。編集によって新たに他の出展者と一致・類似するようになった場合、あとから重複候補として表示されることがあります。",
    ],
    shots: [{ src: "/help/duplicates-review.jpg", width: 1611, height: 246, alt: "重複登録レビュー画面" }],
  },
  {
    id: "org-11",
    title: "11. データを出力する",
    paragraphs: [
      "「データ出力」タブでは、出展者一覧（全項目）のほか、電源・備品一覧／車両一覧／スタッフ一覧のようにテンプレート別に絞り込んだCSV、ブランド紹介CSV＋ロゴZIPを出力できます。非公開メモ・請求書ファイルは出力に含まれません。",
    ],
    shots: [{ src: "/help/export-page.jpg", width: 1605, height: 562, alt: "データ出力ページ" }],
  },
  {
    id: "org-12",
    title: "12. プラン・課金を確認する",
    paragraphs: [
      "サイドバーの「プラン・課金」では、お支払い方法（カード）の登録、開催中イベントの超過分見込み金額、請求履歴を確認できます。",
      "【通常プラン】イベントを作成した時点で基本料金が即時課金され、超過分（含まれる社数を超えた分）はイベント終了日を起点に自動課金されます。カード決済が失敗した場合は自動で複数回再試行され、それでも失敗が続くと自動再試行を停止した旨の通知が届きます。「今すぐ再試行」ボタンからお支払い方法を直した後すぐに再試行することもできます。",
      "【年間プラン】個別のご案内が必要なプランで、案内対象の組織には「プラン・課金」画面に年間プランのカードが表示されます。契約時に「カード決済」または「請求書払い（銀行振込）」のいずれかを選べ、以後は年額固定で、契約期間中は出展者数に応じた従量課金は発生しません（参加者数・イベント数の上限に近づいても、出展者の入力・提出は継続できます）。標準プランと年間プランは画面上のボタンからいつでも相互に切り替えられます。",
      "請求履歴には過去の請求書PDFへのリンクも表示され、銀行振込で年間プランを契約した場合の入金確認は、TenjiPort運営側で行われます。",
    ],
    shots: [{ src: "/help/plan-page.jpg", width: 657, height: 541, alt: "プラン・課金ページ" }],
  },
  {
    id: "org-13",
    title: "13. チームメンバーを招待する",
    paragraphs: [
      "サイドバーの「チーム管理」から、メールアドレスとロール（管理者／スタッフ）を指定してメンバーを招待できます。イベント設定担当と請求書担当が別の人の場合など、それぞれが自分のログインで作業できるようになります。",
      "招待するとメール送信直後に「招待中」欄に表示され、期限内であれば「取り消す」こともできます。",
      "現在のロールは「オーナー／管理者／スタッフ」の3段階で、課金・チーム管理を除きすべて同じ操作が可能です。機能ごとの細かい権限分けは今後の対応予定です。",
      "招待された側の画面：メール内のリンクを開くと、招待内容（組織名・ロール）が表示されます。「組織に参加する」を押すと参加完了です（初めて利用する場合は、その場でログイン用のパスワード設定もあわせて行います）。すでに他の組織に所属しているアカウントで新しい組織の招待を受けても、既存の所属はそのまま残り、新しい組織が追加されます（次の「複数の組織を切り替える」を参照）。",
    ],
    shots: [
      { src: "/help/team-page.jpg", width: 676, height: 531, alt: "チーム管理ページ" },
      { src: "/help/team-role-dropdown.jpg", width: 676, height: 517, alt: "招待時のロール選択" },
      { src: "/help/team-invite-pending.jpg", width: 641, height: 139, alt: "招待中のメンバー表示" },
      { src: "/help/invite-accept.jpg", width: 396, height: 206, alt: "招待された側が見る参加画面" },
    ],
  },
  {
    id: "org-14",
    title: "14. 複数の組織を切り替える",
    paragraphs: [
      "1つのログインアカウントが複数の組織（例：別会社からチームメンバーとして招待された場合）に所属している場合、サイドバー上部の組織名をクリックすると切り替えメニューが表示されます。所属が1つだけの場合はメニューは表示されず、これまで通り組織名がそのまま表示されます。",
      "切り替えると、イベント一覧をはじめ画面全体が切り替え先の組織のデータに変わります。切り替え後は常にイベント一覧に移動するため、切り替え前に見ていたイベント固有のページ（出展者詳細等）が別組織のものとして開いたままになる心配はありません。",
    ],
    shots: [{ src: "/help/org-switcher-open.jpg", width: 1400, height: 900, alt: "組織切り替えドロップダウンを開いた状態" }],
  },
  {
    id: "org-15",
    title: "15. 監査ログを確認する",
    paragraphs: [
      "サイドバーの「監査ログ」（オーナーのみ閲覧可能）では、この組織で行われた主要な操作（請求書の作成・入金確認、提出内容の更新、修正依頼、資料の公開、プランの変更など）の変更履歴を確認できます。",
      "各行の「詳細を表示」を開くと、変更前後の内容がそのまま表示されます。誰が・いつ・何を行ったかを後から追いたい場合にご利用ください。",
    ],
    shots: [{ src: "/help/audit-log-page.jpg", width: 1400, height: 900, alt: "監査ログ画面" }],
  },
];

const EXHIBITOR_STEPS: Step[] = [
  {
    id: "ex-1",
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
    id: "ex-2",
    title: "2. フォームに入力する",
    paragraphs: [
      "メール内のリンクを開くと入力画面が表示されます。入力内容は自動保存されるため、途中で中断しても後から再開できます（画面右上に「自動保存されました」と表示されます）。",
      "コマ選択のように価格・在庫が設定された項目では、選択肢ごとに金額と残数が表示されます。在庫が埋まっている選択肢は選べません。数量を指定できる項目では、選んだ数量に応じて金額が自動計算されます。",
      "同じメールアドレスで複数のブランドを出展する場合（例：同じ会社の別ブランド、複数店舗など）は、提出後に新しいブランドとして追加で入力を始めることができます。",
    ],
    shots: [{ src: "/help/exhibitor-form-filled.jpg", width: 516, height: 936, alt: "出展者フォーム入力画面（入力例）" }],
  },
  {
    id: "ex-3",
    title: "3. 提出する",
    paragraphs: [
      "「この内容で提出する」を押すと提出完了です。以降は「資料一覧を見る」「請求書を見る」から、自分向けに公開された情報を確認できます。",
    ],
    shots: [{ src: "/help/exhibitor-submit-done.jpg", width: 533, height: 398, alt: "提出完了画面" }],
  },
  {
    id: "ex-4",
    title: "4. 資料を確認する",
    paragraphs: [
      "主催者が資料を公開すると、メールで通知が届きます。内容を確認したら「確認しました」を押してください（「確認必須」に設定されている場合、この操作をしないと未確認のままになります）。",
    ],
    shots: [{ src: "/help/exhibitor-announcement-view.jpg", width: 486, height: 226, alt: "出展者側の資料確認画面" }],
  },
  {
    id: "ex-5",
    title: "5. 請求書を確認する",
    paragraphs: [
      "請求書が発行されると通知が届きます。「請求書ファイルをダウンロード」で内容を確認し、「内容を確認しました」を押します。振込先の銀行口座も同じ画面に表示されます（主催者が設定した情報がそのまま表示されます）。",
      "同一イベントに複数のブランドで参加している場合、請求書一覧にはすべてのブランド分の請求書がブランド名つきで表示されます。",
      "入金確認は主催者側で行われるため、実際の入金状況はこの画面には反映されません。振込後は主催者からの確認をお待ちください。",
    ],
    shots: [{ src: "/help/invoice-detail-exhibitor.jpg", width: 493, height: 287, alt: "出展者側の請求書確認画面" }],
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
    q: "請求書の金額は、フォームで設定した価格から自動で入力されますか？",
    a: "発行方法によって異なります。「一括発行」を使う場合は、フォームの選択内容から自動計算された確定金額がそのまま請求書の金額になり、金額を手入力する必要はありません。「+新規作成」で個別に発行する場合は金額欄は空欄からのスタートで、出展者一覧・出展者詳細に表示されている確定金額を見ながら主催者が手入力する必要があります。発行後に金額が食い違った場合は、請求書詳細ページに警告が表示されます。",
  },
  {
    q: "設定ページの銀行口座情報を変更すると、すでに発行した請求書PDFも更新されますか？",
    a: "更新されません。請求書PDFは発行した時点の発行元情報・銀行口座情報のスナップショットで、あとから設定を変更しても過去に発行済みのPDFは自動的には書き換わりません。銀行口座等の変更を予定している場合は、請求書を発行する前に設定を済ませておくことをおすすめします。",
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
    a: "「重複登録レビュー」画面でメールアドレスが一致する登録、または社名が類似している登録候補を確認し、統合または別物として扱う判断ができます。統合してもデータは削除されず、履歴として残ります。誤って課金された分は補正行として事後的に是正されます。なお重複判定は提出時だけでなく、出展者がブランドプロフィールを編集した際にも再実行されます。",
  },
  {
    q: "年間プランと通常プラン（従量課金）の違いは何ですか？",
    a: "通常プランは提出完了した出展者数に応じて都度課金されます。年間プランは年額固定で、契約期間中は出展者数に応じた従量課金は発生しません（上限に近づいても出展者の入力・提出は継続できます）。年間プランは大型のご利用を想定した個別のご案内となっており、ご案内対象になると「プラン・課金」画面から自分でカード決済または請求書払いを選んで契約でき、以後の切り替えもセルフサービスで行えます。ご希望の場合はお見積りをいたしますので担当者までお問い合わせください。",
  },
  {
    q: "出力したCSV・ZIPに他社の情報が混ざっていないか心配です。",
    a: "出力機能は組織・イベントの権限に基づいて生成されるため、他の主催者や他イベントのデータが混ざることはありません。ファイルZIP出力も、ダウンロード時に都度アクセス権限を再確認しています。",
  },
  {
    q: "チームメンバーのロールは何が違いますか？",
    a: "オーナー・管理者・スタッフの3段階です。現在は課金（プラン・課金画面）とチーム管理（招待・削除・ロール変更）、設定（発行元情報・銀行口座）、監査ログ（オーナーのみ）を除き、すべてのロールで同じ操作が可能です。機能エリアごとの細かい権限分け（例：請求書担当にはイベント編集権限を与えない）は今後の対応予定です。",
  },
  {
    q: "複数の組織に所属している場合、招待を受けるとどうなりますか？",
    a: "既存の所属はそのまま残り、新しい組織への所属が追加されます。ログイン後はサイドバー上部の組織名から、いつでも所属組織を切り替えて操作できます。",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">使い方・よくある質問</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          TenjiPortの使い方を画面キャプチャつきで詳しく説明します。まずは下の「主催者編」から順にお読みください。機能どうしがどう連携しているかは「しくみ」の章にまとめています。
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-4 text-sm">
          <a href="#mechanism" className="font-medium text-primary underline-offset-4 hover:underline">
            しくみ：機能はこう繋がっています
          </a>
          <div className="flex flex-col gap-1">
            <p className="font-medium">主催者編</p>
            <div className="ml-3 flex flex-col gap-0.5">
              {ORGANIZER_STEPS.map((step) => (
                <a key={step.id} href={`#${step.id}`} className="text-primary underline-offset-4 hover:underline">
                  {step.title}
                </a>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium">出展者編</p>
            <div className="ml-3 flex flex-col gap-0.5">
              {EXHIBITOR_STEPS.map((step) => (
                <a key={step.id} href={`#${step.id}`} className="text-primary underline-offset-4 hover:underline">
                  {step.title}
                </a>
              ))}
            </div>
          </div>
          <a href="#faq" className="font-medium text-primary underline-offset-4 hover:underline">
            よくある質問
          </a>
        </CardContent>
      </Card>

      <Card id="mechanism">
        <CardHeader>
          <CardTitle className="text-base">しくみ：機能はこう繋がっています</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-8">
          <div className="flex flex-col gap-3 border-b pb-8 last:border-b-0 last:pb-0">
            <p className="text-sm font-semibold">料金はこう繋がっています（フォームの価格設定 → 請求書）</p>
            <ol className="flex flex-col gap-2.5">
              <FlowStep n={1}>
                フォーム設定で、単一選択・複数選択の項目に「価格・在庫付きの選択肢」を設定する（例：コマA ¥15,000・在庫10、コマB
                ¥28,000・在庫5）。
              </FlowStep>
              <FlowStep n={2}>
                出展者がいずれかを選択・数量を指定して提出すると、選んだ内容から金額が自動計算され、その出展者の「確定金額（コマ等）」として保存される（在庫上限も同時にチェックされ、埋まっている選択肢はそもそも選べません）。
              </FlowStep>
              <FlowStep n={3}>
                請求書を発行する際：「一括発行」なら確定金額がそのまま請求書の金額として自動入力される（金額欄自体が無い）。個別に「+新規作成」で発行する場合は金額欄は空欄で、出展者一覧・出展者詳細の確定金額を見ながら手入力する必要がある。
              </FlowStep>
              <FlowStep n={4}>
                発行後に出展者が再提出して選択内容を変えた場合など、請求書の金額とフォームの確定金額が食い違うと、請求書詳細ページに警告バナーが表示される（自動では修正されない）。
              </FlowStep>
              <FlowStep n={5}>
                請求書PDFの品目欄は、出展者の最新の選択内容から品目・数量・金額を自動的に再構成する。ただし合計が請求書の金額と一致しない場合は、実態と異なる内訳を見せないよう「出展料」1行のみの表示に切り替わる。
              </FlowStep>
            </ol>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold">発行元・銀行口座はこう反映されます（設定 → 請求書PDF）</p>
            <ol className="flex flex-col gap-2.5">
              <FlowStep n={1}>
                「設定」ページ（オーナー・管理者のみ）で、発行元情報（会社名・住所・電話番号・適格請求書発行事業者登録番号）と銀行口座を登録する。
              </FlowStep>
              <FlowStep n={2}>
                以後、ファイルを手動添付せずに発行した請求書は、この情報をもとにPDFが自動生成される（発行元欄・お振込先欄に反映）。手動でPDFファイルを添付して発行した場合は、その自社ファイルがそのまま使われ、この自動反映は行われない。
              </FlowStep>
              <FlowStep n={3}>
                出展者側の請求書確認画面（Web）にも、同じ銀行口座情報がその場で表示される（PDFとは別に、常に最新の設定を参照する）。
              </FlowStep>
              <FlowStep n={4}>
                すでに自動生成された請求書PDFは、生成した時点のスナップショット。あとから設定を変更しても、過去に発行済みのPDFは自動更新されない。変更予定がある場合は、請求書を発行する前に設定を済ませておくと安全。
              </FlowStep>
            </ol>
            <p className="text-xs text-muted-foreground">
              なお、この銀行口座はあくまで「主催者が出展者から受け取る」ための口座です。TenjiPortの利用料金（プラン・課金）の請求書は別の仕組みで、TenjiPort側の発行元情報が使われます（設定ページの内容とは連動しません）。
            </p>
          </div>
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

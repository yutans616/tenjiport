// 営業資料（サービス紹介PDF・初回ご検討用、16:9横型）をHTML+Playwrightで生成する。
// 実行: node scripts/build-service-guide-pdf.mjs
// 出力: public/demo/tenjiport-service-guide.pdf
//
// 掲載内容は実装済みの機能に限る（/help・docs/open-decisions.mdと突き合わせること）。
// 未対応の機能は「対応範囲と制約」ページに明記し、本文で匂わせない。
// スクリーンショットはpublic/demo・public/help配下の既存画像を使う。社内URLやテスト用
// アカウントが写り込んだ画像は、shot()の切り抜き範囲で写り込み部分を除外している。
import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = process.cwd();
const img = (rel) => pathToFileURL(path.join(ROOT, "public", rel)).href;

const CREATED_AT = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long" });
const BOOKING_URL = "https://timerex.net/s/yutans616_d8ea/d14a6b7e";

// ---------------------------------------------------------------------------
// 部品
// ---------------------------------------------------------------------------

// lucideアイコン（ストロークのみ）のパス。
const ICONS = {
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  sliders:
    '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  database:
    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  play: '<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z"/>',
  calendar:
    '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/>',
};
const ico = (name, size = 28, color = "#0068C8") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const arrow = (w = 28) =>
  `<svg class="arrow" width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="#9DB4CF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;

// スクリーンショットを元画像の任意範囲(sx,sy,sw,sh)で切り抜き、表示幅wで配置する。
function shot(rel, natW, { w, sx = 0, sy = 0, sw = natW, sh, alt = "" }) {
  const k = w / sw;
  return `<div class="shot" style="width:${w}px;height:${Math.round(sh * k)}px">
    <img alt="${alt}" src="${img(rel)}" style="width:${Math.round(natW * k)}px;left:${-Math.round(sx * k)}px;top:${-Math.round(sy * k)}px" />
  </div>`;
}

const head = (eyebrow, title, { accent = false } = {}) => `
  <div class="head">
    <p class="eyebrow${accent ? " orange" : ""}">${eyebrow}</p>
    <h2>${title}</h2>
  </div>`;

const card = (title, body, { icon, small = false } = {}) => `
  <div class="card${small ? " small" : ""}">
    ${icon ? `<div class="card-icon">${ico(icon, 24)}</div>` : ""}
    <h3>${title}</h3>
    <p>${body}</p>
  </div>`;

const listCard = (title, items, { icon } = {}) => `
  <div class="card">
    ${icon ? `<div class="card-row">${ico(icon, 26)}<h3>${title}</h3></div>` : `<h3>${title}</h3>`}
    <ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>
  </div>`;

const step = (n, title, body) => `
  <div class="step">
    <span class="num">${n}</span>
    <div><h3>${title}</h3><p>${body}</p></div>
  </div>`;

const flowRow = (labels, { last = null } = {}) =>
  `<div class="flow">${labels
    .map(
      (l, i) =>
        `<div class="flow-item${i === labels.length - 1 && last ? ` ${last}` : ""}">${l}</div>${i < labels.length - 1 ? arrow(22) : ""}`,
    )
    .join("")}</div>`;

// ---------------------------------------------------------------------------
// ページ
// ---------------------------------------------------------------------------

const pages = [];
const page = (kind, html) => pages.push({ kind, html });

// 1. 表紙
page(
  "cover",
  `
  <div class="cover-text">
    <img class="logo" src="${img("tenjiport_logo.png")}" alt="TenjiPort" />
    <p class="eyebrow light">展示会・出展者管理クラウド</p>
    <h1>出展者運営を、<br/>ひとつの画面に。</h1>
    <p class="lead">情報収集、資料配布、確認状況、請求と入金確認までを<br/>主催者と出展者の両方の画面でつなぎます。</p>
    <p class="meta">サービス資料（初回ご検討用）｜${CREATED_AT}｜株式会社BlackishGear</p>
  </div>
  <div class="cover-shot">
    ${shot("demo/hero-exhibitors.png", 1280, { w: 600, sx: 256, sy: 100, sw: 1024, sh: 480, alt: "主催者ダッシュボード" })}
    <p class="caption light">主催者ダッシュボード（デモ環境・架空データ）</p>
  </div>`,
);

// 2. この資料について
page(
  "light",
  `
  ${head("ABOUT THIS DOCUMENT", "この資料でわかること")}
  <div class="cols" style="gap:28px">
    <div class="col" style="flex:1.1">
      <div class="toc">
        <div class="toc-row"><span>01</span><p><b>課題とTenjiPortの概要</b><br/>出展者運営でよくある課題と、TenjiPortが担う範囲</p></div>
        <div class="toc-row"><span>02</span><p><b>機能の詳細</b><br/>フォーム・提出管理・資料配布・請求・出力・権限</p></div>
        <div class="toc-row"><span>03</span><p><b>セキュリティと対応範囲</b><br/>情報管理の仕組みと、現時点で対応していないこと</p></div>
        <div class="toc-row"><span>04</span><p><b>料金と導入の進め方</b><br/>料金プラン、導入の流れ、ご検討チェックリスト</p></div>
      </div>
    </div>
    <div class="col dark-box" style="flex:0.9">
      <p class="eyebrow light">ご検討の進め方</p>
      <div class="mini-steps">
        <p><b>1</b>　本資料で全体像を把握する</p>
        <p><b>2</b>　登録不要のデモで、主催者・出展者の画面を操作する</p>
        <p><b>3</b>　巻末のチェックリストで、現状の運用を整理する</p>
        <p><b>4</b>　15分の導入相談で、貴社の運用に合うかを確認する</p>
      </div>
    </div>
  </div>`,
);

// 3. 課題
page(
  "light",
  `
  ${head("CHALLENGES", "出展者運営で、こんな課題はありませんか")}
  <div class="grid3">
    ${card("1　窓口の分散", "出展者からの問い合わせや提出物が、メール・電話・個別連絡に分散している", { small: true })}
    ${card("2　提出状況の把握", "誰が提出済みで誰が未提出か、メールとExcelを照合しないと分からない", { small: true })}
    ${card("3　資料の周知", "配布した出展要項や搬入案内を、相手が確認したかどうか分からない", { small: true })}
    ${card("4　請求と入金の管理", "請求書の発行と入金確認が、別々の表やファイルに分かれている", { small: true })}
    ${card("5　繰り返しの入力", "開催のたびに、同じ出展者へ同じ項目を入力してもらっている", { small: true })}
    ${card("6　版と履歴の管理", "最新の資料や入力内容がどれか、誰がいつ何を変えたかを追えない", { small: true })}
  </div>
  <div class="band">${ico("bulb", 26, "#7CC0FF")}<p>TenjiPortは、出展が決まった後のこうしたやり取りを、ひとつの画面にまとめます。</p></div>`,
);

// 4. TenjiPortとは
page(
  "light",
  `
  ${head("ABOUT TENJIPORT", "TenjiPortとは")}
  <div class="cols">
    ${card("出展者はログイン不要", "主催者が共有するURLから、メール確認だけで入力を始められます。パスワード登録は不要です。", { icon: "users" })}
    ${card("状況をひとつの画面に", "提出状況・資料の確認状況・請求と入金の状況を、一覧とダッシュボードで把握できます。", { icon: "chart" })}
    ${card("必要な機能から導入", "フォームを最小限の項目にすれば、資料配布や請求の管理から使い始めることもできます。", { icon: "sliders" })}
  </div>
  <div class="band"><p class="band-label">支援する範囲</p><p>情報収集 ＞ 確認・修正依頼 ＞ 資料配布 ＞ 請求・入金確認 ＞ データ出力</p></div>
  <p class="note">対象外：出展募集ポータル、応募審査・採否管理、集客、チケット販売。出展が決まった後の運用を支援するサービスです。</p>`,
);

// 5. 運用の全体像
const flowCard = (title, org, ex) => `
  <div class="card small">
    <h3>${title}</h3>
    <p><b class="blue">主催者</b>　${org}</p>
    <p><b>出展者</b>　${ex}</p>
  </div>`;
page(
  "light",
  `
  ${head("OVERVIEW", "運用の全体像（6つのステップ）")}
  <div class="grid3">
    ${flowCard("① 募集準備", "フォームを設計・プレビューして公開", "共有URLを受け取る")}
    ${flowCard("② 情報収集", "提出状況をダッシュボードで把握", "メール確認 → 入力 → 提出")}
    ${flowCard("③ 確認・修正", "確認済みにする／修正を依頼する", "指摘された項目を直して再提出")}
    ${flowCard("④ 資料配布", "公開して通知、未確認者へ再通知", "資料を読んで「確認しました」")}
    ${flowCard("⑤ 請求・入金", "請求書の発行と入金の確認", "請求書を確認して銀行振込")}
    ${flowCard("⑥ 出力・次回へ", "CSV・ZIPの出力、重複登録の統合", "次回は登録済みの情報を再利用")}
  </div>
  <p class="note">以降のページで、ステップごとに機能を詳しくご説明します。</p>`,
);

// 6. イベントとチーム
page(
  "light",
  `
  ${head("EVENTS &amp; TEAM", "イベントとチームの管理")}
  <div class="flow">
    <div class="flow-item dark" style="flex:1">組織</div>${arrow(22)}
    <div class="flow-item" style="flex:2">イベント（開催・併催ごとに作成）</div>${arrow(22)}
    <div class="flow-item white" style="flex:1">出展者（ブランド単位）</div>
  </div>
  <div class="cols">
    ${listCard("イベント管理", [
      "フォーム・出展者・資料・請求書をイベント単位で管理",
      "状態ラベル：下書き／公開中／終了／アーカイブ",
      "受付は「イベントの状態」と「フォームの公開」の両方で制御",
      "開催終了日は作成日から最大24ヶ月以内",
    ])}
    ${listCard("チーム・組織", [
      "メールで招待（オーナー／管理者／スタッフ）",
      "複数の組織に所属しても、サイドバーで切り替え",
      "発行元情報・適格請求書の登録番号・振込先口座を一度設定",
      "主要な操作の変更履歴を監査ログで確認（オーナーのみ）",
    ])}
  </div>`,
);

// 7. フォーム設計
const chip = (t) => `<span class="chip">${t}</span>`;
page(
  "light",
  `
  ${head("STEP ①　FORM", "出展者フォームの設計")}
  <div class="cols" style="gap:24px;align-items:flex-start">
    <div class="col" style="flex:1.15;gap:16px">
      <div>
        <p class="label">使える項目タイプ（9種類）</p>
        <div class="chips">${["短文", "長文", "数値", "日付", "単一選択", "複数選択", "チェック", "ファイル", "繰り返し入力"].map(chip).join("")}</div>
      </div>
      <div class="grid2">
        ${card("必須・任意と締切", "項目ごとに必須／任意、説明文、締切を設定。並び順はドラッグ＆ドロップで変更", { small: true })}
        ${card("条件分岐", "回答内容に応じて、後続の項目を表示・非表示", { small: true })}
        ${card("繰り返し入力", "スタッフ名簿のように複数行を入力（例：氏名,所属,メール）", { small: true })}
        ${card("公開前プレビュー・URL失効", "出展者に見える画面を公開前に確認。URLは再発行で失効", { small: true })}
      </div>
    </div>
    <div class="col" style="flex:0.85;gap:10px">
      <p class="label">よく使うセクションをテンプレートから一括追加</p>
      ${shot("help/form-settings.jpg", 1485, { w: 452, sx: 412, sy: 628, sw: 770, sh: 215, alt: "テンプレートからセクションを追加" })}
      <p class="small-text">ブランド共通情報・広報素材・開催別情報・希望ブース・オプション品・電源備品・車両搬入出・スタッフの8種。オプション品は長机・椅子・追加電源など一般的な品目を価格付きで用意。既存の申込書の項目をそのまま置き換えられます。</p>
    </div>
  </div>`,
);

// 8. 価格・在庫つき選択肢
page(
  "light",
  `
  ${head("STEP ①　PRICED CHOICES", "価格・在庫つきの選択肢（小間・オプション品）")}
  <div class="cols" style="gap:32px">
    <div class="col" style="flex:1.1;gap:14px">
      ${step(1, "選択肢に価格と在庫を設定", "「選択肢名,価格,在庫上限」の形式で入力（在庫は空欄で無制限）")}
      ${step(2, "出展者が選択・数量を指定", "残数を表示し、在庫が埋まった選択肢は選べない")}
      ${step(3, "確定金額を自動計算", "出展者一覧に「確定金額」の列として表示")}
      ${step(4, "請求書に反映", "選ばれた品目が明細になり、品目ごとに請求済み／未請求を管理。後から追加されたオプション品も追加請求できる")}
      <div style="margin-top:6px">
        ${shot("help/form-priced-choice-list.jpg", 1400, { w: 600, sx: 446, sy: 642, sw: 766, sh: 125, alt: "価格・在庫つき選択肢の設定画面" })}
        <p class="caption" style="margin-top:6px">実際のフォーム設定画面（選択肢ごとに価格・在庫を表示）</p>
      </div>
    </div>
    <div class="col dark-box" style="flex:0.9">
      <p class="eyebrow light">設定例（架空のデータ）</p>
      <table class="dark-table">
        <tr><th>選択肢</th><th class="r">価格</th><th class="r">在庫</th></tr>
        <tr><td>コマA（3m×3m）</td><td class="r">¥15,000</td><td class="r">10</td></tr>
        <tr><td>コマB（3m×6m）</td><td class="r">¥28,000</td><td class="r">5</td></tr>
      </table>
      <p class="light-text">出展者がコマBを2つ選ぶと、確定金額は ¥56,000 と自動計算されます。</p>
      <p class="light-text muted">※ コマ図の自動配置は対象外です。</p>
    </div>
  </div>`,
);

// 9. 出展者の入力体験
page(
  "light",
  `
  ${head("STEP ②　EXHIBITOR EXPERIENCE", "出展者の入力体験")}
  <div class="cols" style="gap:28px;align-items:flex-start">
    <div class="col" style="flex:1.45;gap:16px">
      ${flowRow(["共有URLを開く", "メールを入力", "届いたリンクで確認", "入力・提出"])}
      <div class="grid2">
        ${card("パスワード不要", "アカウント登録なし。再訪問も同じメール確認で入れる", { small: true })}
        ${card("自動保存・途中再開", "入力は自動で保存され、中断しても続きから再開", { small: true })}
        ${card("修正依頼への再提出", "指摘された項目とコメントを見て、そのまま再提出", { small: true })}
        ${card("情報の再利用", "ブランド情報を保存し、次回以降のイベントで使い回せる", { small: true })}
        ${card("複数ブランドで出展", "同じメールアドレスで、別ブランドとして追加入力", { small: true })}
        ${card("スマホ・PC対応", "ボット対策（Turnstile）はイベントごとに任意でON", { small: true })}
      </div>
    </div>
    <div class="col" style="flex:0.55;gap:8px;align-items:center">
      ${shot("help/exhibitor-form-filled.jpg", 516, { w: 290, sx: 20, sy: 0, sw: 476, sh: 690, alt: "出展者の入力画面" })}
      <p class="caption">出展者の入力画面（自動保存）</p>
    </div>
  </div>`,
);

// 10. 提出状況の管理
page(
  "light",
  `
  ${head("STEP ②③　SUBMISSIONS", "提出状況の管理と修正依頼")}
  <div class="cols" style="gap:28px;align-items:flex-start">
    <div class="col" style="flex:1.1;gap:10px">
      ${shot("demo/pdf-assets/organizer-exhibitors.png", 1280, { w: 600, sx: 270, sy: 260, sw: 1000, sh: 440, alt: "出展者一覧" })}
      <p class="caption">出展者一覧：提出状態・請求書・資料確認を1つの表で（デモ環境）</p>
    </div>
    <div class="col" style="flex:0.9;gap:14px">
      ${card("ダッシュボード", "出展者数・未確認の資料・未入金・通知の送信失敗をタイルで表示し、該当ページへ移動", { small: true })}
      ${card("絞り込みと一括ダウンロード", "状態で絞り込み、選んだ出展者の提出内容CSVとファイルをまとめて取得", { small: true })}
      ${card("確認・修正依頼と社内メモ", "提出内容と版の履歴を確認し、確認済み／修正依頼。依頼は履歴に残り、通知失敗時は再送。主催者だけが見られるメモも残せる", { small: true })}
    </div>
  </div>`,
);

// 11. 資料配布
page(
  "light",
  `
  ${head("STEP ④　ANNOUNCEMENTS", "資料配布と確認状況の追跡")}
  <div class="cols" style="gap:32px;align-items:flex-start">
    <div class="col" style="flex:1;gap:14px">
      ${step(1, "資料を作成", "タイトル・本文・添付ファイル（公開には添付が1件以上必要）")}
      ${step(2, "対象を選ぶ", "全出展者、または個別に選択。確認の要否も設定")}
      ${step(3, "公開して通知", "対象の出展者へメールで通知。版番号で改訂を管理")}
      ${step(4, "確認状況を追跡して再通知", "未確認の出展者にだけ再通知。開いただけでは確認済みにならない")}
      <div style="display:flex;gap:16px;align-items:center;margin-top:4px">
        ${shot("help/exhibitor-announcement-view.jpg", 486, { w: 300, sx: 20, sy: 18, sw: 440, sh: 185, alt: "出展者側の資料確認画面" })}
        <p class="caption">出展者側の画面。<br/>「確認しました」を押すと<br/>主催者側に反映</p>
      </div>
    </div>
    <div class="col" style="flex:1;gap:10px">
      ${shot("help/announcement-published.jpg", 653, { w: 560, sx: 10, sy: 8, sw: 630, sh: 300, alt: "資料の確認状況" })}
      <p class="caption">資料ごとに送信状況と確認状況を表示し、「未確認者へ再通知」で一括再送</p>
      <p class="small-text">督促は自動送信ではなく、主催者がボタンで再通知する方式です。送信に失敗した通知も画面上で把握できます。</p>
    </div>
  </div>`,
);

// 12. 請求書と入金
page(
  "light",
  `
  ${head("STEP ⑤　INVOICES", "請求書の発行と入金管理")}
  <div class="cols" style="gap:28px;align-items:flex-start">
    <div class="col" style="flex:1.2;gap:14px">
      ${listCard("発行", [
        "一括発行：未請求の品目をまとめて発行",
        "出展料とオプション品を別々の請求書で追加請求",
        "品目明細つきPDFを自動生成（自社ファイル添付も可）",
      ])}
      ${listCard("確認と入金", [
        "出展者は請求書の内訳と振込先口座を画面で確認",
        "「確認状態」は出展者、「入金状態」は主催者が更新",
        "未入金の出展者へまとめて督促",
        "入金確認は手動（銀行口座との自動照合は非対応）",
      ])}
      <div class="band small">${ico("shield", 22, "#7CC0FF")}<p style="font-size:15px">インボイス制度：適格請求書発行事業者の登録番号を設定すると、請求書PDFの発行元欄に反映されます。</p></div>
    </div>
    <div class="col" style="flex:0.8;gap:10px">
      ${shot("demo/pdf-assets/organizer-invoice.png", 1024, { w: 400, sx: 252, sy: 332, sw: 520, sh: 345, alt: "請求内容" })}
      ${shot("demo/pdf-assets/organizer-invoice.png", 1024, { w: 400, sx: 252, sy: 738, sw: 520, sh: 236, alt: "入金確認" })}
      <p class="caption">請求内容と入金確認の画面（デモ環境）</p>
    </div>
  </div>`,
);

// 13. 出力と重複
page(
  "light",
  `
  ${head("STEP ⑥　EXPORT &amp; DATA QUALITY", "データ出力と重複登録の管理")}
  <div class="cols">
    ${listCard(
      "データ出力",
      [
        "出展者一覧（全項目）をCSVで出力。Excelでそのまま開ける",
        "電源・備品／車両／スタッフ一覧をテンプレート別に出力",
        "料金・請求一覧：品目・小計・請求額・入金状況・未請求額を出展者ごとに出力",
        "ブランド紹介CSVとロゴのZIPを出力",
        "社内メモ・請求書ファイルは出力に含まれない",
        "組織・イベントの権限に基づいて生成",
      ],
      { icon: "database" },
    )}
    ${listCard(
      "重複登録のレビュー",
      [
        "メールアドレスの一致、社名の表記ゆれを吸収した類似を自動検知",
        "統合するか、別物として扱うかを主催者が判断",
        "統合してもデータは削除されず、履歴に残る",
        "提出時だけでなく、ブランド情報の編集時にも再判定",
      ],
      { icon: "search" },
    )}
  </div>`,
);

// 14. セキュリティ
page(
  "light",
  `
  ${head("SECURITY &amp; DATA MANAGEMENT", "セキュリティとデータ管理")}
  <div class="grid3">
    ${card("通信の暗号化", "すべての通信を暗号化（HTTPS）", { icon: "lock", small: true })}
    ${card("データの分離", "組織・イベント単位で分離し、アクセス制御はデータベース側でも実施", { icon: "database", small: true })}
    ${card("権限と監査ログ", "オーナー／管理者／スタッフ。主要な操作は変更前後の内容を記録", { icon: "users", small: true })}
    ${card("出展者の認証", "メール確認によるパスワードレス。ボット対策はイベントごとに任意でON", { icon: "key", small: true })}
    ${card("保存期間", "終了から2年で提出物・添付を自動削除。請求書PDFは対象外", { icon: "clock", small: true })}
    ${card("決済情報", "利用料のカード決済はStripeで処理。カード番号は当社で保持しない", { icon: "shield", small: true })}
  </div>
  <p class="note">セキュリティチェックシートへのご回答など、貴社の要件に応じた確認は導入相談で承ります。</p>`,
);

// 15. 対応範囲と制約
page(
  "light",
  `
  ${head("現時点の対応範囲｜対応していないことも先にお伝えします", "対応範囲と制約", { accent: true })}
  <table class="table">
    <tr><th style="width:36%">項目</th><th style="width:22%">現状</th><th>代わりの方法・補足</th></tr>
    <tr><td>出展募集・応募審査・集客・チケット販売</td><td>対象外</td><td>出展が決まった後の運用を支援</td></tr>
    <tr><td>コマ図の自動配置</td><td>非対応</td><td>小間は価格・在庫つきの選択肢で申込を受付</td></tr>
    <tr><td>出展者情報の一括取り込み</td><td>非対応</td><td>出展者が共有URLから登録（過去の出展者は招待可）</td></tr>
    <tr><td>銀行入金の自動照合・出展料のカード決済代行</td><td>非対応</td><td>請求書＋銀行振込、入金は主催者が更新</td></tr>
    <tr><td>SSO・外部公開API</td><td>非対応</td><td>CSV出力で既存のシステムと連携</td></tr>
    <tr><td>LINE・SMS通知、ネイティブアプリ</td><td>非対応</td><td>メール通知とWeb（スマホ対応）</td></tr>
    <tr><td>英語など多言語表示</td><td>非対応</td><td>日本語のみ</td></tr>
    <tr><td>機能ごとの細かい権限</td><td>3ロール</td><td>設定・課金・招待・一括操作は管理者以上、監査ログはオーナー</td></tr>
    <tr><td>容量・期間の上限</td><td>上限あり</td><td>ファイルは1イベント200MBまで、開催は作成から24ヶ月以内</td></tr>
  </table>`,
);

// 16. 料金
page(
  "light",
  `
  ${head("PRICING｜すべて税込", "料金プラン")}
  <div class="cols">
    <div class="card price-card"><p class="label blue">開催ごとプラン</p><p class="price">¥9,800</p><p>1開催・30社まで。31社目から1社 ¥300</p></div>
    <div class="card price-card"><p class="label blue">年間プラン</p><p class="price">¥298,000</p><p>年6開催・各開催300社まで。カードまたは請求書払い</p></div>
    <div class="card price-card dark"><p class="label">個別見積もり</p><p class="price">ご相談</p><p>年7開催以上、または1開催301社以上の場合</p></div>
  </div>
  <div>
    <p class="label">開催ごとプランの料金例（各開催の出展者数が同じ場合の概算）</p>
    <table class="table numeric">
      <tr><th style="width:28%">出展者数</th><th>30社</th><th>100社</th><th>200社</th><th>300社</th></tr>
      <tr><td>金額（税込）</td><td>¥9,800</td><td>¥30,800</td><td>¥60,800</td><td>¥90,800</td></tr>
    </table>
  </div>
  <p class="note">出展者数は、出展者（ブランド単位）が初めて提出を完了した時点で1件と数えます。開催ごとプランは、イベント作成時に基本料金、超過分は終了日を起点にカードへ自動課金されます。年間プランは導入相談でご案内します。</p>`,
);

// 17. 導入の流れ
page(
  "light",
  `
  ${head("ONBOARDING", "導入の流れと進め方")}
  ${flowRow(["15分の導入相談", "アカウント発行", "イベント・フォーム設定", "出展者へURLを案内", "運用開始"], { last: "dark" })}
  <div class="cols">
    <div class="card small"><p class="label blue">進め方 A</p><h3>一部の機能から試す</h3><p>フォームを最小限の項目にして、資料配布と確認状況の管理から始める。次回開催まで時間が少ない場合に</p></div>
    <div class="card small"><p class="label blue">進め方 B</p><h3>1イベントで通して試す</h3><p>開催を1つ選び、情報収集から請求まで運用全体を通して検証する</p></div>
    <div class="card small"><p class="label blue">進め方 C</p><h3>次の開催から全面導入</h3><p>既存の申込書をフォームに置き換え、出展者への案内から切り替える</p></div>
  </div>
  <p class="note">導入相談では、現在の運用・開催予定・規模をお伺いし、どの進め方が合うかをご提案します。メールでのお問い合わせも承ります。</p>`,
);

// 18. 検討チェックリスト
const checkCol = (title, items) => `
  <div class="card small check-col">
    <h3>${title}</h3>
    ${items.map((i) => `<p class="check"><span class="box"></span>${i}</p>`).join("")}
  </div>`;
page(
  "light",
  `
  ${head("CHECKLIST｜導入相談の前に", "ご検討チェックリスト", { accent: true })}
  <p class="lead-dark">事前に整理いただくと、貴社の運用に合うかを15分で具体的に判断できます。分からない項目はそのままで構いません。</p>
  <div class="grid4">
    ${checkCol("現在の運用", ["出展者への案内から情報回収までの流れとツール", "回収している情報・書類の種類", "督促や問い合わせで工数がかかる場面", "請求書の発行元と入金確認の方法"])}
    ${checkCol("規模", ["1開催あたりの出展者数", "年間の開催数・同時開催の数", "受け取るファイルの種類と容量の目安", "小間・ブースの料金体系"])}
    ${checkCol("要件", ["必須の要件（SSO・API・英語対応など）", "担当者の人数と役割分担", "開催をまたいだ出展者情報の再利用", "情報管理・保存期間の社内ルール"])}
    ${checkCol("進め方", ["導入を目指す開催", "決裁者と、評価に関わる部署", "セキュリティ審査・調達手続きの有無", "試し方（一部の機能・1イベント）"])}
  </div>
  <div class="band small">${ico("calendar", 22, "#7CC0FF")}<p>既存の申込書・Excelの様式をお持ちいただくと、フォームへの置き換え方を具体的にご提案できます。</p></div>`,
);

// 19. FAQ
const faq = (q, a) => `<div class="faq"><p class="q">Q. ${q}</p><p class="a">${a}</p></div>`;
page(
  "light",
  `
  ${head("FAQ", "よくあるご質問")}
  <div class="grid2 faq-grid">
    ${faq("出展者はアカウント登録が必要ですか？", "不要です。共有URLからメールアドレスを入力し、届いたリンクを開くだけで入力を始められます。")}
    ${faq("銀行振込の入金も自動で確認されますか？", "主催者が入金を確認し、画面上で状態を更新します。銀行口座との自動照合は行いません。")}
    ${faq("Excelで使えますか？", "出展者一覧はCSVで出力でき、Excelで開いて編集できます。")}
    ${faq("すでに募集が始まっていても使えますか？", "現在の収集状況によって進め方が変わるため、導入相談でご相談ください。")}
    ${faq("再提出や下書き保存も料金に数えられますか？", "数えられません。出展者（ブランド単位）が初めて提出を完了した時点の1件のみです。")}
    ${faq("年間プランの上限を超える場合は？", "年間7開催以上、または1開催301社以上は個別見積もりでご案内します。")}
  </div>`,
);

// 20. 運営会社
page(
  "light",
  `
  ${head("ABOUT US", "運営会社と開発の背景")}
  <div class="cols">
    <div class="card">
      <h3>運営会社</h3>
      <p><b>株式会社BlackishGear</b></p>
      <p>キャンプ・アウトドアブランド「BlackishGear」の運営と、広告運用支援ツール「AdMediQ」の開発・運営を行っています。所在地・連絡先等の詳細は、特定商取引法に基づく表記をご参照ください。</p>
    </div>
    <div class="card">
      <h3>開発の背景</h3>
      <p>私たち自身がキャンプ・アウトドア関連の展示会に出展する中で、出展のたびに複数のPDFへ似た情報を書いて返送し、主催者側も転記・集計・催促・資料送付・入金確認に追われる状況を見てきました。主催者・出展者双方の負担を減らしたいという思いから開発したサービスです。</p>
    </div>
  </div>`,
);

// 21. 次のステップ
page(
  "cover",
  `
  <div class="cta">
    <p class="eyebrow light">NEXT STEP</p>
    <h1 class="cta-title">まずは、次の開催で使う<br/>イメージを。</h1>
    <div class="cta-cols">
      <a class="cta-box" href="https://www.tenjiport.com/demo">${ico("play", 30, "#9CCBFF")}<h3>登録不要でデモを試す</h3><p>架空のデータで、主催者・出展者の両方の画面を操作できます。メール送信や課金は発生しません。</p><p class="link">tenjiport.com/demo</p></a>
      <a class="cta-box" href="${BOOKING_URL}">${ico("calendar", 30, "#9CCBFF")}<h3>15分の導入相談</h3><p>現在の運用、次回開催までの準備、規模に応じた料金をご相談いただけます。</p><p class="link">オンラインで予約</p></a>
      <a class="cta-box" href="mailto:contact@tenjiport.com">${ico("mail", 30, "#9CCBFF")}<h3>お問い合わせ</h3><p>資料の内容やご不明点は、メールでお気軽にお問い合わせください。</p><p class="link">contact@tenjiport.com</p></a>
    </div>
    <p class="meta">株式会社BlackishGear｜TenjiPort</p>
  </div>`,
);

// ---------------------------------------------------------------------------
// スタイル・組み立て
// ---------------------------------------------------------------------------

const css = `
  @page { size: 1280px 720px; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif; color: #14233B; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 1280px; height: 720px; padding: 50px 80px 80px; position: relative; overflow: hidden;
          display: flex; flex-direction: column; gap: 24px; background: #F4F7FB; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .page.cover { background: #0F2A4D; color: #EAF1F8; padding: 64px 80px; flex-direction: row; align-items: center; gap: 48px; }
  .head { display: flex; flex-direction: column; gap: 6px; }
  .eyebrow { font-size: 13px; font-weight: 700; color: #0068C8; letter-spacing: 0.12em; }
  .eyebrow.orange { color: #C2570C; }
  .eyebrow.light { color: #7CC0FF; }
  h2 { font-size: 36px; font-weight: 700; line-height: 1.2; color: #0F2A4D; }
  h3 { font-size: 20px; font-weight: 700; line-height: 1.4; color: #0F2A4D; }
  p, li { font-size: 16px; line-height: 1.7; color: #3E4F68; }
  b { font-weight: 700; }
  .blue { color: #0068C8; }
  .cols { display: flex; gap: 22px; }
  .cols > .card { flex: 1; }
  .col { display: flex; flex-direction: column; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }
  .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .card { background: #FCFDFE; border: 1px solid #DCE5EF; border-radius: 12px; padding: 26px 28px; display: flex; flex-direction: column; gap: 10px; }
  .card.small { padding: 20px 22px; gap: 8px; }
  .card.small p { font-size: 15px; }
  .card ul { padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
  .card-icon { width: 44px; height: 44px; border-radius: 50%; background: #E3EEFA; display: flex; align-items: center; justify-content: center; }
  .card-row { display: flex; align-items: center; gap: 12px; }
  .band { display: flex; align-items: center; gap: 18px; background: #0F2A4D; border-radius: 12px; padding: 18px 28px; }
  .band.small { padding: 14px 24px; }
  .band p { color: #EAF1F8; font-size: 17px; }
  .band .band-label { color: #7CC0FF; font-weight: 700; font-size: 14px; white-space: nowrap; }
  .note { font-size: 13px; color: #5A6B84; }
  .small-text { font-size: 13px; line-height: 1.6; color: #5A6B84; }
  .label { font-size: 13px; font-weight: 700; color: #5A6B84; margin-bottom: 8px; }
  .caption { font-size: 12px; color: #5A6B84; }
  .caption.light { color: #9DB4CF; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { font-size: 14px; background: #E3EEFA; color: #0F2A4D; border-radius: 999px; padding: 5px 14px; }
  .step { display: flex; gap: 14px; align-items: flex-start; }
  .num { flex: none; width: 38px; height: 38px; border-radius: 50%; background: #0068C8; color: #fff; font-size: 16px; font-weight: 700;
         display: flex; align-items: center; justify-content: center; }
  .step p { font-size: 15px; }
  .flow { display: flex; align-items: center; gap: 10px; }
  .flow-item { flex: 1; text-align: center; font-size: 15px; font-weight: 700; line-height: 1.4; background: #E3EEFA; color: #0F2A4D;
               border-radius: 10px; padding: 12px 8px; }
  .flow-item.dark { background: #0F2A4D; color: #EAF1F8; }
  .flow-item.white { background: #FCFDFE; border: 1px solid #DCE5EF; }
  .arrow { flex: none; }
  .dark-box { background: #0F2A4D; border-radius: 12px; padding: 26px 28px; gap: 14px; }
  .light-text { color: #B9CCE0; font-size: 14px; }
  .light-text.muted { color: #9DB4CF; font-size: 13px; }
  .dark-table { width: 100%; border-collapse: collapse; font-size: 15px; color: #EAF1F8; }
  .dark-table th, .dark-table td { border-bottom: 1px solid #2A4C7A; padding: 9px 6px; text-align: left; }
  .dark-table th { color: #9DB4CF; font-weight: 500; font-size: 13px; }
  .r { text-align: right !important; }
  .table { width: 100%; border-collapse: collapse; background: #FCFDFE; border: 1px solid #DCE5EF; font-size: 15px; }
  .table th, .table td { border: 1px solid #DCE5EF; padding: 9px 14px; text-align: left; color: #14233B; line-height: 1.5; }
  .table th { background: #E3EEFA; font-weight: 700; font-size: 13px; color: #0F2A4D; }
  .table.numeric td:not(:first-child), .table.numeric th:not(:first-child) { text-align: right; }
  .shot { position: relative; overflow: hidden; border: 1px solid #DCE5EF; border-radius: 10px; background: #fff;
          box-shadow: 0 6px 18px rgba(15, 42, 77, 0.10); flex: none; }
  .shot img { position: absolute; max-width: none; display: block; }
  .toc { display: flex; flex-direction: column; gap: 12px; }
  .toc-row { display: flex; gap: 18px; align-items: flex-start; background: #FCFDFE; border: 1px solid #DCE5EF; border-radius: 12px; padding: 18px 22px; }
  .toc-row span { font-size: 22px; font-weight: 700; color: #0068C8; width: 36px; flex: none; line-height: 1.3; }
  .toc-row p { font-size: 15px; }
  .toc-row b { font-size: 18px; color: #0F2A4D; }
  .mini-steps { display: flex; flex-direction: column; gap: 22px; }
  .mini-steps p { color: #EAF1F8; font-size: 17px; }
  .mini-steps b { color: #7CC0FF; }
  .price-card .price { font-size: 34px; font-weight: 700; color: #0F2A4D; line-height: 1.2; }
  .price-card.dark { background: #0F2A4D; border-color: #0F2A4D; }
  .price-card.dark .label { color: #7CC0FF; }
  .price-card.dark .price { color: #F4F8FC; }
  .price-card.dark p { color: #B9CCE0; }
  .price-card .label { margin-bottom: 0; }
  .lead-dark { font-size: 15px; color: #3E4F68; margin-top: -8px; }
  .check-col { gap: 14px; }
  .check { display: flex; gap: 10px; align-items: flex-start; font-size: 15px !important; line-height: 1.55; }
  .box { flex: none; width: 15px; height: 15px; border: 1.5px solid #9DB4CF; border-radius: 3px; margin-top: 4px; background: #fff; }
  .faq-grid { gap: 14px 28px; }
  .faq { background: #FCFDFE; border: 1px solid #DCE5EF; border-radius: 12px; padding: 16px 20px; }
  .faq .q { font-weight: 700; color: #0F2A4D; font-size: 15px; margin-bottom: 4px; }
  .faq .a { font-size: 15px; }
  /* 表紙・CTA */
  .cover-text { flex: 1; display: flex; flex-direction: column; gap: 18px; }
  .cover-text .logo { height: 34px; width: auto; align-self: flex-start; background: #F4F8FC; padding: 8px 14px; border-radius: 8px; box-sizing: content-box; }
  h1 { font-size: 52px; font-weight: 700; line-height: 1.25; color: #F4F8FC; }
  .lead { font-size: 17px; color: #B9CCE0; line-height: 1.75; }
  .meta { font-size: 13px; color: #9DB4CF; margin-top: 18px; }
  .cover-shot { display: flex; flex-direction: column; gap: 10px; }
  .cover .shot { border-color: #2A4C7A; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35); }
  .cta { flex: 1; display: flex; flex-direction: column; gap: 22px; }
  .cta-title { font-size: 40px; }
  .cta-cols { display: flex; gap: 20px; }
  .cta-box { flex: 1; text-decoration: none; background: #17406F; border: 1px solid #2A4C7A; border-radius: 14px; padding: 24px; display: flex; flex-direction: column; gap: 10px; }
  .cta-box h3 { color: #F4F8FC; }
  .cta-box p { color: #B9CCE0; font-size: 15px; }
  .cta-box .link { color: #9CCBFF; font-weight: 700; margin-top: auto; }
  .pageno { position: absolute; right: 80px; bottom: 34px; font-size: 12px; color: #5A6B84; }
  .footer-brand { position: absolute; left: 80px; bottom: 34px; font-size: 12px; color: #5A6B84; }
`;

const total = pages.length;
const body = pages
  .map(({ kind, html }, i) => {
    const footer =
      kind === "cover"
        ? ""
        : `<div class="footer-brand">TenjiPort サービス資料（初回ご検討用）</div><div class="pageno">${i + 1} / ${total}</div>`;
    return `<section class="page ${kind}">${html}${footer}</section>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" />
<style>${css}</style></head><body>
${body}
</body></html>`;

async function main() {
  const tmpDir = path.join(ROOT, ".tmp-pdf-build");
  await mkdir(tmpDir, { recursive: true });
  const htmlPath = path.join(tmpDir, "service-guide.html");
  await writeFile(htmlPath, html, "utf8");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  // 確認用: PREVIEW=1 でページごとのPNGも出力する（ページ外へのはみ出し確認用）。
  if (process.env.PREVIEW) {
    const sections = await page.$$("section.page");
    for (let i = 0; i < sections.length; i++) {
      await sections[i].screenshot({ path: path.join(tmpDir, `page-${String(i + 1).padStart(2, "0")}.png`) });
    }
    const overflow = await page.$$eval("section.page", (els) =>
      els
        .map((el, i) => {
          const box = el.getBoundingClientRect();
          const bad = [...el.querySelectorAll("*")].filter((c) => {
            const r = c.getBoundingClientRect();
            return r.width > 0 && (r.bottom > box.bottom - 60 + 1 || r.right > box.right - 40 + 1) &&
              !c.closest(".shot") && !c.classList.contains("pageno") && !c.classList.contains("footer-brand");
          });
          return bad.length ? `page ${i + 1}: ${bad.length} element(s) past the content area` : null;
        })
        .filter(Boolean),
    );
    console.log(overflow.length ? overflow.join("\n") : "no overflow detected");
  }

  const outPath = path.join(ROOT, "public", "demo", "tenjiport-service-guide.pdf");
  await page.pdf({ path: outPath, width: "1280px", height: "720px", printBackground: true, preferCSSPageSize: true });

  await browser.close();
  console.log("saved:", outPath, `(${total} pages)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

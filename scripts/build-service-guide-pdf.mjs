// 営業資料（サービス紹介PDF、全11ページ）をHTML+Playwrightで生成する。
// 実行: node scripts/build-service-guide-pdf.mjs
// 出力: public/demo/tenjiport-service-guide.pdf
import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = process.cwd();
const img = (rel) => pathToFileURL(path.join(ROOT, "public", rel)).href;

const CREATED_AT = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

const css = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif; color: #102C50; }
  .page {
    width: 210mm; height: 297mm; page-break-after: always;
    padding: 16mm 18mm; position: relative; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .page:last-child { page-break-after: avoid; }
  .kicker { font-size: 10pt; font-weight: 600; color: #0068C8; letter-spacing: 0.05em; }
  h1 { font-size: 22pt; margin: 4mm 0 0; }
  h2 { font-size: 16pt; margin: 0 0 6mm; }
  h3 { font-size: 12pt; margin: 0 0 2mm; color: #0068C8; }
  p { font-size: 10.5pt; line-height: 1.8; margin: 0 0 3mm; }
  .muted { color: #6b7a90; }
  .pageno { position: absolute; bottom: 10mm; right: 18mm; font-size: 9pt; color: #9fb0c3; }
  .footer-brand { position: absolute; bottom: 10mm; left: 18mm; font-size: 9pt; color: #9fb0c3; }
  .logo { height: 9mm; }
  .card { border: 1px solid #DCE5EF; border-radius: 4mm; padding: 6mm; background: #fff; margin-bottom: 4mm; }
  .card h3 { margin-bottom: 2mm; }
  .num { display: inline-flex; width: 6mm; height: 6mm; border-radius: 50%; background: #0068C8; color: #fff;
         font-size: 9pt; align-items: center; justify-content: center; margin-right: 3mm; flex: none; }
  .row { display: flex; align-items: flex-start; margin-bottom: 4mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; flex: 1; }
  .cols3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5mm; }
  .box { border: 1px solid #DCE5EF; border-radius: 4mm; padding: 5mm; background: #F5F8FC; }
  .box.dark { background: #102C50; color: #fff; border-color: #102C50; }
  .box.dark h3 { color: #9fd7ff; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border: 1px solid #DCE5EF; padding: 2.5mm 3mm; text-align: left; }
  th { background: #F5F8FC; font-weight: 600; }
  .shot { width: 100%; border: 1px solid #DCE5EF; border-radius: 3mm; display: block; }
  .shot-wrap { border: 1px solid #DCE5EF; border-radius: 3mm; overflow: hidden; background: #fff; }
  .badge { display: inline-block; font-size: 8.5pt; background: #0068C8; color: #fff; border-radius: 2mm; padding: 0.5mm 2.5mm; margin-right: 2mm; }
  .center { text-align: center; }
  .price { font-size: 20pt; font-weight: 700; color: #102C50; }
  .faq-q { font-weight: 600; margin-bottom: 1mm; }
  .faq-a { color: #445064; margin-bottom: 4mm; }
  ul.plain { margin: 0; padding-left: 5mm; }
  ul.plain li { font-size: 10.5pt; line-height: 1.8; margin-bottom: 1.5mm; }
  .cover { justify-content: center; align-items: center; text-align: center; background: linear-gradient(180deg, #F5F8FC 0%, #ffffff 60%); }
  .cover img.logo-big { height: 16mm; margin-bottom: 8mm; }
  .cover h1 { font-size: 15pt; font-weight: 500; color: #445064; margin-bottom: 6mm; }
  .cover h2 { font-size: 24pt; line-height: 1.5; margin-bottom: 10mm; }
`;

const page4Shots = `
  <div class="cols2" style="flex:none;">
    <div class="shot-wrap"><img class="shot" src="${img("demo/hero-exhibitors.png")}" /></div>
    <div class="shot-wrap"><img class="shot" src="${img("demo/pdf-assets/organizer-exhibitors.png")}" /></div>
  </div>
`;

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8" /><style>${css}</style></head><body>

<!-- 1: 表紙 -->
<section class="page cover">
  <img class="logo-big" src="${img("tenjiport_logo.png")}" />
  <h1>展示会・出展者管理クラウド</h1>
  <h2>出展者情報も、資料の確認状況も。<br/>ひとつの画面で。</h2>
  <p class="muted">情報収集、資料配布、確認状況、銀行振込の入金確認をまとめて管理できるサービスです。</p>
  <p class="muted" style="margin-top:14mm;">サービス資料　${CREATED_AT}　株式会社BlackishGear</p>
</section>

<!-- 2: 主催者が抱える課題 -->
<section class="page">
  <div class="kicker">CHALLENGES</div>
  <h2>こんな確認作業に、時間を取られていませんか？</h2>
  <p>展示会・物販イベントの運営では、出展者とのやり取りが煩雑になりがちです。特に次のような場面で、担当者の時間が奪われていないでしょうか。</p>
  <div class="row"><span class="num">1</span><div><h3>未提出の出展者を探す</h3><p>メールとExcelを照合し、誰が提出済みで誰が未提出かを都度確認する必要があります。</p></div></div>
  <div class="row"><span class="num">2</span><div><h3>資料の確認状況が分からない</h3><p>配布した搬入案内などの資料を、相手が確認したかどうかは個別に連絡しないと分かりません。</p></div></div>
  <div class="row"><span class="num">3</span><div><h3>請求書と入金確認が別管理</h3><p>銀行振込の入金確認と請求状況が、別々の表やファイルに分かれていませんか。</p></div></div>
  <div class="row"><span class="num">4</span><div><h3>版の管理が煩雑</h3><p>出展者ごとに異なる版のPDF・入力項目が乱立し、最新版がどれか分からなくなることがあります。</p></div></div>
  <p style="margin-top:auto; color:#0068C8; font-weight:600;">テンジポートは、情報収集後のこうした運用をひとつの画面にまとめます。</p>
  <div class="pageno">2 / 11</div><div class="footer-brand">TenjiPort サービス資料</div>
</section>

<!-- 3: 全体像 -->
<section class="page">
  <div class="kicker">HOW IT WORKS</div>
  <h2>テンジポートで変わる運用の全体像</h2>
  <div class="cols2" style="flex:none;">
    <div class="box">
      <h3>従来の運用</h3>
      <ul class="plain">
        <li>PDF・Excelで出展要項を送付</li>
        <li>出展者がメールで情報を返送</li>
        <li>担当者がExcelへ手作業で転記</li>
        <li>未提出者へ個別に催促</li>
        <li>資料配布後、確認有無を電話・メールで確認</li>
        <li>請求書・入金確認を別ファイルで管理</li>
      </ul>
    </div>
    <div class="box dark">
      <h3>テンジポート導入後</h3>
      <ul class="plain">
        <li>登録URLを出展者へ案内</li>
        <li>出展者がWebフォームへ直接入力</li>
        <li>入力内容は自動で一覧化</li>
        <li>資料公開で対象者へ自動通知</li>
        <li>確認状況が画面上で自動集計</li>
        <li>請求書配布・入金確認をひとつの画面で管理</li>
      </ul>
    </div>
  </div>
  <p style="margin-top:6mm;" class="muted">※ 本サービスが支援するのは「情報収集」以降の運用です。出展募集・応募審査・集客・チケット販売は対象に含みません。</p>
  <div class="pageno">3 / 11</div><div class="footer-brand">TenjiPort サービス資料</div>
</section>

<!-- 4: 主催者画面 -->
<section class="page">
  <div class="kicker">FOR ORGANIZERS</div>
  <h2>主催者画面・主要操作</h2>
  ${page4Shots}
  <ul class="plain" style="margin-top:5mm;">
    <li>ダッシュボードで、提出状況・未確認資料・未入金件数を一目で確認できます。</li>
    <li>出展者一覧は「提出状態」「請求書」「資料確認」の状態で絞り込めます。</li>
    <li>出展者ごとに社内メモを残せます。</li>
    <li>出展者一覧は権限に応じてCSVで出力できます。</li>
  </ul>
  <div class="pageno">4 / 11</div><div class="footer-brand">TenjiPort サービス資料</div>
</section>

<!-- 5: 出展者画面 -->
<section class="page">
  <div class="kicker">FOR EXHIBITORS</div>
  <h2>出展者画面・主要操作</h2>
  <div class="cols2" style="flex:none; align-items:start;">
    <div class="shot-wrap"><img class="shot" src="${img("demo/pdf-assets/exhibitor-announcements.png")}" /></div>
    <div class="shot-wrap"><img class="shot" src="${img("demo/pdf-assets/exhibitor-announcement-detail.png")}" /></div>
  </div>
  <ul class="plain" style="margin-top:5mm;">
    <li>主催者から共有されたURLから、ログイン不要で入力を開始できます。</li>
    <li>配布された資料を確認し、「確認しました」の明示的な操作で応答します（開いただけでは確認済みになりません）。</li>
    <li>請求書の内容・支払期限を確認できます。</li>
    <li>一度登録すると、以後は登録済みのメールアドレスで再アクセスできます。</li>
  </ul>
  <div class="pageno">5 / 11</div><div class="footer-brand">TenjiPort サービス資料</div>
</section>

<!-- 6: 機能一覧・対応範囲 -->
<section class="page">
  <div class="kicker">FEATURES</div>
  <h2>機能一覧・対応範囲</h2>
  <table>
    <tr><th style="width:28mm;">情報収集</th><td>フォーム項目のカスタマイズ（必須/任意・条件分岐・締切）、下書き保存、修正依頼、重複登録の検知・統合</td></tr>
    <tr><th>資料配布</th><td>版管理、公開対象を全体/個別で指定、確認状況の可視化、未確認者への再通知</td></tr>
    <tr><th>請求・入金</th><td>個別請求書の配布、支払期限の個別設定、銀行振込の入金確認（手動）、督促</td></tr>
    <tr><th>権限・データ</th><td>複数担当者・権限設定（owner/admin/staff）、操作の監査ログ、CSV出力</td></tr>
    <tr><th>課金</th><td>出展者数に応じた自動計算、クレジットカードでの自動課金</td></tr>
  </table>
  <h3 style="margin-top:6mm;">現時点で対応していないこと</h3>
  <p class="muted">導入をご検討いただく際の判断材料として、現時点の対応範囲外もあわせてお伝えします。</p>
  <ul class="plain muted">
    <li>出展募集ポータル、応募審査・採否管理、集客、チケット販売</li>
    <li>出展料のカード決済代行、銀行口座との自動照合</li>
    <li>コマ図の自動配置、入退場QR受付、商談管理</li>
    <li>LINE・SMS通知、ネイティブアプリ</li>
  </ul>
  <div class="pageno">6 / 11</div><div class="footer-brand">TenjiPort サービス資料</div>
</section>

<!-- 7: 導入手順・サポート -->
<section class="page">
  <div class="kicker">ONBOARDING</div>
  <h2>導入手順・サポート</h2>
  <div class="row"><span class="num">1</span><div><h3>導入相談（15分）</h3><p>現在の運用・開催予定・開催規模をお伺いします。</p></div></div>
  <div class="row"><span class="num">2</span><div><h3>アカウント発行・組織設定</h3><p>組織情報を登録します。</p></div></div>
  <div class="row"><span class="num">3</span><div><h3>イベント作成・フォーム設定</h3><p>開催情報と、出展者に入力してほしい項目を設定します。</p></div></div>
  <div class="row"><span class="num">4</span><div><h3>出展者へURLを案内</h3><p>既存のメール等で、決定済みの出展者へ登録URLを共有します。</p></div></div>
  <div class="row"><span class="num">5</span><div><h3>運用開始</h3><p>提出状況の確認、資料配布、請求・入金確認を画面上で行います。</p></div></div>
  <div class="box" style="margin-top:4mm;">
    <h3>サポート</h3>
    <p>ご不明点はメールでお問い合わせいただけるほか、15分の導入相談も承っています。</p>
  </div>
  <div class="pageno">7 / 11</div><div class="footer-brand">TenjiPort サービス資料</div>
</section>

<!-- 8: 料金 -->
<section class="page">
  <div class="kicker">PRICING</div>
  <h2>料金プラン・料金例</h2>
  <div class="cols2" style="flex:none;">
    <div class="card">
      <h3>開催ごとプラン</h3>
      <div class="price">¥9,800<span style="font-size:11pt;">（税込）</span></div>
      <p class="muted">1開催・30社まで。31社目から1社¥300（税込）</p>
    </div>
    <div class="card">
      <h3>年間プラン</h3>
      <div class="price">¥298,000<span style="font-size:11pt;">（税込）</span></div>
      <p class="muted">年6開催・各開催300社まで</p>
    </div>
  </div>
  <p class="muted">年間7開催以上、または1開催301社以上をご利用の場合は個別見積もりとなります。主催法人・支援範囲等もあわせてご相談ください。</p>
  <h3 style="margin-top:4mm;">開催ごとプランの料金例</h3>
  <table>
    <tr><th>出展者数</th><td>30社</td><td>100社</td><td>200社</td><td>300社</td></tr>
    <tr><th>金額（税込）</th><td>¥9,800</td><td>¥30,800</td><td>¥60,800</td><td>¥90,800</td></tr>
  </table>
  <p class="muted" style="margin-top:3mm;">※ 各開催の出展者数が同じ場合の概算です。実請求額を確定するものではありません。</p>
  <div class="pageno">8 / 11</div><div class="footer-brand">TenjiPort サービス資料</div>
</section>

<!-- 9: 情報管理・FAQ -->
<section class="page">
  <div class="kicker">SECURITY & FAQ</div>
  <h2>情報管理・よくあるご質問</h2>
  <h3>情報管理</h3>
  <ul class="plain">
    <li>通信は暗号化されます。</li>
    <li>組織・イベント単位でデータを分離して管理します。</li>
    <li>インボイス制度に対応した請求書番号・PDFを発行します。</li>
  </ul>
  <h3 style="margin-top:5mm;">よくあるご質問</h3>
  <div class="faq-q">Q. 出展者はどこから使い始めますか？</div>
  <div class="faq-a">A. 主催者から案内されたURLで情報を入力します。以後は登録済みのメールアドレスで再アクセスできます。</div>
  <div class="faq-q">Q. 銀行振込の入金も自動で確認されますか？</div>
  <div class="faq-a">A. 主催者が銀行への入金を確認し、手動で状態を更新します。</div>
  <div class="faq-q">Q. Excelで使えますか？</div>
  <div class="faq-a">A. 出展者一覧はCSV形式で出力できます（Excelでも開いて編集いただけます）。</div>
  <div class="faq-q">Q. すでに募集が始まっていても利用できますか？</div>
  <div class="faq-a">A. 現在の収集状況によって導入方法が変わるため、導入相談でご相談ください。</div>
  <div class="faq-q">Q. 年間プランの上限を超える場合は？</div>
  <div class="faq-a">A. 個別見積もりへご案内します。</div>
  <div class="pageno">9 / 11</div><div class="footer-brand">TenjiPort サービス資料</div>
</section>

<!-- 10: 運営会社・開発背景 -->
<section class="page">
  <div class="kicker">ABOUT US</div>
  <h2>運営会社・開発背景</h2>
  <h3>運営会社</h3>
  <p><strong>株式会社BlackishGear</strong><br/>
  キャンプ・アウトドアブランド「BlackishGear」の運営と、広告運用支援ツール「AdMediQ」の開発・運営を行っています。<br/>
  所在地・連絡先等の詳細は、特定商取引法に基づく表記ページをご参照ください。</p>
  <h3 style="margin-top:6mm;">開発の背景</h3>
  <p>テンジポートは、私たち自身がキャンプ・アウトドア関連の展示会に出展する中で感じた課題から生まれました。出展のたびに、複数のPDFへ似たような情報を書いて返送し、主催者側も転記・集計・催促・資料送付・入金確認に追われる——。同じ悩みを抱える主催者・出展者双方の負担を減らしたいという思いから開発しました。</p>
  <div class="pageno">10 / 11</div><div class="footer-brand">TenjiPort サービス資料</div>
</section>

<!-- 11: CTA -->
<section class="page">
  <div class="kicker">NEXT STEP</div>
  <h2>まずは、次の開催で使うイメージを</h2>
  <div class="cols2" style="flex:none;">
    <div class="box">
      <h3>登録不要でデモを試す</h3>
      <p>架空のデータで、主催者・出展者両方の画面を操作いただけます。実際のメール送信や課金は行われません。</p>
      <p class="muted">ご案内のメールに記載のリンクからご覧いただけます。</p>
    </div>
    <div class="box">
      <h3>15分の導入相談</h3>
      <p>現在のPDF・Excel運用、次回開催までの準備、開催規模に応じた料金をご相談いただけます。</p>
    </div>
  </div>
  <p style="margin-top:8mm;">お問い合わせ：contact@tenjiport.com</p>
  <p class="muted">株式会社BlackishGear</p>
  <div class="pageno">11 / 11</div><div class="footer-brand">TenjiPort サービス資料</div>
</section>

</body></html>`;

async function main() {
  const tmpDir = path.join(ROOT, ".tmp-pdf-build");
  await mkdir(tmpDir, { recursive: true });
  const htmlPath = path.join(tmpDir, "service-guide.html");
  await writeFile(htmlPath, html, "utf8");

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });

  const outPath = path.join(ROOT, "public", "demo", "tenjiport-service-guide.pdf");
  await page.pdf({ path: outPath, format: "A4", printBackground: true, preferCSSPageSize: true });

  await browser.close();
  console.log("saved:", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

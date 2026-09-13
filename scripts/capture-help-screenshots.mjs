import { chromium } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const CONFIRM_URL = process.argv[2];
const EVENT_ID = process.argv[3];
const PARTICIPATION_ID = process.argv[4];
const REVISION_PARTICIPATION_ID = process.argv[5];
const MISMATCH_INVOICE_ID = process.argv[6];

if (!CONFIRM_URL || !EVENT_ID || !PARTICIPATION_ID || !REVISION_PARTICIPATION_ID || !MISMATCH_INVOICE_ID) {
  console.error(
    "使い方: node scripts/capture-help-screenshots.mjs <confirmUrl> <eventId> <participationId> <revisionParticipationId> <mismatchInvoiceId>",
  );
  process.exit(1);
}

// Next.js devモードのエラー/警告インジケーター（画面左下の丸いバッジ）を、
// ドキュメント用スクリーンショットに写り込ませないよう非表示にする（開発時のみの表示で、
// 本番ビルドには存在しないため機能上の意味は無い）。
async function hideDevIndicator(page) {
  await page.addStyleTag({
    content: "nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }",
  });
}

async function shot(page, path, outName, opts = {}) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(600);
  await hideDevIndicator(page);
  if (opts.before) await opts.before(page);
  await page.screenshot({ path: `public/help/${outName}.jpg`, fullPage: opts.fullPage ?? false, quality: 90, type: "jpeg" });
  console.log("captured", outName);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // ログイン
  await page.goto(CONFIRM_URL, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(600);

  // 1. 価格・在庫つきの選択肢を設定するフォーム編集UI
  await shot(page, `/events/${EVENT_ID}/form`, "form-priced-choice-list");

  // 2. 出展者一覧（コマ・オプション料金列を含む。デフォルト非表示のため表示項目から追加する）
  await shot(page, `/events/${EVENT_ID}/exhibitors`, "exhibitors-list-with-price", {
    fullPage: true,
    before: async (p) => {
      await p.click('button:has-text("表示項目")');
      await p.click('label:has-text("確定金額（コマ等）")');
      await p.keyboard.press("Escape");
      await p.waitForTimeout(200);
    },
  });

  // 3. 出展者詳細（コマ・オプション料金カード + 修正依頼の再送ボタン）
  await shot(page, `/events/${EVENT_ID}/exhibitors/${REVISION_PARTICIPATION_ID}`, "exhibitor-detail-revision-resend", { fullPage: true });

  // 4. 一括請求書発行プレビュー（自動計算金額つき）
  await shot(page, `/events/${EVENT_ID}/invoices/bulk`, "invoices-bulk-preview", { fullPage: true });

  // 5. 請求書詳細の金額不一致バナー
  await shot(page, `/events/${EVENT_ID}/invoices/${MISMATCH_INVOICE_ID}`, "invoice-detail-mismatch", { fullPage: true });

  // 6. 設定ページ（発行元情報・銀行口座）
  await shot(page, "/settings", "settings-page", { fullPage: true });

  // 7. 組織切り替えドロップダウンを開いた状態
  await page.goto(`${BASE_URL}/events`, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(600);
  await hideDevIndicator(page);
  const switcherButton = page.locator("button", { hasText: "アウトドアフェス実行委員会" }).first();
  await switcherButton.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "public/help/org-switcher-open.jpg", quality: 90, type: "jpeg" });
  console.log("captured org-switcher-open");

  // 8. 監査ログ
  await shot(page, "/audit-log", "audit-log-page", { fullPage: true });

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// 営業PDF（tenjiport-service-guide.pdf）用の実画面スクリーンショットを撮影する一時スクリプト。
// 実行: node scripts/capture-pdf-assets.mjs
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = "public/demo/pdf-assets";
// 訪問者ごとの完全分離（tenjiport_demo_lp_spec.md 4.3節P2）後は/demo/appのたびに
// ランダムなエフェメラル組織が発行される。主催者ページと出展者ページで同じデモ組織を
// 参照させるため、共有の1コンテキストに固定トークン（src/lib/demo/constants.tsの
// QA_STABLE_DEMO_TOKENと同じ値）のCookieをセットしてから両方のページを開く。
const QA_STABLE_DEMO_TOKEN = "qa-stable-session";

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  await context.addCookies([{ name: "demo_token", value: QA_STABLE_DEMO_TOKEN, url: BASE_URL }]);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(90_000);

  // 主催者：出展者一覧（絞り込み解除の全件表示）
  // Next.jsのクライアント遷移はnetworkidleより先に完了することがあるため、
  // 遷移先固有の要素が出るまで待ってからスクリーンショットする。
  await page.goto(`${BASE_URL}/demo/app`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /テンジポート サンプル展示会/ }).first().click();
  await page.getByRole("link", { name: "出展者一覧" }).waitFor();
  await page.getByRole("link", { name: "出展者一覧" }).click();
  await page.getByRole("button", { name: "提出状態" }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT_DIR}/organizer-exhibitors.png`, clip: { x: 0, y: 0, width: 1280, height: 700 } });

  // 主催者：請求書詳細（入金確認UI）
  await page.getByRole("link", { name: "請求書", exact: true }).click();
  await page.locator("a", { hasText: "未入金" }).first().waitFor();
  await page.locator("a", { hasText: "未入金" }).first().click();
  await page.getByRole("button", { name: "入金済みにする" }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT_DIR}/organizer-invoice.png`, clip: { x: 256, y: 0, width: 1024, height: 1000 } });

  await page.close();

  // 出展者：資料一覧・資料確認画面（同じcontext=同じdemo_tokenを共有し、同一のデモ組織を見る）
  const exhibitorPage = await context.newPage();
  await exhibitorPage.setViewportSize({ width: 900, height: 900 });
  exhibitorPage.setDefaultTimeout(60_000);
  exhibitorPage.setDefaultNavigationTimeout(90_000);
  await exhibitorPage.goto(`${BASE_URL}/demo/exhibitor`, { waitUntil: "networkidle" });
  const token = new URL(exhibitorPage.url()).pathname.match(/\/apply\/([0-9a-f-]+)/)?.[1];
  if (!token) throw new Error("publicFormTokenを特定できませんでした");
  await exhibitorPage.goto(`${BASE_URL}/apply/${token}/announcements`, { waitUntil: "networkidle" });
  await exhibitorPage.waitForTimeout(300);
  await exhibitorPage.screenshot({ path: `${OUT_DIR}/exhibitor-announcements.png`, clip: { x: 0, y: 0, width: 900, height: 230 } });

  await exhibitorPage.getByRole("link").first().click();
  await exhibitorPage.getByRole("button", { name: "確認しました" }).waitFor();
  await exhibitorPage.waitForTimeout(300);
  await exhibitorPage.screenshot({ path: `${OUT_DIR}/exhibitor-announcement-detail.png`, clip: { x: 0, y: 0, width: 900, height: 250 } });

  await browser.close();
  console.log("saved screenshots to", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

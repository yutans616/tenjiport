// LPヒーロー用に、実際のデモ画面（主催者側・出展者一覧）をスクリーンショットする一時スクリプト。
// 実行: node scripts/capture-demo-screenshot.mjs
// 出力: public/demo/hero-exhibitors.png（実装完了後にコミットする実アセット）
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
// 訪問者ごとの完全分離（tenjiport_demo_lp_spec.md 4.3節P2）後は/demo/appのたびに
// ランダムなエフェメラル組織が発行されるため、再現性のある素材を撮るには固定トークン
// （src/lib/demo/constants.tsのQA_STABLE_DEMO_TOKENと同じ値）を使う。
const QA_STABLE_DEMO_TOKEN = "qa-stable-session";

async function main() {
  await mkdir("public/demo", { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: "demo_token", value: QA_STABLE_DEMO_TOKEN, url: BASE_URL }]);
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/demo/app`, { waitUntil: "networkidle" });
  // /events 一覧からデモイベントの概要（提出状況・未確認資料・未入金件数が並ぶダッシュボード）へ
  await page.getByRole("link", { name: /テンジポート サンプル展示会/ }).first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);

  // 開発モードのNext.jsインジケーター（画面左下のバッジ）が写り込まないよう、
  // その分を除いた範囲だけを切り出す（本番ビルドでは表示されないdev専用UI）。
  await page.screenshot({ path: "public/demo/hero-exhibitors.png", clip: { x: 0, y: 0, width: 1280, height: 820 } });
  console.log("saved public/demo/hero-exhibitors.png");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

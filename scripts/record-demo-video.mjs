// 操作デモの紹介動画をPlaywrightで録画する（実UI・実データ、ffmpeg不使用のためwebm出力）。
// 実行: node scripts/record-demo-video.mjs
// 出力:
//   public/demo/demo-walkthrough.webm
//   public/demo/demo-walkthrough.ja.vtt（字幕。録画中に記録した実タイムスタンプを使用）
//   public/demo/demo-walkthrough-poster.png
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdir, rm, readdir, rename } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = "public/demo";
const TMP_VIDEO_DIR = "public/demo/.tmp-video";
// 訪問者ごとの完全分離（tenjiport_demo_lp_spec.md 4.3節P2）後は/demo/appのたびに
// ランダムなエフェメラル組織が発行されるため、再現性のある録画にするには固定トークン
// （src/lib/demo/constants.tsのQA_STABLE_DEMO_TOKENと同じ値）を使う。
const QA_STABLE_DEMO_TOKEN = "qa-stable-session";
const QA_COOKIE = { name: "demo_token", value: QA_STABLE_DEMO_TOKEN, url: BASE_URL };

async function warmUp(browser) {
  // Turbopackの初回コンパイル待ちが録画に写り込まないよう、先に一通り触っておく。
  const ctx = await browser.newContext();
  await ctx.addCookies([QA_COOKIE]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.goto(`${BASE_URL}/demo/app`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /テンジポート サンプル展示会/ }).first().click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "出展者一覧" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "資料", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "新規作成" }).click();
  await page.waitForLoadState("networkidle");
  await ctx.close();

  const ctx2 = await browser.newContext();
  await ctx2.addCookies([QA_COOKIE]);
  const page2 = await ctx2.newPage();
  page2.setDefaultTimeout(60_000);
  page2.setDefaultNavigationTimeout(90_000);
  await page2.goto(`${BASE_URL}/demo/exhibitor`, { waitUntil: "networkidle" });
  await ctx2.close();
}

function vttTimestamp(ms) {
  const totalSeconds = ms / 1000;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const msPart = Math.floor(ms % 1000);
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(msPart, 3)}`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await rm(TMP_VIDEO_DIR, { recursive: true, force: true });
  await mkdir(TMP_VIDEO_DIR, { recursive: true });

  execSync("node --env-file=.env.local scripts/seed-demo.mjs", { cwd: process.cwd(), stdio: "inherit" });

  const browser = await chromium.launch();
  await warmUp(browser);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: TMP_VIDEO_DIR, size: { width: 1280, height: 720 } },
  });
  await context.addCookies([QA_COOKIE]);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(90_000);

  const start = Date.now();
  const cues = [];
  function caption(text, holdMs = 2200) {
    const from = Date.now() - start;
    cues.push({ from, to: from + holdMs, text });
  }
  const wait = (ms) => page.waitForTimeout(ms);

  await page.goto(`${BASE_URL}/demo/app`, { waitUntil: "networkidle" });
  caption("テンジポート サンプル展示会のデモへようこそ");
  await wait(2200);

  await page.getByRole("link", { name: /テンジポート サンプル展示会/ }).first().click();
  await page.waitForLoadState("networkidle");
  caption("主催者ダッシュボード：提出状況・未確認資料・未入金が一目でわかります", 2800);
  await wait(2800);

  await page.getByRole("link", { name: "出展者一覧" }).click();
  await page.waitForLoadState("networkidle");
  caption("出展者一覧から「未提出」で絞り込みます", 2000);
  await page.getByRole("button", { name: "提出状態" }).click();
  await page.getByRole("menuitemcheckbox", { name: "未提出" }).click();
  await page.keyboard.press("Escape");
  await wait(2000);

  await page.getByRole("link", { name: "資料", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "新規作成" }).click();
  await page.waitForLoadState("networkidle");
  caption("未提出の3社を対象に、搬入案内を作成します", 2600);
  await page.getByLabel("タイトル").pressSequentially("搬入案内・更新版", { delay: 45 });
  await page.getByLabel("本文").pressSequentially("会場への搬入経路が更新されました。", { delay: 15 });
  await page.getByLabel("個別選択").check();
  await page.getByRole("button", { name: "ステータス" }).click();
  await page.getByRole("menuitemcheckbox", { name: "未提出" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "表示中を全選択" }).click();
  await wait(1200);
  await page.getByRole("button", { name: "下書きを作成" }).click();
  await page.waitForURL(/\/announcements\/[0-9a-f-]+$/);
  const announcementUrl = page.url();

  caption("サンプル資料を添付して公開します", 2400);
  await page.locator('input[type="file"]').setInputFiles(path.join(process.cwd(), "e2e", "fixtures", "sample-notice.txt"));
  await page.getByText("sample-notice.txt").waitFor();
  await page.getByRole("button", { name: "公開して通知" }).click();
  await page.getByText("送信済み").first().waitFor();
  caption("公開すると対象の出展者へ通知されます（デモでは実際には送信されません）", 3000);
  await wait(3000);

  // /demo/exhibitorはサイレントログイン後 /apply/{token}/form へリダイレクトされるため、
  // そのURLからpublicFormTokenを取り出して資料一覧へ移動する。
  await page.goto(`${BASE_URL}/demo/exhibitor`, { waitUntil: "networkidle" });
  caption("出展者側の画面に切り替えます", 2000);
  const token = new URL(page.url()).pathname.match(/\/apply\/([0-9a-f-]+)/)?.[1];
  if (!token) throw new Error(`publicFormTokenを特定できませんでした: ${page.url()}`);
  await wait(500);
  await page.goto(`${BASE_URL}/apply/${token}/announcements`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /搬入案内・更新版/ }).click();
  await page.waitForLoadState("networkidle");
  caption("配布された資料を確認します", 1800);
  await wait(1000);
  await page.getByRole("button", { name: "確認しました" }).click();
  caption("「確認しました」を押すと確認済みになります", 2400);
  await page.getByText("確認済み", { exact: true }).first().waitFor();
  await wait(1800);

  // 主催者へ戻る前に/demo/appでサイレント再ログインする（現在は出展者セッションのため）。
  await page.goto(`${BASE_URL}/demo/app`, { waitUntil: "networkidle" });
  await page.goto(announcementUrl, { waitUntil: "networkidle" });
  caption("主催者画面に戻ると、確認状況がすぐに反映されています", 2800);
  await wait(2800);

  caption("情報収集から資料の確認状況まで、ひとつの画面で管理できます", 2600);
  await wait(2600);

  const posterPath = path.join(OUT_DIR, "demo-walkthrough-poster.png");
  await page.screenshot({ path: posterPath });

  await context.close();
  await browser.close();

  const files = await readdir(TMP_VIDEO_DIR);
  const webm = files.find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("録画ファイルが見つかりません");
  const finalVideoPath = path.join(OUT_DIR, "demo-walkthrough.webm");
  await rename(path.join(TMP_VIDEO_DIR, webm), finalVideoPath);
  await rm(TMP_VIDEO_DIR, { recursive: true, force: true });

  const vttLines = ["WEBVTT", ""];
  for (const cue of cues) {
    vttLines.push(`${vttTimestamp(cue.from)} --> ${vttTimestamp(cue.to)}`, cue.text, "");
  }
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(OUT_DIR, "demo-walkthrough.ja.vtt"), vttLines.join("\n"), "utf8");

  console.log("saved:");
  console.log(" -", finalVideoPath);
  console.log(" -", path.join(OUT_DIR, "demo-walkthrough.ja.vtt"));
  console.log(" -", posterPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

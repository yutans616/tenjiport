import { defineConfig, devices } from "@playwright/test";

// 対象は主にデモ環境（/demo, /demo/app）。本番組織・実課金・実送信には触れない。
// 詳細方針: tenjiport_demo_lp_spec.md 10章「テスト基盤」参照。
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        // OneDriveのネットワークドライブ上でのTurbopack初回コンパイルが遅いため長めに取る
        // （実測：初回ホームページ取得に約30秒）。
        timeout: 240_000,
      },
});

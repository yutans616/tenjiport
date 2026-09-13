import { test, expect } from "@playwright/test";

// Playwright導入自体の疎通確認。デモ導線の本テストはtenjiport_demo_lp_spec.md 10章の
// 「テスト基盤」節に沿って/demo実装後に追加する。
test("トップページが表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/./);
  await expect(page.getByRole("link", { name: "主催者ログイン" })).toBeVisible();
});

test("ヘルスチェックが200を返す", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.ok()).toBeTruthy();
});

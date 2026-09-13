import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// tenjiport_demo_lp_spec.md 4.2節のガイド付きシナリオ全体を通しでE2E検証する。
// OneDriveのネットワークドライブ上ではTurbopackの初回コンパイルが遅いため
// （playwright.config.tsのwebServer.timeout参照）、このテスト自体も長めのタイムアウトを取る。
test.setTimeout(10 * 60 * 1000);

process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

test.beforeAll(() => {
  // 既知の初期状態（提出済み9社・未提出3社、資料確認済み7社・未確認5社、入金済み8社・未入金4社）に
  // 揃えてから検証する（scripts/seed-demo.mjs）。
  execSync("node --env-file=.env.local scripts/seed-demo.mjs", { cwd: process.cwd(), stdio: "inherit" });
});

test("主催者と出展者の操作をひと通り体験でき、デモ組織からは実送信されない", async ({ browser }) => {
  const organizerContext = await browser.newContext();
  const organizerPage = await organizerContext.newPage();
  organizerPage.setDefaultTimeout(60_000);
  organizerPage.setDefaultNavigationTimeout(90_000);

  await test.step("デモに入り、出展者一覧で「未提出」に絞り込むと3社になる", async () => {
    await organizerPage.goto("/demo/app");
    await organizerPage.getByRole("link", { name: /テンジポート サンプル展示会/ }).first().click();
    await organizerPage.getByRole("link", { name: "出展者一覧" }).click();

    await organizerPage.getByRole("button", { name: "提出状態" }).click();
    await organizerPage.getByRole("menuitemcheckbox", { name: "未提出" }).click();
    await organizerPage.keyboard.press("Escape");

    await expect(organizerPage.getByRole("row")).toHaveCount(4); // ヘッダー行 + 3社
  });

  let announcementUrl = "";
  await test.step("未提出3社を対象に搬入案内・更新版を作成し、添付して公開する", async () => {
    await organizerPage.getByRole("link", { name: "資料", exact: true }).click();
    await organizerPage.getByRole("link", { name: "新規作成" }).click();

    await organizerPage.getByLabel("タイトル").fill("搬入案内・更新版");
    await organizerPage.getByLabel("本文").fill("会場への搬入経路が更新されました（デモ用サンプル本文）。");

    await organizerPage.getByLabel("個別選択").check();
    await organizerPage.getByRole("button", { name: "ステータス" }).click();
    await organizerPage.getByRole("menuitemcheckbox", { name: "未提出" }).click();
    await organizerPage.keyboard.press("Escape");
    await organizerPage.getByRole("button", { name: "表示中を全選択" }).click();
    await expect(organizerPage.getByText("3件選択中")).toBeVisible();

    await organizerPage.getByRole("button", { name: "下書きを作成" }).click();
    await organizerPage.waitForURL(/\/announcements\/[0-9a-f-]+$/);
    announcementUrl = organizerPage.url();

    await organizerPage.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures", "sample-notice.txt"));
    await expect(organizerPage.getByText("sample-notice.txt")).toBeVisible();

    await organizerPage.getByRole("button", { name: "公開して通知" }).click();
    await expect(organizerPage.getByText("公開中")).toBeVisible();
    await expect(organizerPage.getByText("送信済み")).toHaveCount(3);
  });

  await test.step("デモ組織向けの通知は実送信されず、送信済み扱いのみ記録されている（DB確認）", async () => {
    const versionId = announcementUrl.split("/").pop()!;
    const { data: deliveries, error } = await db
      .from("notification_deliveries")
      .select("status, provider_message_id")
      .eq("related_entity_type", "announcement_version")
      .eq("related_entity_id", versionId);
    expect(error).toBeNull();
    expect(deliveries).toHaveLength(3);
    for (const d of deliveries!) {
      expect(d.status).toBe("sent");
      expect(d.provider_message_id).toBe("demo-preview-not-sent");
    }
  });

  let publicFormToken = "";
  await test.step("出展者側に切り替え、資料を確認する", async () => {
    const { data: org } = await db.from("organizer_organizations").select("id").eq("is_demo", true).single();
    const { data: event } = await db
      .from("events")
      .select("public_form_token")
      .eq("organizer_organization_id", org!.id)
      .eq("status", "open")
      .single();
    publicFormToken = event!.public_form_token as string;

    const exhibitorContext = await browser.newContext();
    const exhibitorPage = await exhibitorContext.newPage();
    exhibitorPage.setDefaultTimeout(60_000);
    exhibitorPage.setDefaultNavigationTimeout(90_000);

    await exhibitorPage.goto("/demo/exhibitor");
    await exhibitorPage.goto(`/apply/${publicFormToken}/announcements`);
    await exhibitorPage.getByRole("link", { name: /搬入案内・更新版/ }).click();

    // 資料を開いただけでは確認済みにならない
    await expect(exhibitorPage.getByText("確認済み", { exact: true })).toHaveCount(0);

    await exhibitorPage.getByRole("button", { name: "確認しました" }).click();
    await expect(exhibitorPage.getByText("確認済み", { exact: true })).toBeVisible();

    await exhibitorContext.close();
  });

  await test.step("主催者画面で、更新版の確認済み1社・未確認2社を確認する", async () => {
    await organizerPage.goto(announcementUrl);
    await expect(organizerPage.getByText(/確認済み（/)).toHaveCount(1);
    await expect(organizerPage.getByText("未確認", { exact: true })).toHaveCount(2);
  });

  await test.step("未入金の1社を選び、入金確認済みにする", async () => {
    await organizerPage.getByRole("link", { name: "請求書" }).click();
    await organizerPage.locator("a", { hasText: "未入金" }).first().click();

    await organizerPage.getByRole("button", { name: "入金済みにする" }).click();
    await expect(organizerPage.getByText("入金済み").first()).toBeVisible();
  });

  await test.step("出展者一覧をCSVで出力できる", async () => {
    await organizerPage.getByRole("link", { name: "出展者一覧" }).click();
    const [download] = await Promise.all([
      organizerPage.waitForEvent("download"),
      organizerPage.getByRole("link", { name: "全件CSVでダウンロード" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  await organizerContext.close();
});

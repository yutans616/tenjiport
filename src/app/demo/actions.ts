"use server";

import { revalidatePath } from "next/cache";
import { getOrganizerContext } from "@/lib/organizer/context";
import { isDemoOrganization } from "@/lib/demo/guard";
import { resetDemoEnvironment } from "@/lib/demo/seed";

// 「最初に戻す」ボタン用アクション（tenjiport_demo_lp_spec.md 4.1節）。
// デモ組織のログイン中ユーザーのみ実行できる。深夜の強制リセットも同じresetDemoEnvironmentを使う想定。
export async function resetDemoAction() {
  const context = await getOrganizerContext();
  if (!context) throw new Error("ログインしていません。");
  if (!(await isDemoOrganization(context.organizationId))) {
    throw new Error("この組織はデモ環境ではありません。");
  }
  await resetDemoEnvironment();
  revalidatePath("/", "layout");
}

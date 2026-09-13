"use server";

import { revalidatePath } from "next/cache";
import { getOrganizerContext } from "@/lib/organizer/context";
import { isDemoOrganization } from "@/lib/demo/guard";
import { seedDemoEventData } from "@/lib/demo/seed";
import { getDemoSessionByOrganization } from "@/lib/demo/ephemeral";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// 「最初に戻す」ボタン用アクション（tenjiport_demo_lp_spec.md 4.1節）。
// デモ組織のログイン中ユーザーのみ実行できる。訪問者ごとに組織が分離されている
// （4.3節P2）ため、リセット対象は常に「今ログインしている自分自身の組織」に限定される。
export async function resetDemoAction() {
  const context = await getOrganizerContext();
  if (!context) throw new Error("ログインしていません。");
  if (!(await isDemoOrganization(context.organizationId))) {
    throw new Error("この組織はデモ環境ではありません。");
  }
  const session = await getDemoSessionByOrganization(context.organizationId);
  if (!session) throw new Error("デモセッション情報が見つかりません。");

  await seedDemoEventData(createServiceRoleClient(), {
    organizationId: session.organizationId,
    organizerUserId: session.organizerUserId,
    backgroundExhibitorUserId: session.backgroundExhibitorUserId,
    featuredExhibitorUserId: session.featuredExhibitorUserId,
  });
  revalidatePath("/", "layout");
}

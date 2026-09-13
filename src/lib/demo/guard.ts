import { cache } from "react";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * 組織がデモ専用組織（tenjiport_demo_lp_spec.md 4.3節）かどうかを判定する。
 * 送信・課金など実副作用を持つサーバーアクションの入口で使い、デモ組織からは
 * 実送信・実課金を発生させないための二重防御として使う（一次防御はbilling_exempt
 * によるUI非表示、またはis_demoを直接select済みの箇所での個別チェック）。
 */
export const isDemoOrganization = cache(async (organizationId: string): Promise<boolean> => {
  const serviceClient = createServiceRoleClient();
  const { data } = await serviceClient
    .from("organizer_organizations")
    .select("is_demo")
    .eq("id", organizationId)
    .single();
  return data?.is_demo === true;
});

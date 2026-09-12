"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE, getMyActiveMemberships } from "@/lib/organizer/context";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// 組織切替。対象organizationIdが自分の有効な所属に含まれることを検証してから
// Cookieを設定する（DB側のRLSが最終防衛線のため、ここでの検証はUXのため）。
// 切替後は常に/eventsへ着地させる（切替前のページは旧組織のエンティティを
// 指している可能性があり、そのまま留まると404になりうるため）。
export async function switchOrganizationAction(organizationId: string) {
  const memberships = await getMyActiveMemberships();
  const target = memberships.find((m) => m.organizationId === organizationId);
  if (!target) {
    throw new Error("指定された組織への所属が見つかりません。");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/events");
}

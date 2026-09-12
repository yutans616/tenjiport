"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE } from "@/lib/organizer/context";

export type AcceptInvitationResult = { ok: true } | { ok: false; error: string };

export async function acceptInvitationAction(token: string): Promise<AcceptInvitationResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_organizer_invitation", { p_token: token });
  if (error) return { ok: false, error: error.message };

  // 受諾した組織にそのまま着地させる（既に別組織に所属済みの場合、切り替えUIを
  // 使わないと永久に新しい組織へアクセスできなかった問題への対応）。
  if (data?.organization_id) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, data.organization_id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return { ok: true };
}

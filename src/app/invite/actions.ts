"use server";

import { createClient } from "@/lib/supabase/server";

export type AcceptInvitationResult = { ok: true } | { ok: false; error: string };

export async function acceptInvitationAction(token: string): Promise<AcceptInvitationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_organizer_invitation", { p_token: token });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

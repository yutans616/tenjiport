"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";

export async function dismissDuplicate(eventId: string, flagId: string) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("duplicate_flags")
    .update({ status: "dismissed", reviewed_by_user_id: context!.userId, reviewed_at: new Date().toISOString() })
    .eq("id", flagId);
  if (error) throw new Error(`処理に失敗しました: ${error.message}`);

  revalidatePath(`/events/${eventId}/duplicates`);
}

// participationIdB を participationIdA に統合する（Bはmerged状態になり、以後の通常一覧からは外れる）
export async function mergeDuplicate(
  eventId: string,
  flagId: string,
  keepParticipationId: string,
  mergeParticipationId: string,
) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();

  const { error: mergeError } = await supabase
    .from("event_participations")
    .update({ status: "merged", duplicate_of_id: keepParticipationId, duplicate_status: "merged" })
    .eq("id", mergeParticipationId);
  if (mergeError) throw new Error(`統合に失敗しました: ${mergeError.message}`);

  const { error: flagError } = await supabase
    .from("duplicate_flags")
    .update({ status: "merged", reviewed_by_user_id: context!.userId, reviewed_at: new Date().toISOString() })
    .eq("id", flagId);
  if (flagError) throw new Error(`処理に失敗しました: ${flagError.message}`);

  await supabase.from("audit_logs").insert({
    actor_user_id: context!.userId,
    organization_id: context!.organizationId,
    action_type: "merge_duplicate",
    entity_type: "event_participation",
    entity_id: mergeParticipationId,
    after_json: { merged_into: keepParticipationId },
  });

  revalidatePath(`/events/${eventId}/duplicates`);
  revalidatePath(`/events/${eventId}/exhibitors`);
}

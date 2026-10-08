"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext } from "@/lib/organizer/context";
import { loadInviteCandidates } from "@/lib/organizer/inviteCandidates";
import { processPendingNotifications } from "@/lib/notifications/processPendingNotifications";

// 過去のイベントの出展者を、このイベントに「未提出（招待済み）」として登録し、出展のご案内を送る。
// 出展者がリンクを開くと前回の内容が入力済みのフォームが表示され（prefillFromHistory）、
// 提出した時点で初めて課金対象になる。主催者には参加登録・通知の作成権限（RLS）が無いため、
// 権限と対象の出展者を確認したうえでservice roleで登録する。
export async function inviteExhibitorsAction(eventId: string, formData: FormData) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");
  if (context!.role !== "owner" && context!.role !== "admin") {
    throw new Error("出展者の招待はオーナー・管理者のみ行えます。");
  }

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, status")
    .eq("id", eventId)
    .eq("organizer_organization_id", context!.organizationId)
    .single();
  if (!event) throw new Error("イベントが見つかりません。");

  const { data: form } = await supabase
    .from("forms")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "published")
    .limit(1)
    .maybeSingle();
  if (event.status !== "open" || !form) {
    throw new Error("招待するには、イベントを「公開中」にし、フォームを公開してください。");
  }

  const requested = new Set(formData.getAll("profile_ids").map(String));
  if (requested.size === 0) throw new Error("招待する出展者を1件以上選んでください。");

  // 画面に出した候補（同じ組織の過去イベントの出展者で、このイベントに未登録）に限る。
  const candidates = await loadInviteCandidates(supabase, context!.organizationId, eventId);
  const targets = candidates.filter((c) => requested.has(c.profileId));

  const serviceClient = createServiceRoleClient();
  let invitedCount = 0;
  for (const candidate of targets) {
    const { data: participation, error } = await serviceClient
      .from("event_participations")
      .insert({ event_id: eventId, exhibitor_profile_id: candidate.profileId, status: "invited" })
      .select("id")
      .single();
    if (error || !participation) {
      console.error(`invite failed for profile ${candidate.profileId}: ${error?.message}`);
      continue;
    }

    const { error: notifyError } = await serviceClient.from("notification_deliveries").insert({
      event_participation_id: participation.id,
      channel: "email",
      template_type: "participation_invite",
      related_entity_type: "event_participation",
      related_entity_id: participation.id,
      idempotency_key: `participation_invite:${participation.id}`,
    });
    if (notifyError) console.error(`invite notification failed for ${participation.id}: ${notifyError.message}`);

    await supabase.from("audit_logs").insert({
      actor_user_id: context!.userId,
      organization_id: context!.organizationId,
      action_type: "invite",
      entity_type: "event_participation",
      entity_id: participation.id,
      after_json: { event_id: eventId, exhibitor_profile_id: candidate.profileId, brand_name: candidate.brandName },
    });
    invitedCount++;
  }

  await processPendingNotifications(Math.max(50, invitedCount));

  revalidatePath(`/events/${eventId}/exhibitors`);
  redirect(`/events/${eventId}/exhibitors?done=exhibitors_invited&count=${invitedCount}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { processPendingNotifications } from "@/lib/notifications/processPendingNotifications";

export async function requestRevisionAction(
  eventId: string,
  participationId: string,
  submissionVersionId: string,
  formData: FormData,
) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const comment = String(formData.get("comment") ?? "").trim();
  if (!comment) throw new Error("修正依頼の内容は必須です。");

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_revision", {
    p_submission_version_id: submissionVersionId,
    p_comment: comment,
    p_target_field_keys: [],
  });
  if (error) throw new Error(`修正依頼の送信に失敗しました: ${error.message}`);

  await processPendingNotifications(50);
  revalidatePath(`/events/${eventId}/exhibitors/${participationId}`);
}

export async function confirmSubmissionAction(eventId: string, participationId: string, submissionVersionId: string) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_submission", {
    p_submission_version_id: submissionVersionId,
  });
  if (error) throw new Error(`確認処理に失敗しました: ${error.message}`);

  revalidatePath(`/events/${eventId}/exhibitors/${participationId}`);
}

// 重複・テスト登録の課金訂正。既存のUsageLedger行は変更せず、理由付きの補正行を追加する。
export async function addUsageCorrectionAction(eventId: string, participationId: string, formData: FormData) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("訂正理由は必須です。");

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_usage_correction", {
    p_event_participation_id: participationId,
    p_reason: reason,
  });
  if (error) throw new Error(`課金訂正に失敗しました: ${error.message}`);

  revalidatePath(`/events/${eventId}/exhibitors/${participationId}`);
}

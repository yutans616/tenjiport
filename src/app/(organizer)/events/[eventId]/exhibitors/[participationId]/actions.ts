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

export async function resendRevisionRequestAction(eventId: string, participationId: string, revisionRequestId: string) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase.rpc("resend_revision_request", {
    p_revision_request_id: revisionRequestId,
  });
  if (error) throw new Error(`修正依頼の再送に失敗しました: ${error.message}`);

  await processPendingNotifications(50);
  revalidatePath(`/events/${eventId}/exhibitors/${participationId}`);
}

export async function cancelRevisionRequestAction(eventId: string, participationId: string, submissionVersionId: string) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_revision_request", {
    p_submission_version_id: submissionVersionId,
  });
  if (error) throw new Error(`修正依頼の取り消しに失敗しました: ${error.message}`);

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

export type UpdateNoteResult = { ok: true } | { ok: false; error: string };

// 出展者一覧・詳細ページの主催者専用メモ（出展者には表示されない）。
export async function updateOrganizerNote(
  eventId: string,
  participationId: string,
  note: string,
): Promise<UpdateNoteResult> {
  const context = await getOrganizerContext();
  if (!context) return { ok: false, error: "ログインが必要です。" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_participations")
    .update({ organizer_note: note.trim() || null })
    .eq("id", participationId)
    .eq("event_id", eventId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/events/${eventId}/exhibitors`);
  revalidatePath(`/events/${eventId}/exhibitors/${participationId}`);
  return { ok: true };
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

// 出展者のキャンセル。既にサービスを利用（提出）した参加は、キャンセル後も課金対象の
// ままとする（イベント終了間際に全員キャンセルして課金を免れる、という抜け道を防ぐため）。
// 重複登録・テスト登録など「そもそも課金すべきでなかった」場合は、このアクションではなく
// 既存の addUsageCorrectionAction（課金対象から除外する）を別途使う。
export async function cancelParticipationAction(eventId: string, participationId: string, formData: FormData) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("キャンセル理由は必須です。");

  const supabase = await createClient();

  const { error: cancelError } = await supabase.rpc("cancel_event_participation", {
    p_event_participation_id: participationId,
    p_reason: reason,
  });
  if (cancelError) throw new Error(`キャンセルに失敗しました: ${cancelError.message}`);

  revalidatePath(`/events/${eventId}/exhibitors`);
  revalidatePath(`/events/${eventId}/exhibitors/${participationId}`);
}

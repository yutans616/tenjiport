"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext } from "@/lib/organizer/context";
import { processPendingNotifications } from "@/lib/notifications/processPendingNotifications";
import { sanitizeStorageFilename } from "@/lib/storage/sanitizeFilename";
import { createSignedUpload } from "@/lib/storage/signedUpload";
import { checkEventStorageQuota } from "@/lib/storage/eventStorageQuota";
import { deleteFileAsset } from "@/lib/storage/deleteFileAsset";

async function requireOrganizerEvent(eventId: string) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, organizer_organization_id")
    .eq("id", eventId)
    .eq("organizer_organization_id", context!.organizationId)
    .single();
  if (!event) throw new Error("イベントが見つかりません。");
  return { context: context!, supabase, event };
}

export async function createAnnouncementDraft(eventId: string, formData: FormData) {
  const { supabase, context } = await requireOrganizerEvent(eventId);

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const ackRequired = formData.get("ack_required") === "on";
  const requiresSubmission = formData.get("requires_submission") === "on";
  const submissionDueDate = String(formData.get("submission_due_date") ?? "").trim() || null;
  const audienceType = String(formData.get("audience_type") ?? "all");
  const participationIds = formData.getAll("participation_ids").map(String);

  if (!title) throw new Error("タイトルは必須です。");
  if (audienceType !== "all" && audienceType !== "individual") {
    throw new Error("不正な公開対象です。");
  }
  if (audienceType === "individual" && participationIds.length === 0) {
    throw new Error("個別選択の場合は対象を1件以上選んでください。");
  }

  const { data: announcement, error: announcementError } = await supabase
    .from("announcements")
    .insert({
      event_id: eventId,
      created_by_user_id: context.userId,
      ack_required: ackRequired,
      requires_submission: requiresSubmission,
      submission_due_date: submissionDueDate,
    })
    .select("id")
    .single();
  if (announcementError || !announcement) {
    throw new Error(`資料の作成に失敗しました: ${announcementError?.message}`);
  }

  const { data: version, error: versionError } = await supabase
    .from("announcement_versions")
    .insert({ announcement_id: announcement.id, version_number: 1, title, body, status: "draft" })
    .select("id")
    .single();
  if (versionError || !version) {
    throw new Error(`資料の作成に失敗しました: ${versionError?.message}`);
  }

  const { error: audienceError } = await supabase.from("announcement_audiences").insert({
    announcement_version_id: version.id,
    audience_type: audienceType,
    event_participation_ids: audienceType === "individual" ? participationIds : [],
  });
  if (audienceError) {
    throw new Error(`公開対象の設定に失敗しました: ${audienceError.message}`);
  }

  revalidatePath(`/events/${eventId}/announcements`);
  redirect(`/events/${eventId}/announcements/${version.id}`);
}

// 提出期限は依頼（announcements）側の属性のため、announcement_versions経由で
// announcement_idを引いてから更新する。公開後も変更できる（締切延長など）。
export async function updateSubmissionDueDate(eventId: string, announcementVersionId: string, formData: FormData) {
  const { supabase } = await requireOrganizerEvent(eventId);

  const submissionDueDate = String(formData.get("submission_due_date") ?? "").trim() || null;

  const { data: version } = await supabase
    .from("announcement_versions")
    .select("announcement_id")
    .eq("id", announcementVersionId)
    .single();
  if (!version) throw new Error("資料が見つかりません。");

  const { error } = await supabase
    .from("announcements")
    .update({ submission_due_date: submissionDueDate })
    .eq("id", version.announcement_id);
  if (error) throw new Error(`提出期限の更新に失敗しました: ${error.message}`);

  revalidatePath(`/events/${eventId}/announcements/${announcementVersionId}`);
}

export type UpdateAudienceResult = { ok: true } | { ok: false; error: string };

// 公開対象は既存行を削除して作り直す（1バージョンにつき常に1行という設計を保つため）。
// 公開後の変更も許可する（新しく対象になった出展者には遡って通知は送られない。
// 必要であれば「未確認者へ再通知」を別途使う）。
export async function updateAnnouncementAudience(
  eventId: string,
  announcementVersionId: string,
  formData: FormData,
): Promise<UpdateAudienceResult> {
  const { supabase } = await requireOrganizerEvent(eventId);

  const audienceType = String(formData.get("audience_type") ?? "all");
  const participationIds = formData.getAll("participation_ids").map(String);

  if (audienceType !== "all" && audienceType !== "individual") {
    return { ok: false, error: "不正な公開対象です。" };
  }
  if (audienceType === "individual" && participationIds.length === 0) {
    return { ok: false, error: "個別選択の場合は対象を1件以上選んでください。" };
  }

  const { error: deleteError } = await supabase
    .from("announcement_audiences")
    .delete()
    .eq("announcement_version_id", announcementVersionId);
  if (deleteError) {
    return { ok: false, error: `公開対象の更新に失敗しました: ${deleteError.message}` };
  }

  const { error: insertError } = await supabase.from("announcement_audiences").insert({
    announcement_version_id: announcementVersionId,
    audience_type: audienceType,
    event_participation_ids: audienceType === "individual" ? participationIds : [],
  });
  if (insertError) {
    return { ok: false, error: `公開対象の更新に失敗しました: ${insertError.message}` };
  }

  revalidatePath(`/events/${eventId}/announcements/${announcementVersionId}`);
  return { ok: true };
}

export type UploadAttachmentResult = { ok: true } | { ok: false; error: string };
export type CreateAttachmentUploadUrlResult = { ok: true; storageKey: string; token: string } | { ok: false; error: string };

// フェーズ1：署名付きアップロードURLを発行する（ファイル本体はブラウザから直接
// Supabase Storageへアップロードする。理由はsignedUpload.ts参照）。
export async function createAttachmentUploadUrl(
  eventId: string,
  filename: string,
  fileSize: number,
): Promise<CreateAttachmentUploadUrlResult> {
  const { context } = await requireOrganizerEvent(eventId);

  const quota = await checkEventStorageQuota(eventId, fileSize);
  if (!quota.ok) return quota;

  const safeFilename = sanitizeStorageFilename(filename);
  const storageKey = `${context.organizationId}/${eventId}/${randomUUID()}-${safeFilename}`;
  return createSignedUpload(storageKey, fileSize);
}

// フェーズ2：ブラウザからのアップロード完了後に呼び、添付ファイルとして登録する。
export async function finalizeAttachmentUpload(
  eventId: string,
  announcementVersionId: string,
  storageKey: string,
  filename: string,
  fileSize: number,
  contentType: string,
): Promise<UploadAttachmentResult> {
  const { supabase, context } = await requireOrganizerEvent(eventId);

  const expectedPrefix = `${context.organizationId}/${eventId}/`;
  if (!storageKey.startsWith(expectedPrefix)) {
    return { ok: false, error: "不正なアップロードです。" };
  }

  const serviceClient = createServiceRoleClient();

  // アップロードURL発行時にもチェック済みだが、実際のアップロード完了までの間に
  // 他のアップロードが割り込む競合を完全には防げないため、登録直前にも再チェックする。
  const quota = await checkEventStorageQuota(eventId, fileSize);
  if (!quota.ok) {
    await serviceClient.storage.from("files").remove([storageKey]);
    return quota;
  }

  const { data: fileAsset, error: fileAssetError } = await serviceClient
    .from("file_assets")
    .insert({
      organizer_organization_id: context.organizationId,
      event_id: eventId,
      uploader_user_id: context.userId,
      kind: "announcement_attachment",
      storage_key: storageKey,
      filename,
      content_type: contentType || "application/octet-stream",
      size_bytes: fileSize,
    })
    .select("id")
    .single();
  if (fileAssetError || !fileAsset) {
    return { ok: false, error: `添付の登録に失敗しました: ${fileAssetError?.message}` };
  }

  const { error: attachmentError } = await supabase
    .from("announcement_attachments")
    .insert({ announcement_version_id: announcementVersionId, file_asset_id: fileAsset.id });
  if (attachmentError) {
    return { ok: false, error: `添付の登録に失敗しました: ${attachmentError.message}` };
  }

  revalidatePath(`/events/${eventId}/announcements/${announcementVersionId}`);
  return { ok: true };
}

export async function deleteAttachment(
  eventId: string,
  announcementVersionId: string,
  attachmentId: string,
): Promise<UploadAttachmentResult> {
  const { supabase } = await requireOrganizerEvent(eventId);

  const { data: version } = await supabase
    .from("announcement_versions")
    .select("status")
    .eq("id", announcementVersionId)
    .single();
  if (!version || version.status !== "draft") {
    return { ok: false, error: "公開後は添付ファイルを削除できません。" };
  }

  const { data: attachment } = await supabase
    .from("announcement_attachments")
    .select("file_asset_id")
    .eq("id", attachmentId)
    .eq("announcement_version_id", announcementVersionId)
    .single();
  if (!attachment) return { ok: false, error: "添付ファイルが見つかりません。" };

  // Storage実体の削除を先に行う。先に紐付け行を消してしまうと、Storage削除が
  // 失敗した場合に添付が画面から消えたのにStorage・file_assetsだけが残り、
  // ファイル容量上限が戻らないうえ再試行する手段も無くなる（画面上は既に削除済み
  // に見えるため）。失敗時はここで打ち切り、添付を残したままエラーを返す。
  const deleteResult = await deleteFileAsset(attachment.file_asset_id);
  if (!deleteResult.ok) {
    return { ok: false, error: deleteResult.error };
  }

  const { error } = await supabase
    .from("announcement_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("announcement_version_id", announcementVersionId);
  if (error) return { ok: false, error: `添付の削除に失敗しました: ${error.message}` };

  revalidatePath(`/events/${eventId}/announcements/${announcementVersionId}`);
  return { ok: true };
}

export async function publishAnnouncementAction(eventId: string, announcementVersionId: string) {
  const { supabase } = await requireOrganizerEvent(eventId);

  const { data: version } = await supabase
    .from("announcement_versions")
    .select("announcement_id, announcements!announcement_versions_announcement_id_fkey(requires_submission)")
    .eq("id", announcementVersionId)
    .single();
  const announcement = version
    ? Array.isArray(version.announcements)
      ? version.announcements[0]
      : version.announcements
    : null;

  if (!announcement?.requires_submission) {
    const { count } = await supabase
      .from("announcement_attachments")
      .select("id", { count: "exact", head: true })
      .eq("announcement_version_id", announcementVersionId);
    if (!count || count === 0) {
      throw new Error("公開する前に添付ファイルを1件以上追加してください。");
    }
  }

  const { error } = await supabase.rpc("publish_announcement", { p_announcement_version_id: announcementVersionId });
  if (error) throw new Error(`公開に失敗しました: ${error.message}`);

  // 公開＝通知の期待に応えるため、キューに積むだけでなくその場で送信まで行う。
  await processPendingNotifications(50);
  revalidatePath(`/events/${eventId}/announcements/${announcementVersionId}`);
}

export async function resendAnnouncementAction(eventId: string, announcementVersionId: string) {
  const { supabase } = await requireOrganizerEvent(eventId);
  const { data: resentCount, error } = await supabase.rpc("resend_announcement", {
    p_announcement_version_id: announcementVersionId,
  });
  if (error) throw new Error(`再通知に失敗しました: ${error.message}`);

  await processPendingNotifications(50);
  revalidatePath(`/events/${eventId}/announcements/${announcementVersionId}`);
  redirect(`/events/${eventId}/announcements/${announcementVersionId}?done=resent&count=${resentCount ?? 0}`);
}

// 送信待ちの通知をその場で処理する（本番ではCronが担うが、手動実行の導線としても残す）
export async function processNotificationsNowAction(eventId: string, announcementVersionId: string) {
  await requireOrganizerEvent(eventId);
  await processPendingNotifications(50);
  revalidatePath(`/events/${eventId}/announcements/${announcementVersionId}`);
  redirect(`/events/${eventId}/announcements/${announcementVersionId}?done=processed`);
}

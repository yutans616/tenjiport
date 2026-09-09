"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext } from "@/lib/organizer/context";
import { processPendingNotifications } from "@/lib/notifications/processPendingNotifications";

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
    .insert({ event_id: eventId, created_by_user_id: context.userId, ack_required: ackRequired })
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

export async function uploadAttachment(eventId: string, announcementVersionId: string, formData: FormData) {
  const { supabase, context } = await requireOrganizerEvent(eventId);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("ファイルを選択してください。");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("ファイルサイズは20MB以下にしてください。");
  }

  const storageKey = `${context.organizationId}/${eventId}/${randomUUID()}-${file.name}`;
  const serviceClient = createServiceRoleClient();
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await serviceClient.storage
    .from("files")
    .upload(storageKey, Buffer.from(arrayBuffer), { contentType: file.type || "application/octet-stream" });
  if (uploadError) {
    throw new Error(`アップロードに失敗しました: ${uploadError.message}`);
  }

  const { data: fileAsset, error: fileAssetError } = await serviceClient
    .from("file_assets")
    .insert({
      organizer_organization_id: context.organizationId,
      event_id: eventId,
      uploader_user_id: context.userId,
      kind: "announcement_attachment",
      storage_key: storageKey,
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      size_bytes: file.size,
    })
    .select("id")
    .single();
  if (fileAssetError || !fileAsset) {
    throw new Error(`添付の登録に失敗しました: ${fileAssetError?.message}`);
  }

  const { error: attachmentError } = await supabase
    .from("announcement_attachments")
    .insert({ announcement_version_id: announcementVersionId, file_asset_id: fileAsset.id });
  if (attachmentError) {
    throw new Error(`添付の登録に失敗しました: ${attachmentError.message}`);
  }

  revalidatePath(`/events/${eventId}/announcements/${announcementVersionId}`);
}

export async function deleteAttachment(eventId: string, announcementVersionId: string, attachmentId: string) {
  const { supabase } = await requireOrganizerEvent(eventId);

  const { data: version } = await supabase
    .from("announcement_versions")
    .select("status")
    .eq("id", announcementVersionId)
    .single();
  if (!version || version.status !== "draft") {
    throw new Error("公開後は添付ファイルを削除できません。");
  }

  const { error } = await supabase
    .from("announcement_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("announcement_version_id", announcementVersionId);
  if (error) throw new Error(`添付の削除に失敗しました: ${error.message}`);

  revalidatePath(`/events/${eventId}/announcements/${announcementVersionId}`);
}

export async function publishAnnouncementAction(eventId: string, announcementVersionId: string) {
  const { supabase } = await requireOrganizerEvent(eventId);

  const { count } = await supabase
    .from("announcement_attachments")
    .select("id", { count: "exact", head: true })
    .eq("announcement_version_id", announcementVersionId);
  if (!count || count === 0) {
    throw new Error("公開する前に添付ファイルを1件以上追加してください。");
  }

  const { error } = await supabase.rpc("publish_announcement", { p_announcement_version_id: announcementVersionId });
  if (error) throw new Error(`公開に失敗しました: ${error.message}`);
  revalidatePath(`/events/${eventId}/announcements/${announcementVersionId}`);
}

export async function resendAnnouncementAction(eventId: string, announcementVersionId: string) {
  const { supabase } = await requireOrganizerEvent(eventId);
  const { error } = await supabase.rpc("resend_announcement", { p_announcement_version_id: announcementVersionId });
  if (error) throw new Error(`再通知に失敗しました: ${error.message}`);
  revalidatePath(`/events/${eventId}/announcements/${announcementVersionId}`);
}

// 送信待ちの通知をその場で処理する（本番ではCronが担うが、手動実行の導線としても残す）
export async function processNotificationsNowAction(eventId: string, announcementVersionId: string) {
  await requireOrganizerEvent(eventId);
  await processPendingNotifications(50);
  revalidatePath(`/events/${eventId}/announcements/${announcementVersionId}`);
}

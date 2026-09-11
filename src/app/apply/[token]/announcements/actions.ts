"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sanitizeStorageFilename } from "@/lib/storage/sanitizeFilename";

export async function acknowledgeAnnouncement(token: string, announcementVersionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_announcement", {
    p_announcement_version_id: announcementVersionId,
  });
  if (error) throw new Error(`確認の記録に失敗しました: ${error.message}`);

  revalidatePath(`/apply/${token}/announcements`);
  revalidatePath(`/apply/${token}/announcements/${announcementVersionId}`);
}

export type SubmissionUploadResult = { ok: true } | { ok: false; error: string };

// 出展者が資料への提出物（ロゴ・車両証等）をアップロードする。
export async function uploadAnnouncementSubmission(
  token: string,
  announcementVersionId: string,
  formData: FormData,
): Promise<SubmissionUploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "セッションが切れました。もう一度メールから確認してください。" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "ファイルを選択してください。" };
  }
  if (file.size > 20 * 1024 * 1024) {
    return {
      ok: false,
      error: `ファイルサイズは20MB以下にしてください（このファイル: ${(file.size / 1024 / 1024).toFixed(1)}MB）。`,
    };
  }

  // announcement_versions/announcementsは出展者に直接SELECTするRLSを付与していない
  // （出展者はget_my_announcements経由でのみ資料を読む設計のため）。event/participationは
  // 出展者自身が読めるテーブルから辿り、提出可否そのものはINSERTポリシーと同じ
  // can_submit_announcement（SECURITY DEFINER）で判定して基準をずらさないようにする。
  const { data: event } = await supabase
    .from("events")
    .select("id, organizer_organization_id")
    .eq("public_form_token", token)
    .maybeSingle();
  if (!event) {
    return { ok: false, error: "イベントが見つかりません。" };
  }

  // 出展者が複数ブランドを持つ場合があるため、ユーザーの適当な1ブランドではなく、
  // このイベントに実際に参加履歴があるブランドをイベント文脈で直接絞り込む
  // （同一イベントに複数ブランドで参加している稀なケースでは、最初の参加を使う）。
  const { data: memberships } = await supabase
    .from("exhibitor_memberships")
    .select("exhibitor_profile_id")
    .eq("user_id", user.id)
    .eq("status", "active");
  const profileIds = (memberships ?? []).map((m) => m.exhibitor_profile_id);
  if (profileIds.length === 0) {
    return { ok: false, error: "参加情報が見つかりません。" };
  }

  const { data: participation } = await supabase
    .from("event_participations")
    .select("id")
    .eq("event_id", event.id)
    .in("exhibitor_profile_id", profileIds)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!participation) {
    return { ok: false, error: "参加情報が見つかりません。" };
  }

  const { data: canSubmit } = await supabase.rpc("can_submit_announcement", {
    p_announcement_version_id: announcementVersionId,
    p_event_participation_id: participation.id,
  });
  if (!canSubmit) {
    return { ok: false, error: "この資料は提出を求められていません。" };
  }

  const serviceClient = createServiceRoleClient();
  const storageKey = `${event.organizer_organization_id}/${event.id}/announcement-submissions/${participation.id}/${randomUUID()}-${sanitizeStorageFilename(file.name)}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await serviceClient.storage
    .from("files")
    .upload(storageKey, Buffer.from(arrayBuffer), { contentType: file.type || "application/octet-stream" });
  if (uploadError) {
    return { ok: false, error: `アップロードに失敗しました: ${uploadError.message}` };
  }

  const { data: fileAsset, error: fileAssetError } = await serviceClient
    .from("file_assets")
    .insert({
      organizer_organization_id: event.organizer_organization_id,
      event_id: event.id,
      uploader_user_id: user.id,
      kind: "submission_attachment",
      storage_key: storageKey,
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      size_bytes: file.size,
    })
    .select("id")
    .single();
  if (fileAssetError || !fileAsset) {
    return { ok: false, error: `ファイルの登録に失敗しました: ${fileAssetError?.message}` };
  }

  const { error: submissionError } = await supabase.from("announcement_submissions").insert({
    announcement_version_id: announcementVersionId,
    event_participation_id: participation.id,
    file_asset_id: fileAsset.id,
    submitted_by_user_id: user.id,
  });
  if (submissionError) {
    return { ok: false, error: `提出の登録に失敗しました: ${submissionError.message}` };
  }

  revalidatePath(`/apply/${token}/announcements/${announcementVersionId}`);
  return { ok: true };
}

export async function deleteAnnouncementSubmission(
  token: string,
  announcementVersionId: string,
  submissionId: string,
): Promise<SubmissionUploadResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("announcement_submissions").delete().eq("id", submissionId);
  if (error) {
    return { ok: false, error: `削除に失敗しました: ${error.message}` };
  }

  revalidatePath(`/apply/${token}/announcements/${announcementVersionId}`);
  return { ok: true };
}

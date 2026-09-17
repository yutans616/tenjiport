"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sanitizeStorageFilename } from "@/lib/storage/sanitizeFilename";
import { createSignedUpload } from "@/lib/storage/signedUpload";
import { checkEventStorageQuota } from "@/lib/storage/eventStorageQuota";
import { deleteFileAsset } from "@/lib/storage/deleteFileAsset";

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

// 提出者の所有権・提出可否を確認する共通処理（アップロードURL発行・完了登録の両方で使う）。
async function verifyAnnouncementSubmitter(token: string, announcementVersionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "セッションが切れました。もう一度メールから確認してください。" };

  // announcement_versions/announcementsは出展者に直接SELECTするRLSを付与していない
  // （出展者はget_my_announcements経由でのみ資料を読む設計のため）。event/participationは
  // 出展者自身が読めるテーブルから辿り、提出可否そのものはINSERTポリシーと同じ
  // can_submit_announcement（SECURITY DEFINER）で判定して基準をずらさないようにする。
  const { data: event } = await supabase
    .from("events")
    .select("id, organizer_organization_id")
    .eq("public_form_token", token)
    .maybeSingle();
  if (!event) return { ok: false as const, error: "イベントが見つかりません。" };

  // 出展者が複数ブランドを持つ場合があるため、ユーザーの適当な1ブランドではなく、
  // このイベントに実際に参加履歴があるブランドをイベント文脈で直接絞り込む
  // （同一イベントに複数ブランドで参加している稀なケースでは、最初の参加を使う）。
  const { data: memberships } = await supabase
    .from("exhibitor_memberships")
    .select("exhibitor_profile_id")
    .eq("user_id", user.id)
    .eq("status", "active");
  const profileIds = (memberships ?? []).map((m) => m.exhibitor_profile_id);
  if (profileIds.length === 0) return { ok: false as const, error: "参加情報が見つかりません。" };

  const { data: participation } = await supabase
    .from("event_participations")
    .select("id")
    .eq("event_id", event.id)
    .in("exhibitor_profile_id", profileIds)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!participation) return { ok: false as const, error: "参加情報が見つかりません。" };

  const { data: canSubmit } = await supabase.rpc("can_submit_announcement", {
    p_announcement_version_id: announcementVersionId,
    p_event_participation_id: participation.id,
  });
  if (!canSubmit) return { ok: false as const, error: "この資料は提出を求められていません。" };

  return {
    ok: true as const,
    userId: user.id,
    eventId: event.id,
    organizerOrganizationId: event.organizer_organization_id,
    participationId: participation.id,
  };
}

export type CreateUploadUrlResult = { ok: true; storageKey: string; token: string } | { ok: false; error: string };

// フェーズ1：署名付きアップロードURLを発行する（ファイル本体はブラウザから直接
// Supabase Storageへアップロードする。理由はsignedUpload.ts参照）。
export async function createAnnouncementSubmissionUploadUrl(
  token: string,
  announcementVersionId: string,
  filename: string,
  fileSize: number,
): Promise<CreateUploadUrlResult> {
  const submitter = await verifyAnnouncementSubmitter(token, announcementVersionId);
  if (!submitter.ok) return submitter;

  const quota = await checkEventStorageQuota(submitter.eventId, fileSize);
  if (!quota.ok) return quota;

  const storageKey = `${submitter.organizerOrganizationId}/${submitter.eventId}/announcement-submissions/${submitter.participationId}/${randomUUID()}-${sanitizeStorageFilename(filename)}`;
  return createSignedUpload(storageKey, fileSize);
}

// フェーズ2：ブラウザからのアップロード完了後に呼び、出展者が資料への提出物
// （ロゴ・車両証等）をアップロードしたことを登録する。
export async function finalizeAnnouncementSubmissionUpload(
  token: string,
  announcementVersionId: string,
  storageKey: string,
  filename: string,
  fileSize: number,
  contentType: string,
): Promise<SubmissionUploadResult> {
  const submitter = await verifyAnnouncementSubmitter(token, announcementVersionId);
  if (!submitter.ok) return submitter;

  const expectedPrefix = `${submitter.organizerOrganizationId}/${submitter.eventId}/announcement-submissions/${submitter.participationId}/`;
  if (!storageKey.startsWith(expectedPrefix)) {
    return { ok: false, error: "不正なアップロードです。" };
  }

  const supabase = await createClient();
  const serviceClient = createServiceRoleClient();

  // アップロードURL発行時にもチェック済みだが、実際のアップロード完了までの間に
  // 他のアップロードが割り込む競合を完全には防げないため、登録直前にも再チェックする。
  const quota = await checkEventStorageQuota(submitter.eventId, fileSize);
  if (!quota.ok) {
    await serviceClient.storage.from("files").remove([storageKey]);
    return quota;
  }

  const { data: fileAsset, error: fileAssetError } = await serviceClient
    .from("file_assets")
    .insert({
      organizer_organization_id: submitter.organizerOrganizationId,
      event_id: submitter.eventId,
      uploader_user_id: submitter.userId,
      kind: "submission_attachment",
      storage_key: storageKey,
      filename,
      content_type: contentType || "application/octet-stream",
      size_bytes: fileSize,
    })
    .select("id")
    .single();
  if (fileAssetError || !fileAsset) {
    return { ok: false, error: `ファイルの登録に失敗しました: ${fileAssetError?.message}` };
  }

  const { error: submissionError } = await supabase.from("announcement_submissions").insert({
    announcement_version_id: announcementVersionId,
    event_participation_id: submitter.participationId,
    file_asset_id: fileAsset.id,
    submitted_by_user_id: submitter.userId,
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
  const submitter = await verifyAnnouncementSubmitter(token, announcementVersionId);
  if (!submitter.ok) return submitter;

  const supabase = await createClient();
  const { data: submission } = await supabase
    .from("announcement_submissions")
    .select("file_asset_id")
    .eq("id", submissionId)
    .eq("announcement_version_id", announcementVersionId)
    .eq("event_participation_id", submitter.participationId)
    .single();
  if (!submission) return { ok: false, error: "提出物が見つかりません。" };

  // Storage実体の削除を先に行う。先に紐付け行を消すと、Storage削除が失敗した場合に
  // 提出物が画面から消えたのにStorage・file_assetsだけ残り、ファイル容量上限が戻らない
  // うえ再試行する手段も無くなる（画面上は既に削除済みに見えるため）。
  const deleteResult = await deleteFileAsset(submission.file_asset_id);
  if (!deleteResult.ok) {
    return { ok: false, error: deleteResult.error };
  }

  const { error } = await supabase.from("announcement_submissions").delete().eq("id", submissionId);
  if (error) {
    return { ok: false, error: `削除に失敗しました: ${error.message}` };
  }

  revalidatePath(`/apply/${token}/announcements/${announcementVersionId}`);
  return { ok: true };
}

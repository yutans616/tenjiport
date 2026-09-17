"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getClientIp } from "@/lib/security/clientIp";
import { sanitizeStorageFilename } from "@/lib/storage/sanitizeFilename";
import { createSignedUpload } from "@/lib/storage/signedUpload";
import { checkEventStorageQuota } from "@/lib/storage/eventStorageQuota";

const SUBMIT_LIMIT_PER_IP = 20; // 1時間あたり
const SUBMIT_WINDOW_SECONDS_PER_IP = 3600;

// このイベントへの初回応募時、複数ブランドを持つ出展者に「どのブランドで応募するか」
// を選ばせた結果を反映する。choice はブランドのexhibitor_profile_id、または新規ブランド
// を意味する "new"。参加履歴を作るだけで提出データ自体は使わず、同じページへ戻す
// （戻った先は参加履歴が存在するため needs_profile_selection=false で解決する）。
export async function resolveExhibitorProfile(token: string, eventId: string, choice: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_or_resume_submission", {
    p_event_id: eventId,
    p_exhibitor_profile_id: choice === "new" ? null : choice,
    p_create_new: choice === "new",
  });
  if (error) throw new Error(`ブランドの選択に失敗しました: ${error.message}`);
  redirect(`/apply/${token}/form`);
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

export async function submitExhibitorForm(
  submissionVersionId: string,
  answers: Record<string, unknown>,
  quantities: Record<string, Record<string, number>>,
  honeypot: string,
): Promise<SubmitResult> {
  // ハニーポットが埋まっていればBotとみなし、実際には提出せず成功したふりをする
  if (honeypot) {
    return { ok: true };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "セッションが切れました。もう一度メールから確認してください。" };
  }

  const ip = await getClientIp();
  const serviceClient = createServiceRoleClient();

  const [ipAllowed, userAllowed] = await Promise.all([
    serviceClient.rpc("check_and_increment_rate_limit", {
      p_scope: "submit_ip",
      p_key: ip,
      p_limit: SUBMIT_LIMIT_PER_IP,
      p_window_seconds: SUBMIT_WINDOW_SECONDS_PER_IP,
    }),
    serviceClient.rpc("check_and_increment_rate_limit", {
      p_scope: "submit_user",
      p_key: user.id,
      p_limit: SUBMIT_LIMIT_PER_IP,
      p_window_seconds: SUBMIT_WINDOW_SECONDS_PER_IP,
    }),
  ]);

  if (ipAllowed.data === false || userAllowed.data === false) {
    return { ok: false, error: "リクエストが多すぎます。しばらく時間をおいて再度お試しください。" };
  }

  const { error } = await supabase.rpc("submit_current_version", {
    p_submission_version_id: submissionVersionId,
    p_answers: answers,
    p_quantities: quantities,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// 提出中のバージョンの所有権を確認し、file_assetsの登録に必要な情報を返す共通処理。
// アップロードURL発行・アップロード完了後の登録の両方で同じ検証を行う必要があるため
// 共通化する。
async function verifyDraftSubmissionOwnership(submissionVersionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "セッションが切れました。もう一度メールから確認してください。" };

  const { data: version } = await supabase
    .from("submission_versions")
    .select("id, status, event_participation_id")
    .eq("id", submissionVersionId)
    .single();
  if (!version || version.status !== "draft") {
    return { ok: false as const, error: "この提出は編集できない状態です。" };
  }

  const { data: participation } = await supabase
    .from("event_participations")
    .select("event_id")
    .eq("id", version.event_participation_id)
    .single();
  if (!participation) return { ok: false as const, error: "参加情報が見つかりません。" };

  const { data: event } = await supabase
    .from("events")
    .select("organizer_organization_id")
    .eq("id", participation.event_id)
    .single();
  if (!event) return { ok: false as const, error: "イベントが見つかりません。" };

  return {
    ok: true as const,
    userId: user.id,
    eventId: participation.event_id,
    participationId: version.event_participation_id,
    organizerOrganizationId: event.organizer_organization_id,
  };
}

export type CreateUploadUrlResult = { ok: true; storageKey: string; token: string } | { ok: false; error: string };

// 出展者が入力中のフォームへファイル（ロゴ等）を添付する（フェーズ1）。
// ファイル本体はここでは受け取らず、ブラウザから直接Supabase Storageへ
// アップロードさせるための署名付きURLだけを発行する（理由はsignedUpload.ts参照）。
// 提出済み（draft以外）のバージョンには追加できない。
export async function createSubmissionFileUploadUrl(
  submissionVersionId: string,
  filename: string,
  fileSize: number,
): Promise<CreateUploadUrlResult> {
  const owner = await verifyDraftSubmissionOwnership(submissionVersionId);
  if (!owner.ok) return owner;

  const quota = await checkEventStorageQuota(owner.eventId, fileSize);
  if (!quota.ok) return quota;

  const storageKey = `${owner.organizerOrganizationId}/${owner.eventId}/exhibitor-uploads/${owner.participationId}/${randomUUID()}-${sanitizeStorageFilename(filename)}`;
  return createSignedUpload(storageKey, fileSize);
}

export type UploadResult = { ok: true; fileAssetId: string; filename: string } | { ok: false; error: string };

// フェーズ2：ブラウザからSupabase Storageへの直接アップロードが完了した後に呼び、
// file_assets行を作成する。storageKeyは自分のセッションから導出したプレフィックスと
// 一致することを確認し、他人（あるいは他イベント）のストレージキーを不正に
// 自分の提出物として登録できないようにする。
export async function finalizeSubmissionFileUpload(
  submissionVersionId: string,
  storageKey: string,
  filename: string,
  fileSize: number,
  contentType: string,
): Promise<UploadResult> {
  const owner = await verifyDraftSubmissionOwnership(submissionVersionId);
  if (!owner.ok) return owner;

  const expectedPrefix = `${owner.organizerOrganizationId}/${owner.eventId}/exhibitor-uploads/${owner.participationId}/`;
  if (!storageKey.startsWith(expectedPrefix)) {
    return { ok: false, error: "不正なアップロードです。" };
  }

  const serviceClient = createServiceRoleClient();
  const { data: fileAsset, error: fileAssetError } = await serviceClient
    .from("file_assets")
    .insert({
      organizer_organization_id: owner.organizerOrganizationId,
      event_id: owner.eventId,
      uploader_user_id: owner.userId,
      kind: "submission_attachment",
      storage_key: storageKey,
      filename,
      content_type: contentType || "application/octet-stream",
      size_bytes: fileSize,
    })
    .select("id, filename")
    .single();
  if (fileAssetError || !fileAsset) {
    return { ok: false, error: `ファイルの登録に失敗しました: ${fileAssetError?.message}` };
  }

  return { ok: true, fileAssetId: fileAsset.id, filename: fileAsset.filename ?? filename };
}

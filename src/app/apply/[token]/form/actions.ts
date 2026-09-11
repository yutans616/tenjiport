"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getClientIp } from "@/lib/security/clientIp";
import { sanitizeStorageFilename } from "@/lib/storage/sanitizeFilename";

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

export type UploadResult = { ok: true; fileAssetId: string; filename: string } | { ok: false; error: string };

// 出展者が入力中のフォームへファイル（ロゴ等）を添付する。
// 提出済み（draft以外）のバージョンには追加できない。
export async function uploadSubmissionFile(submissionVersionId: string, formData: FormData): Promise<UploadResult> {
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
  if (file.size > 10 * 1024 * 1024) {
    return {
      ok: false,
      error: `ファイルサイズは10MB以下にしてください（このファイル: ${(file.size / 1024 / 1024).toFixed(1)}MB）。`,
    };
  }

  // 所有権確認：このバージョンが自分の下書きであること
  const { data: version } = await supabase
    .from("submission_versions")
    .select("id, status, event_participation_id")
    .eq("id", submissionVersionId)
    .single();
  if (!version || version.status !== "draft") {
    return { ok: false, error: "この提出は編集できない状態です。" };
  }

  const { data: participation } = await supabase
    .from("event_participations")
    .select("event_id")
    .eq("id", version.event_participation_id)
    .single();
  if (!participation) {
    return { ok: false, error: "参加情報が見つかりません。" };
  }

  const { data: event } = await supabase
    .from("events")
    .select("organizer_organization_id")
    .eq("id", participation.event_id)
    .single();
  if (!event) {
    return { ok: false, error: "イベントが見つかりません。" };
  }

  const serviceClient = createServiceRoleClient();
  const storageKey = `${event.organizer_organization_id}/${participation.event_id}/exhibitor-uploads/${version.event_participation_id}/${randomUUID()}-${sanitizeStorageFilename(file.name)}`;
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
      event_id: participation.event_id,
      uploader_user_id: user.id,
      kind: "submission_attachment",
      storage_key: storageKey,
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      size_bytes: file.size,
    })
    .select("id, filename")
    .single();
  if (fileAssetError || !fileAsset) {
    return { ok: false, error: `ファイルの登録に失敗しました: ${fileAssetError?.message}` };
  }

  return { ok: true, fileAssetId: fileAsset.id, filename: fileAsset.filename ?? file.name };
}

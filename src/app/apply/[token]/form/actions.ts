"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getClientIp } from "@/lib/security/clientIp";

const SUBMIT_LIMIT_PER_IP = 20; // 1時間あたり
const SUBMIT_WINDOW_SECONDS_PER_IP = 3600;

export type SubmitResult = { ok: true } | { ok: false; error: string };

export async function submitExhibitorForm(
  submissionVersionId: string,
  answers: Record<string, unknown>,
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
    return { ok: false, error: "ファイルサイズは10MB以下にしてください。" };
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
  const storageKey = `${event.organizer_organization_id}/${participation.event_id}/exhibitor-uploads/${version.event_participation_id}/${randomUUID()}-${file.name}`;
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

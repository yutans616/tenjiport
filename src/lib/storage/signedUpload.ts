import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_UPLOAD_BYTES, formatMB } from "./uploadLimits";

// Server Actionはボディサイズに上限があり（Next.jsの設定に加えて、Vercelの
// サーバーレス関数自体に約4.5MBの固定上限があり、これはアプリ側の設定では変更できない）、
// ファイル本体をServer Action経由でアップロードする方式では、その上限に近いファイルが
// 「エラーも出ずに反映されない」形で失敗する（境界を超えたリクエストがアプリコードに
// 届く前にプラットフォーム側で拒否されるため）。
// これを避けるため、ファイル本体はブラウザからSupabase Storageへ直接アップロードし、
// Server Actionは「アップロード先の署名付きURLを発行する」小さなリクエストだけを扱う。

export type SignedUploadResult =
  | { ok: true; storageKey: string; token: string }
  | { ok: false; error: string };

export async function createSignedUpload(storageKey: string, fileSize: number): Promise<SignedUploadResult> {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { ok: false, error: "ファイルを選択してください。" };
  }
  if (fileSize > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `ファイルサイズは${MAX_UPLOAD_BYTES / 1024 / 1024}MB以下にしてください（このファイル: ${formatMB(fileSize)}MB）。`,
    };
  }

  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient.storage.from("files").createSignedUploadUrl(storageKey);
  if (error || !data) {
    return { ok: false, error: `アップロードURLの発行に失敗しました: ${error?.message}` };
  }

  return { ok: true, storageKey, token: data.token };
}

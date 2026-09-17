import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type DeleteFileAssetResult = { ok: true } | { ok: false; error: string };

// file_assetsを、Storage実体の削除込みで完全に削除する（呼び出し元で所有権・削除可否の
// 検証を済ませてから呼ぶこと）。1イベントあたりの容量上限（checkEventStorageQuota）は
// file_assets.size_bytesの合計で判定するため、Storageを消さずにDB行（または紐付け行）
// だけ消しても容量は一切戻らない——このヘルパーを使わずに関連行だけ消す実装をしないこと。
// runStorageRetentionCleanup.tsと同じくdeleted_atによる論理削除とし、実体（バイト）のみ
// 物理削除する。
export async function deleteFileAsset(fileAssetId: string): Promise<DeleteFileAssetResult> {
  const serviceClient = createServiceRoleClient();

  const { data: fileAsset, error: fetchError } = await serviceClient
    .from("file_assets")
    .select("storage_key")
    .eq("id", fileAssetId)
    .is("deleted_at", null)
    .single();
  if (fetchError || !fileAsset) {
    return { ok: false, error: "ファイルが見つかりません。" };
  }

  if (fileAsset.storage_key) {
    const { error: storageError } = await serviceClient.storage.from("files").remove([fileAsset.storage_key]);
    if (storageError) {
      return { ok: false, error: `削除に失敗しました: ${storageError.message}` };
    }
  }

  const { error: updateError } = await serviceClient
    .from("file_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", fileAssetId);
  if (updateError) {
    return { ok: false, error: `削除に失敗しました: ${updateError.message}` };
  }

  return { ok: true };
}

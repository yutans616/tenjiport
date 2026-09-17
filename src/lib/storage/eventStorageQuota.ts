import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_EVENT_STORAGE_BYTES, formatMB } from "./uploadLimits";

export type QuotaCheckResult = { ok: true } | { ok: false; error: string };

// 1イベントあたりのファイル合計容量（file_assets.size_bytesの合計、削除済みを除く）が
// 上限を超えないことを、署名付きアップロードURL発行前に確認する。
export async function checkEventStorageQuota(eventId: string, additionalBytes: number): Promise<QuotaCheckResult> {
  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient
    .from("file_assets")
    .select("size_bytes")
    .eq("event_id", eventId)
    .is("deleted_at", null);
  if (error) {
    return { ok: false, error: `容量の確認に失敗しました: ${error.message}` };
  }

  const currentTotal = (data ?? []).reduce((sum, f) => sum + (f.size_bytes ?? 0), 0);
  if (currentTotal + additionalBytes > MAX_EVENT_STORAGE_BYTES) {
    return {
      ok: false,
      error: `このイベントのファイル合計容量の上限（${formatMB(MAX_EVENT_STORAGE_BYTES)}MB）に達しています。不要なファイルを削除してから再度お試しください。`,
    };
  }
  return { ok: true };
}

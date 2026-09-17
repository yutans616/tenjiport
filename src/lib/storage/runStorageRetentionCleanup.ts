import { createServiceRoleClient } from "@/lib/supabase/service-role";

// 終了から一定期間が経過したイベントの、法的保存義務のないファイル（出展社の提出物・
// 資料添付。請求書PDF等の'invoice_pdf'は消費税法等の帳簿書類保存義務があるため対象外）を
// Storageから削除し、file_assetsは実体を持たない記録として残す（deleted_atで論理削除。
// 物理削除しないのは、いつ・何が・どれだけ削除されたかの監査証跡を残すため）。
const RETENTION_YEARS = 2;
const DELETABLE_KINDS = ["announcement_attachment", "submission_attachment"] as const;
const STORAGE_REMOVE_CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function runStorageRetentionCleanup() {
  const serviceClient = createServiceRoleClient();

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);
  const cutoffDateString = cutoff.toISOString().slice(0, 10);

  const { data: expiredEvents } = await serviceClient
    .from("events")
    .select("id")
    .not("end_date", "is", null)
    .lt("end_date", cutoffDateString);
  const expiredEventIds = (expiredEvents ?? []).map((e) => e.id);

  if (expiredEventIds.length === 0) {
    return { eventsChecked: 0, filesDeleted: 0, bytesFreed: 0 };
  }

  const { data: targetFiles } = await serviceClient
    .from("file_assets")
    .select("id, storage_key, size_bytes")
    .in("event_id", expiredEventIds)
    .in("kind", DELETABLE_KINDS)
    .is("deleted_at", null);

  const files = targetFiles ?? [];
  if (files.length === 0) {
    return { eventsChecked: expiredEventIds.length, filesDeleted: 0, bytesFreed: 0 };
  }

  let bytesFreed = 0;
  let deletedCount = 0;

  for (const batch of chunk(files, STORAGE_REMOVE_CHUNK_SIZE)) {
    const storageKeys = batch.map((f) => f.storage_key).filter(Boolean);
    if (storageKeys.length > 0) {
      const { error: storageError } = await serviceClient.storage.from("files").remove(storageKeys);
      if (storageError) {
        console.error(`storage retention cleanup: failed to remove storage objects:`, storageError.message);
        continue; // このバッチのfile_assetsは論理削除せず、次回再試行に委ねる
      }
    }

    const batchIds = batch.map((f) => f.id);
    const { error: updateError } = await serviceClient
      .from("file_assets")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", batchIds);
    if (updateError) {
      console.error(`storage retention cleanup: failed to mark file_assets deleted:`, updateError.message);
      continue;
    }

    deletedCount += batch.length;
    bytesFreed += batch.reduce((sum, f) => sum + (f.size_bytes ?? 0), 0);
  }

  return { eventsChecked: expiredEventIds.length, filesDeleted: deletedCount, bytesFreed };
}

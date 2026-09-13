"use client";

import { createClient } from "@/lib/supabase/client";

// 署名付きURLへファイル本体を直接アップロードする（Server Actionを経由しないため、
// Vercelのサーバーレス関数のペイロード上限の影響を受けない）。
export async function uploadFileToSignedUrl(storageKey: string, token: string, file: File): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage
    .from("files")
    .uploadToSignedUrl(storageKey, token, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);
}

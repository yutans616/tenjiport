// Supabase Storageのキーに使えるのは英数字・アンダースコアと一部の記号のみで、
// 日本語などの非ASCII文字は "Invalid key" エラーになる（S3のキー制約をSupabase側で
// さらに厳格化しているため）。ここではキー用に安全な文字だけへ変換する。
// 元のファイル名自体は file_assets.filename に別途保存し、表示・ダウンロード時に使う。
const SAFE_CHAR = /[\w!\-.*'() &$@=;:+,?]/;

export function sanitizeStorageFilename(filename: string): string {
  let cleaned = "";
  for (const ch of filename) {
    cleaned += SAFE_CHAR.test(ch) ? ch : "_";
  }
  cleaned = cleaned.trim();
  return cleaned || "file";
}

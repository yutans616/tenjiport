// Supabase Storageのキーに含めるファイル名から、パス区切り・制御文字・URLで
// 特別な意味を持つ文字などキーを壊しうる文字を除去する。
export function sanitizeStorageFilename(filename: string): string {
  let cleaned = "";
  for (const ch of filename) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code <= 0x1f || code === 0x7f;
    const isUnsafe = isControl || ch === "/" || ch === "\\" || ch === "?" || ch === "#" || ch === "%";
    cleaned += isUnsafe ? "_" : ch;
  }
  cleaned = cleaned.trim();
  return cleaned || "file";
}

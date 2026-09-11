// 繰り返し入力フィールドの値（1行=1オブジェクトの配列）を、複数選択（文字列配列）と
// 区別して判定・表示用テキストに変換する。組織側の一覧・詳細・CSV・ZIP出力で共通利用する。
export function isRepeatingAnswerValue(value: unknown): value is Array<Record<string, unknown>> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => v !== null && typeof v === "object" && !Array.isArray(v))
  );
}

// jsonbはオブジェクトのキー順序を保持しない（挿入順とは異なる順序で返ることがある）ため、
// 値だけを並べると出展者が入力した項目と表示上の対応が崩れうる。「ラベル: 値」の形で
// 明示することで、キー順序に依存せず読める表示にする。
export function formatRepeatingAnswerValue(rows: Array<Record<string, unknown>>): string {
  return rows
    .map((row) =>
      Object.entries(row)
        .map(([k, v]) => {
          const text = String(v ?? "").trim();
          return text ? `${k}: ${text}` : null;
        })
        .filter((s): s is string => s !== null)
        .join("・"),
    )
    .filter(Boolean)
    .join(" / ");
}

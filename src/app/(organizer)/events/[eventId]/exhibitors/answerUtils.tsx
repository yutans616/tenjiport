import Link from "next/link";

// 価格付き選択肢は数量（quantities_json[field.key]）を伴うことがあるため、
// 「ラベル ×数量」の形で表示する（数量1の場合は数量を省略）。
function withQuantity(label: string, quantities?: Record<string, number>) {
  const qty = quantities?.[label];
  return qty && qty !== 1 ? `${label} ×${qty}` : label;
}

export function renderAnswerValue(value: unknown, quantities?: Record<string, number>) {
  if (Array.isArray(value)) return value.map((v) => withQuantity(String(v), quantities)).join("、");
  if (value && typeof value === "object" && "fileAssetId" in value) {
    const file = value as { fileAssetId: string; filename: string };
    return (
      <Link href={`/api/files/${file.fileAssetId}`} target="_blank" className="text-primary underline-offset-4 hover:underline">
        {file.filename}
      </Link>
    );
  }
  if (typeof value === "string") return withQuantity(value, quantities);
  return String(value ?? "");
}

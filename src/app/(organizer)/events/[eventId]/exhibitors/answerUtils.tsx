import Link from "next/link";

export function renderAnswerValue(value: unknown) {
  if (Array.isArray(value)) return value.join("、");
  if (value && typeof value === "object" && "fileAssetId" in value) {
    const file = value as { fileAssetId: string; filename: string };
    return (
      <Link href={`/api/files/${file.fileAssetId}`} target="_blank" className="text-primary underline-offset-4 hover:underline">
        {file.filename}
      </Link>
    );
  }
  return String(value ?? "");
}

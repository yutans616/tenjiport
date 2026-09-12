import JSZip from "jszip";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext } from "@/lib/organizer/context";
import { mapWithConcurrency } from "@/lib/concurrency";

// ロゴのDB参照・Storageダウンロードを並列化する際の同時実行数上限。
const DOWNLOAD_CONCURRENCY = 8;

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function sanitizeCell(value: unknown): string {
  let text = String(value ?? "");
  if (FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) text = `'${text}`;
  if (/[",\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function sanitizeFilenamePart(text: string): string {
  return text.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "brand";
}

// ブランド紹介CSV＋ロゴZIP。ファイルを束ねる際も1件ずつcan_access_file_assetで
// 再認可し、他社の非公開資料が誤って混入しないことを構造的に保証する。
export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await getOrganizerContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("organizer_organization_id", context.organizationId)
    .single();
  if (!event) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: participations } = await supabase
    .from("event_participations")
    .select(
      "id, status, exhibitor_profiles(brand_name, company_name, website, sns_links, description, default_contact_name, default_contact_email)",
    )
    .eq("event_id", eventId)
    .neq("status", "merged");

  const { data: versions } = await supabase
    .from("submission_versions")
    .select("event_participation_id, version_number, data_snapshot_json")
    .in("event_participation_id", (participations ?? []).map((p) => p.id))
    .order("version_number", { ascending: false });

  const latestAnswersByParticipation = new Map<string, Record<string, unknown>>();
  for (const v of versions ?? []) {
    if (!latestAnswersByParticipation.has(v.event_participation_id)) {
      latestAnswersByParticipation.set(v.event_participation_id, (v.data_snapshot_json as Record<string, unknown>) ?? {});
    }
  }

  const header = [
    "ブランド名",
    "会社名",
    "Webサイト",
    "Instagram",
    "Facebook（Meta）",
    "X（旧Twitter）",
    "YouTube",
    "紹介文",
    "担当者氏名",
    "担当者メールアドレス",
  ];
  const rows = (participations ?? []).map((p) => {
    const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
    const sns = (profile?.sns_links as Record<string, string> | null) ?? {};
    return [
      profile?.brand_name ?? "",
      profile?.company_name ?? "",
      profile?.website ?? "",
      sns.instagram ?? "",
      sns.facebook ?? "",
      sns.x ?? "",
      sns.youtube ?? "",
      profile?.description ?? "",
      profile?.default_contact_name ?? "",
      profile?.default_contact_email ?? "",
    ];
  });
  const csvLines = [header, ...rows].map((row) => row.map(sanitizeCell).join(","));
  const csv = "﻿" + csvLines.join("\r\n");

  const zip = new JSZip();
  zip.file("brands.csv", csv);

  const serviceClient = createServiceRoleClient();
  const usedFilenames = new Set<string>();

  // ロゴを持つ参加者を先に抽出し、DB参照・Storageダウンロードは並列で行う
  // （最大300社規模のイベントで1件ずつ直列に待つとタイムアウトの恐れがあるため）。
  // ZIPへの書き込み（ファイル名の重複解消）は並列処理の結果を元の順序で
  // 1件ずつ行い、決定的な結果になるようにする。
  const candidates = (participations ?? []).flatMap((p) => {
    const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
    const answers = latestAnswersByParticipation.get(p.id) ?? {};
    const logoAnswer = answers["logo_file"] as { fileAssetId?: string } | undefined;
    return logoAnswer?.fileAssetId ? [{ fileAssetId: logoAnswer.fileAssetId, brandName: profile?.brand_name ?? "" }] : [];
  });

  const downloads = await mapWithConcurrency(candidates, DOWNLOAD_CONCURRENCY, async (candidate) => {
    // 認可の再チェック：主催者は自組織のファイルにアクセス可能なはずだが、
    // ZIP同梱前に必ず個別確認してから取り込む（受け入れ条件：非公開資料の混入防止）。
    const { data: allowed } = await supabase.rpc("can_access_file_asset", { p_file_asset_id: candidate.fileAssetId });
    if (!allowed) return null;

    const { data: fileAsset } = await serviceClient
      .from("file_assets")
      .select("storage_key, filename, organizer_organization_id")
      .eq("id", candidate.fileAssetId)
      .single();
    if (!fileAsset || fileAsset.organizer_organization_id !== context.organizationId) return null;

    const { data: blob, error: downloadError } = await serviceClient.storage.from("files").download(fileAsset.storage_key);
    if (downloadError || !blob) return null;

    return { brandName: candidate.brandName, filename: fileAsset.filename, buffer: await blob.arrayBuffer() };
  });

  for (const result of downloads) {
    if (!result) continue;
    const ext = result.filename?.includes(".") ? result.filename.split(".").pop() : undefined;
    const baseName = sanitizeFilenamePart(result.brandName || "brand");
    let filename = ext ? `${baseName}.${ext}` : baseName;
    let suffix = 2;
    while (usedFilenames.has(filename)) {
      filename = ext ? `${baseName}-${suffix}.${ext}` : `${baseName}-${suffix}`;
      suffix += 1;
    }
    usedFilenames.add(filename);

    zip.file(`logos/${filename}`, result.buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="brand-kit_${eventId}.zip"`,
    },
  });
}

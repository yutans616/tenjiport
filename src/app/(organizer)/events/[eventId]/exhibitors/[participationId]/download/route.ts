import JSZip from "jszip";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext } from "@/lib/organizer/context";
import { isRepeatingAnswerValue, formatRepeatingAnswerValue } from "@/lib/forms/formatRepeatingAnswer";

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function sanitizeCell(value: unknown): string {
  let text = String(value ?? "");
  if (FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) text = `'${text}`;
  if (/[",\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function sanitizeFilenamePart(text: string): string {
  return text.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "exhibitor";
}

// 出展者1件分の提出内容CSV＋アップロード済みファイル一式をZIPでまとめてダウンロードする。
// ファイルは種類を問わず全ファイル項目を対象とし、同梱前に1件ずつcan_access_file_assetで再認可する。
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string; participationId: string }> },
) {
  const { eventId, participationId } = await params;
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

  const { data: participation } = await supabase
    .from("event_participations")
    .select("id, status, exhibitor_profiles(brand_name, company_name, website, sns_links, description, default_contact_name, default_contact_email, default_contact_phone)")
    .eq("id", participationId)
    .eq("event_id", eventId)
    .single();
  if (!participation) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const profile = Array.isArray(participation.exhibitor_profiles)
    ? participation.exhibitor_profiles[0]
    : participation.exhibitor_profiles;

  const { data: latestVersion } = await supabase
    .from("submission_versions")
    .select("id, version_number, data_snapshot_json, form_id, submitted_at")
    .eq("event_participation_id", participationId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const answers = (latestVersion?.data_snapshot_json as Record<string, unknown>) ?? {};

  let fieldLabelByKey = new Map<string, string>();
  if (latestVersion?.form_id) {
    const { data: sections } = await supabase.from("form_sections").select("id").eq("form_id", latestVersion.form_id);
    const { data: fields } = await supabase
      .from("form_fields")
      .select("key, label")
      .in("form_section_id", (sections ?? []).map((s) => s.id));
    fieldLabelByKey = new Map((fields ?? []).map((f) => [f.key, f.label]));
  }

  const sns = (profile?.sns_links as Record<string, string> | null) ?? {};
  const summaryRows: [string, string][] = [
    ["ブランド名", profile?.brand_name ?? ""],
    ["会社名", profile?.company_name ?? ""],
    ["Webサイト", profile?.website ?? ""],
    ["Instagram", sns.instagram ?? ""],
    ["Facebook（Meta）", sns.facebook ?? ""],
    ["X（旧Twitter）", sns.x ?? ""],
    ["YouTube", sns.youtube ?? ""],
    ["紹介文", profile?.description ?? ""],
    ["担当者氏名", profile?.default_contact_name ?? ""],
    ["担当者メールアドレス", profile?.default_contact_email ?? ""],
    ["担当者電話番号", profile?.default_contact_phone ?? ""],
    ["提出状態", participation.status],
  ];

  for (const [key, value] of Object.entries(answers)) {
    if (value && typeof value === "object" && "fileAssetId" in value) {
      const file = value as { filename?: string };
      summaryRows.push([fieldLabelByKey.get(key) ?? key, file.filename ?? ""]);
    } else {
      const formatted = isRepeatingAnswerValue(value)
        ? formatRepeatingAnswerValue(value)
        : Array.isArray(value)
          ? value.join("、")
          : String(value ?? "");
      summaryRows.push([fieldLabelByKey.get(key) ?? key, formatted]);
    }
  }

  const csvLines = summaryRows.map((row) => row.map(sanitizeCell).join(","));
  const csv = "﻿" + csvLines.join("\r\n");

  const zip = new JSZip();
  zip.file("info.csv", csv);

  const serviceClient = createServiceRoleClient();
  const usedFilenames = new Set<string>();

  for (const value of Object.values(answers)) {
    if (!value || typeof value !== "object" || !("fileAssetId" in value)) continue;
    const fileAssetId = (value as { fileAssetId?: string }).fileAssetId;
    if (!fileAssetId) continue;

    // 認可の再チェック：ZIP同梱前に必ず個別確認してから取り込む（他社ファイルの混入防止）。
    const { data: allowed } = await supabase.rpc("can_access_file_asset", { p_file_asset_id: fileAssetId });
    if (!allowed) continue;

    const { data: fileAsset } = await serviceClient
      .from("file_assets")
      .select("storage_key, filename, organizer_organization_id")
      .eq("id", fileAssetId)
      .single();
    if (!fileAsset || fileAsset.organizer_organization_id !== context.organizationId) continue;

    const { data: blob, error: downloadError } = await serviceClient.storage.from("files").download(fileAsset.storage_key);
    if (downloadError || !blob) continue;

    const ext = fileAsset.filename?.includes(".") ? fileAsset.filename.split(".").pop() : undefined;
    const baseName = sanitizeFilenamePart(fileAsset.filename?.replace(/\.[^.]+$/, "") || "file");
    let filename = ext ? `${baseName}.${ext}` : baseName;
    let suffix = 2;
    while (usedFilenames.has(filename)) {
      filename = ext ? `${baseName}-${suffix}.${ext}` : `${baseName}-${suffix}`;
      suffix += 1;
    }
    usedFilenames.add(filename);

    zip.file(`files/${filename}`, await blob.arrayBuffer());
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
  const zipName = sanitizeFilenamePart(profile?.brand_name || "exhibitor");

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}_${participationId.slice(0, 8)}.zip"`,
    },
  });
}

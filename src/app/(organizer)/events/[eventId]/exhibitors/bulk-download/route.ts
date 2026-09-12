import JSZip from "jszip";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext } from "@/lib/organizer/context";
import { isRepeatingAnswerValue, formatRepeatingAnswerValue } from "@/lib/forms/formatRepeatingAnswer";
import { mapWithConcurrency } from "@/lib/concurrency";

// 添付ファイルのDB参照・Storageダウンロードを並列化する際の同時実行数上限。
const DOWNLOAD_CONCURRENCY = 8;

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function sanitizeCell(value: unknown): string {
  let text = String(value ?? "");
  if (FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) text = `'${text}`;
  if (/[",\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function sanitizeFolderName(text: string, fallback: string): string {
  return text.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || fallback;
}

// チェックした複数出展者の提出内容CSV＋アップロード済みファイルを、出展者ごとのフォルダに
// 分けて1つのZIPにまとめる。単一出展者用のdownloadルートと同じ認可の考え方を踏襲する。
export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
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

  const formData = await request.formData();
  const participationIds = formData.getAll("participation_ids").map(String).filter(Boolean);
  if (participationIds.length === 0) {
    return NextResponse.json({ error: "no exhibitors selected" }, { status: 400 });
  }

  const { data: participations } = await supabase
    .from("event_participations")
    .select(
      "id, status, exhibitor_profiles(brand_name, company_name, website, sns_links, description, default_contact_name, default_contact_email, default_contact_phone)",
    )
    .eq("event_id", eventId)
    .in("id", participationIds);

  const { data: versions } = await supabase
    .from("submission_versions")
    .select("event_participation_id, version_number, data_snapshot_json, form_id")
    .in("event_participation_id", participationIds)
    .order("version_number", { ascending: false });

  const latestByParticipation = new Map<string, { data_snapshot_json: Record<string, unknown>; form_id: string }>();
  for (const v of versions ?? []) {
    if (!latestByParticipation.has(v.event_participation_id)) {
      latestByParticipation.set(v.event_participation_id, {
        data_snapshot_json: (v.data_snapshot_json as Record<string, unknown>) ?? {},
        form_id: v.form_id,
      });
    }
  }

  const formIds = Array.from(new Set(Array.from(latestByParticipation.values()).map((v) => v.form_id)));
  const fieldLabelByKey = new Map<string, string>();
  if (formIds.length > 0) {
    const { data: sections } = await supabase.from("form_sections").select("id").in("form_id", formIds);
    const { data: fields } = await supabase
      .from("form_fields")
      .select("key, label")
      .in("form_section_id", (sections ?? []).map((s) => s.id));
    for (const f of fields ?? []) fieldLabelByKey.set(f.key, f.label);
  }

  const zip = new JSZip();
  const serviceClient = createServiceRoleClient();
  const usedFolderNames = new Set<string>();
  // ファイルのDB参照・Storageダウンロードは後段でまとめて並列実行する
  // （最大300社規模のイベントで1件ずつ直列に待つとタイムアウトの恐れがあるため）。
  const downloadJobs: { folderName: string; fileAssetId: string }[] = [];

  for (const p of participations ?? []) {
    const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
    const submission = latestByParticipation.get(p.id);
    const answers = submission?.data_snapshot_json ?? {};

    let folderName = sanitizeFolderName(profile?.brand_name || "exhibitor", "exhibitor");
    let suffix = 2;
    while (usedFolderNames.has(folderName)) {
      folderName = `${sanitizeFolderName(profile?.brand_name || "exhibitor", "exhibitor")}-${suffix}`;
      suffix += 1;
    }
    usedFolderNames.add(folderName);

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
      ["提出状態", p.status],
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
    zip.file(`${folderName}/info.csv`, "﻿" + csvLines.join("\r\n"));

    for (const value of Object.values(answers)) {
      if (!value || typeof value !== "object" || !("fileAssetId" in value)) continue;
      const fileAssetId = (value as { fileAssetId?: string }).fileAssetId;
      if (!fileAssetId) continue;
      downloadJobs.push({ folderName, fileAssetId });
    }
  }

  const downloads = await mapWithConcurrency(downloadJobs, DOWNLOAD_CONCURRENCY, async (job) => {
    // 認可の再チェック：ZIP同梱前に必ず個別確認してから取り込む（他社ファイルの混入防止）。
    const { data: allowed } = await supabase.rpc("can_access_file_asset", { p_file_asset_id: job.fileAssetId });
    if (!allowed) return null;

    const { data: fileAsset } = await serviceClient
      .from("file_assets")
      .select("storage_key, filename, organizer_organization_id")
      .eq("id", job.fileAssetId)
      .single();
    if (!fileAsset || fileAsset.organizer_organization_id !== context.organizationId) return null;

    const { data: blob, error: downloadError } = await serviceClient.storage.from("files").download(fileAsset.storage_key);
    if (downloadError || !blob) return null;

    return { folderName: job.folderName, filename: fileAsset.filename, buffer: await blob.arrayBuffer() };
  });

  const usedFilenamesByFolder = new Map<string, Set<string>>();
  for (const result of downloads) {
    if (!result) continue;
    const usedFilenames = usedFilenamesByFolder.get(result.folderName) ?? new Set<string>();
    usedFilenamesByFolder.set(result.folderName, usedFilenames);

    const ext = result.filename?.includes(".") ? result.filename.split(".").pop() : undefined;
    const baseName = sanitizeFolderName(result.filename?.replace(/\.[^.]+$/, "") || "file", "file");
    let filename = ext ? `${baseName}.${ext}` : baseName;
    let fsuffix = 2;
    while (usedFilenames.has(filename)) {
      filename = ext ? `${baseName}-${fsuffix}.${ext}` : `${baseName}-${fsuffix}`;
      fsuffix += 1;
    }
    usedFilenames.add(filename);

    zip.file(`${result.folderName}/files/${filename}`, result.buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="exhibitors_${eventId}.zip"`,
    },
  });
}

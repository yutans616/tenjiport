import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { SECTION_TEMPLATES } from "../form/templates";
import { isRepeatingAnswerValue, formatRepeatingAnswerValue } from "@/lib/forms/formatRepeatingAnswer";

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

// テンプレート指定時は、対応するセクションテンプレートの予約キーだけに列を絞る。
// 未指定（all）の場合はフォーム全項目を出力する。
const TEMPLATE_KEY_FILTERS: Record<string, Set<string> | null> = {
  all: null,
  power: new Set(SECTION_TEMPLATES.power.fields.map((f) => f.key)),
  vehicle: new Set(SECTION_TEMPLATES.vehicle.fields.map((f) => f.key)),
  staff: new Set(SECTION_TEMPLATES.staff.fields.map((f) => f.key)),
};

function formatCellValue(value: unknown): string {
  if (isRepeatingAnswerValue(value)) return formatRepeatingAnswerValue(value);
  if (Array.isArray(value)) return value.join("、");
  if (value && typeof value === "object" && "filename" in value) {
    return String((value as { filename: unknown }).filename ?? "");
  }
  return String(value ?? "");
}

// CSVインジェクション対策：数式として解釈されうる先頭文字はシングルクォートでエスケープする
function sanitizeCell(value: unknown): string {
  let text = formatCellValue(value);
  if (FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) {
    text = `'${text}`;
  }
  // カンマ・改行・ダブルクォートを含む場合はCSVとして引用する
  if (/[",\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await getOrganizerContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const templateParam = request.nextUrl.searchParams.get("template") ?? "all";
  const keyFilter = TEMPLATE_KEY_FILTERS[templateParam] ?? null;
  if (!(templateParam in TEMPLATE_KEY_FILTERS)) {
    return NextResponse.json({ error: "unknown template" }, { status: 400 });
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

  const { data: form } = await supabase
    .from("forms")
    .select("id")
    .eq("event_id", eventId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  let orderedFieldKeys: { key: string; label: string }[] = [];
  if (form) {
    const { data: sections } = await supabase
      .from("form_sections")
      .select("id, order, form_fields(key, label, order)")
      .eq("form_id", form.id)
      .order("order", { ascending: true });

    orderedFieldKeys = (sections ?? [])
      .flatMap((s) =>
        (s.form_fields ?? [])
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((f) => ({ key: f.key, label: f.label })),
      )
      .filter((f) => !keyFilter || keyFilter.has(f.key));
  }

  const { data: participations } = await supabase
    .from("event_participations")
    .select("id, status, exhibitor_profiles(brand_name, company_name)")
    .eq("event_id", eventId)
    .neq("status", "merged");

  const { data: versions } = await supabase
    .from("submission_versions")
    .select("event_participation_id, version_number, data_snapshot_json")
    .in("event_participation_id", (participations ?? []).map((p) => p.id))
    .order("version_number", { ascending: false });

  const latestByParticipation = new Map<string, Record<string, unknown>>();
  for (const v of versions ?? []) {
    if (!latestByParticipation.has(v.event_participation_id)) {
      latestByParticipation.set(v.event_participation_id, (v.data_snapshot_json as Record<string, unknown>) ?? {});
    }
  }

  const header = ["ブランド名", "会社名", "状態", ...orderedFieldKeys.map((f) => f.label)];
  const rows = (participations ?? []).map((p) => {
    const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
    const answers = latestByParticipation.get(p.id) ?? {};
    return [
      profile?.brand_name ?? "",
      profile?.company_name ?? "",
      p.status,
      ...orderedFieldKeys.map((f) => answers[f.key]),
    ];
  });

  const csvLines = [header, ...rows].map((row) => row.map(sanitizeCell).join(","));
  const csv = "﻿" + csvLines.join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="exhibitors_${templateParam}_${eventId}.csv"`,
    },
  });
}

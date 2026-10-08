import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { extractPricedSelections, isPricedField } from "@/lib/forms/pricedSelections";

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

const STATUS_LABEL: Record<string, string> = {
  invited: "未提出",
  draft: "下書き",
  submitted: "提出済み",
  revision_requested: "修正依頼中",
  confirmed: "確認済み",
  cancelled: "キャンセル",
};

// 数値はそのまま出力する（未請求額のマイナス値を、CSVインジェクション対策で
// 文字列化してしまわないように）。文字列は数式として解釈されうる先頭文字をエスケープする。
function sanitizeCell(value: string | number | null | undefined): string {
  if (typeof value === "number") return String(value);
  let text = value ?? "";
  if (FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) text = `'${text}`;
  if (/[",\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function yen(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

// 料金が発生するデータを出展者ごとに1行で出力する：価格付きの選択項目（コマ・オプション品等）の
// 選択内容と小計、フォーム上の確定金額、発行済み請求書の金額・入金状況、未請求額。
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await getOrganizerContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id")
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

  type FieldRow = { key: string; label: string; type: string; order: number; options_json: unknown };
  let pricedFields: FieldRow[] = [];
  if (form) {
    const { data: sections } = await supabase
      .from("form_sections")
      .select("order, form_fields(key, label, type, order, options_json)")
      .eq("form_id", form.id)
      .order("order", { ascending: true });
    pricedFields = (sections ?? [])
      .flatMap((s) => ((s.form_fields ?? []) as FieldRow[]).slice().sort((a, b) => a.order - b.order))
      .filter(isPricedField);
  }

  const { data: participations } = await supabase
    .from("event_participations")
    .select(
      "id, status, resolved_price_yen, exhibitor_profiles(brand_name, company_name, default_contact_name, default_contact_email)",
    )
    .eq("event_id", eventId)
    .neq("status", "merged")
    .order("created_at", { ascending: true });
  const participationIds = (participations ?? []).map((p) => p.id);

  // 確定金額（resolved_price_yen）は提出時に計算されるため、品目も最新の「提出済み」版から復元する。
  const { data: versions } = await supabase
    .from("submission_versions")
    .select("event_participation_id, version_number, data_snapshot_json, quantities_json")
    .in("event_participation_id", participationIds)
    .neq("status", "draft")
    .order("version_number", { ascending: false });
  const latestByParticipation = new Map<string, { answers: Record<string, unknown>; quantities: Record<string, Record<string, number>> }>();
  for (const v of versions ?? []) {
    if (latestByParticipation.has(v.event_participation_id)) continue;
    latestByParticipation.set(v.event_participation_id, {
      answers: (v.data_snapshot_json as Record<string, unknown>) ?? {},
      quantities: (v.quantities_json as Record<string, Record<string, number>>) ?? {},
    });
  }

  const { data: invoices } = await supabase
    .from("exhibitor_invoices")
    .select("event_participation_id, invoice_number, amount_yen, due_date, payment_status, paid_at, invoice_ack_status, created_at")
    .in("event_participation_id", participationIds)
    .order("created_at", { ascending: true });
  const invoicesByParticipation = new Map<string, NonNullable<typeof invoices>>();
  for (const inv of invoices ?? []) {
    const list = invoicesByParticipation.get(inv.event_participation_id) ?? [];
    list.push(inv);
    invoicesByParticipation.set(inv.event_participation_id, list);
  }

  const header = [
    "ブランド名",
    "会社名",
    "担当者氏名",
    "担当者メールアドレス",
    "参加状態",
    ...pricedFields.flatMap((f) => [f.label, `${f.label} 小計`]),
    "確定金額（フォーム計算）",
    "請求書番号",
    "請求額合計",
    "未請求額",
    "入金済み額",
    "未入金額",
    "支払期限",
    "入金日",
    "請求書の確認",
  ];

  const rows = (participations ?? []).map((p) => {
    const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
    const latest = latestByParticipation.get(p.id);
    const selections = latest ? extractPricedSelections(pricedFields, latest.answers, latest.quantities) : [];
    const fieldCells = pricedFields.flatMap((f) => {
      const items = selections.filter((s) => s.fieldKey === f.key);
      if (items.length === 0) return ["", ""];
      return [
        items.map((s) => `${s.label}（${yen(s.priceYen)}×${s.quantity}）`).join("、"),
        items.reduce((sum, s) => sum + s.priceYen * s.quantity, 0),
      ];
    });

    const participantInvoices = invoicesByParticipation.get(p.id) ?? [];
    const invoicedTotal = participantInvoices.reduce((sum, i) => sum + i.amount_yen, 0);
    const paidTotal = participantInvoices.filter((i) => i.payment_status === "paid").reduce((sum, i) => sum + i.amount_yen, 0);
    const resolvedPrice = p.resolved_price_yen;
    const join = (values: (string | null | undefined)[]) => values.filter(Boolean).join("、");

    return [
      profile?.brand_name ?? "",
      profile?.company_name ?? "",
      profile?.default_contact_name ?? "",
      profile?.default_contact_email ?? "",
      STATUS_LABEL[p.status] ?? p.status,
      ...fieldCells,
      resolvedPrice ?? "",
      join(participantInvoices.map((i) => i.invoice_number)),
      participantInvoices.length > 0 ? invoicedTotal : "",
      resolvedPrice != null && p.status !== "cancelled" ? resolvedPrice - invoicedTotal : "",
      participantInvoices.length > 0 ? paidTotal : "",
      participantInvoices.length > 0 ? invoicedTotal - paidTotal : "",
      join(participantInvoices.map((i) => i.due_date)),
      join(participantInvoices.map((i) => (i.paid_at ? new Date(i.paid_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : null))),
      join(participantInvoices.map((i) => (i.invoice_ack_status === "confirmed" ? "確認済み" : "未確認"))),
    ];
  });

  const csv = "﻿" + [header, ...rows].map((row) => row.map(sanitizeCell).join(",")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="billing_${eventId}.csv"`,
    },
  });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { loadCrossEventData, loadScopeEvents } from "@/lib/organizer/crossEvent";

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];
const PARTICIPATION_LABEL: Record<string, string> = {
  invited: "未提出",
  draft: "下書き",
  submitted: "提出済み",
  revision_requested: "修正依頼中",
  confirmed: "確認済み",
  cancelled: "キャンセル",
};

function sanitizeCell(value: string | number): string {
  if (typeof value === "number") return String(value);
  let text = value;
  if (FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) text = `'${text}`;
  if (/[",\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

// 出展者（ブランド）ごとに1行。イベントごとの参加状態を列に展開し、請求の合計を付ける。
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const context = await getOrganizerContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const scope = await loadScopeEvents(supabase, context.organizationId, projectId);
  if (!scope) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { exhibitors } = await loadCrossEventData(supabase, scope.events);

  const header = [
    "ブランド名",
    "会社名",
    "担当者氏名",
    "担当者メールアドレス",
    "参加イベント数",
    ...scope.events.map((e) => e.name),
    "請求額合計",
    "入金済み額",
    "未入金額",
    "未請求額",
  ];
  const rows = exhibitors.map((ex) => [
    ex.brandName,
    ex.companyName,
    ex.contactName,
    ex.contactEmail,
    ex.participations.filter((p) => p.status !== "cancelled").length,
    ...scope.events.map((e) => {
      const p = ex.participations.find((x) => x.eventId === e.id);
      return p ? (PARTICIPATION_LABEL[p.status] ?? p.status) : "";
    }),
    ex.invoicedTotal,
    ex.paidTotal,
    ex.invoicedTotal - ex.paidTotal,
    ex.unbilledTotal,
  ]);

  const csv = "﻿" + [header, ...rows].map((row) => row.map(sanitizeCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cross_exhibitors_${projectId}.csv"`,
    },
  });
}

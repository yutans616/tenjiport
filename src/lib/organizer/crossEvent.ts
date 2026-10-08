import type { createClient } from "@/lib/supabase/server";
import { loadBillingStates, sumLineItems } from "@/lib/billing/exhibitorBilling";

export type CrossEvent = { id: string; name: string; status: string; start_date: string | null; end_date: string | null };

export type EventSummary = {
  event: CrossEvent;
  participantCount: number;
  submittedCount: number;
  resolvedTotal: number;
  invoicedTotal: number;
  paidTotal: number;
  unbilledTotal: number;
};

export type CrossExhibitor = {
  profileId: string;
  brandName: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  participations: { eventId: string; eventName: string; status: string; participationId: string }[];
  invoicedTotal: number;
  paidTotal: number;
  unbilledTotal: number;
};

const SUBMITTED_STATUSES = new Set(["submitted", "revision_requested", "confirmed"]);

// プロジェクト（または組織全体）に属するイベントを横断して、イベント別の集計と、
// 出展者（ブランド）単位の参加履歴・請求状況をまとめる。同じ出展者は複数イベントで
// 同じexhibitor_profileを使うため、プロフィール単位で名寄せする。
export async function loadCrossEventData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  events: CrossEvent[],
): Promise<{ summaries: EventSummary[]; exhibitors: CrossExhibitor[] }> {
  const eventIds = events.map((e) => e.id);
  if (eventIds.length === 0) return { summaries: [], exhibitors: [] };

  const { data: participations } = await supabase
    .from("event_participations")
    .select(
      "id, event_id, status, resolved_price_yen, exhibitor_profile_id, exhibitor_profiles(brand_name, company_name, default_contact_name, default_contact_email)",
    )
    .in("event_id", eventIds)
    .neq("status", "merged")
    .order("created_at", { ascending: true });
  const rows = participations ?? [];

  const { data: invoices } =
    rows.length > 0
      ? await supabase
          .from("exhibitor_invoices")
          .select("event_participation_id, amount_yen, payment_status")
          .in("event_participation_id", rows.map((p) => p.id))
      : { data: [] };
  const invoicedByParticipation = new Map<string, { invoiced: number; paid: number }>();
  for (const inv of invoices ?? []) {
    const current = invoicedByParticipation.get(inv.event_participation_id) ?? { invoiced: 0, paid: 0 };
    current.invoiced += inv.amount_yen;
    if (inv.payment_status === "paid") current.paid += inv.amount_yen;
    invoicedByParticipation.set(inv.event_participation_id, current);
  }

  const unbilledByParticipation = new Map<string, number>();
  for (const eventId of eventIds) {
    const active = rows.filter((p) => p.event_id === eventId && p.status !== "cancelled");
    const { states } = await loadBillingStates(supabase, eventId, active);
    for (const [pid, state] of states) unbilledByParticipation.set(pid, sumLineItems(state.unbilledItems));
  }

  const eventName = new Map(events.map((e) => [e.id, e.name]));
  const summaries: EventSummary[] = events.map((event) => {
    const eventRows = rows.filter((p) => p.event_id === event.id);
    const active = eventRows.filter((p) => p.status !== "cancelled");
    return {
      event,
      participantCount: active.length,
      submittedCount: active.filter((p) => SUBMITTED_STATUSES.has(p.status)).length,
      resolvedTotal: active.reduce((sum, p) => sum + (p.resolved_price_yen ?? 0), 0),
      invoicedTotal: eventRows.reduce((sum, p) => sum + (invoicedByParticipation.get(p.id)?.invoiced ?? 0), 0),
      paidTotal: eventRows.reduce((sum, p) => sum + (invoicedByParticipation.get(p.id)?.paid ?? 0), 0),
      unbilledTotal: active.reduce((sum, p) => sum + (unbilledByParticipation.get(p.id) ?? 0), 0),
    };
  });

  const byProfile = new Map<string, CrossExhibitor>();
  for (const p of rows) {
    const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
    const entry: CrossExhibitor = byProfile.get(p.exhibitor_profile_id) ?? {
      profileId: p.exhibitor_profile_id,
      brandName: profile?.brand_name ?? "（未設定）",
      companyName: profile?.company_name ?? "",
      contactName: profile?.default_contact_name ?? "",
      contactEmail: profile?.default_contact_email ?? "",
      participations: [],
      invoicedTotal: 0,
      paidTotal: 0,
      unbilledTotal: 0,
    };
    entry.participations.push({ eventId: p.event_id, eventName: eventName.get(p.event_id) ?? "", status: p.status, participationId: p.id });
    entry.invoicedTotal += invoicedByParticipation.get(p.id)?.invoiced ?? 0;
    entry.paidTotal += invoicedByParticipation.get(p.id)?.paid ?? 0;
    entry.unbilledTotal += unbilledByParticipation.get(p.id) ?? 0;
    byProfile.set(p.exhibitor_profile_id, entry);
  }

  const exhibitors = Array.from(byProfile.values()).sort(
    (a, b) => b.participations.length - a.participations.length || a.brandName.localeCompare(b.brandName, "ja"),
  );
  return { summaries, exhibitors };
}

// "all" は組織全体、"none" はプロジェクト未設定のイベント。
export async function loadScopeEvents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  scope: string,
): Promise<{ title: string; events: CrossEvent[] } | null> {
  let query = supabase
    .from("events")
    .select("id, name, status, start_date, end_date")
    .eq("organizer_organization_id", organizationId)
    .order("start_date", { ascending: true, nullsFirst: false });

  let title = "組織全体";
  if (scope === "none") {
    title = "未分類のイベント";
    query = query.is("project_id", null);
  } else if (scope !== "all") {
    const { data: project } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", scope)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!project) return null;
    title = project.name;
    query = query.eq("project_id", project.id);
  }

  const { data: events } = await query;
  return { title, events: events ?? [] };
}

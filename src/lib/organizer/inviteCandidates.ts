import type { createClient } from "@/lib/supabase/server";

export type InviteCandidate = {
  profileId: string;
  brandName: string;
  companyName: string;
  contactEmail: string;
  /** 提出まで進んだ参加の回数（招待のみ・キャンセル・統合は数えない）。 */
  participationCount: number;
  lastEventName: string;
  lastEventDate: string | null;
  projectIds: string[];
};

const PARTICIPATED_STATUSES = new Set(["submitted", "revision_requested", "confirmed"]);

// 同じ組織の他のイベントに参加したことがあり、対象イベントにまだ登録されていない出展者。
// 継続出展者を見つけやすいよう、参加回数の多い順（同数なら直近の参加が新しい順）に並べる。
export async function loadInviteCandidates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  targetEventId: string,
): Promise<InviteCandidate[]> {
  const { data: events } = await supabase
    .from("events")
    .select("id, name, start_date, end_date, created_at, project_id")
    .eq("organizer_organization_id", organizationId);
  const eventById = new Map((events ?? []).map((e) => [e.id, e]));
  const sourceEventIds = (events ?? []).map((e) => e.id).filter((id) => id !== targetEventId);
  if (sourceEventIds.length === 0) return [];

  const [{ data: participations }, { data: existing }] = await Promise.all([
    supabase
      .from("event_participations")
      .select("event_id, status, exhibitor_profile_id, exhibitor_profiles(brand_name, company_name, default_contact_email)")
      .in("event_id", sourceEventIds)
      .not("status", "in", "(merged,cancelled)"),
    supabase.from("event_participations").select("exhibitor_profile_id").eq("event_id", targetEventId),
  ]);
  const alreadyInTarget = new Set((existing ?? []).map((p) => p.exhibitor_profile_id));

  const eventSortKey = (eventId: string) => {
    const e = eventById.get(eventId);
    return e?.start_date ?? e?.end_date ?? e?.created_at ?? "";
  };

  const byProfile = new Map<string, InviteCandidate & { lastKey: string }>();
  for (const p of participations ?? []) {
    if (alreadyInTarget.has(p.exhibitor_profile_id)) continue;
    const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
    const event = eventById.get(p.event_id);
    const entry: InviteCandidate & { lastKey: string } = byProfile.get(p.exhibitor_profile_id) ?? {
      profileId: p.exhibitor_profile_id,
      brandName: profile?.brand_name ?? "（未設定）",
      companyName: profile?.company_name ?? "",
      contactEmail: profile?.default_contact_email ?? "",
      participationCount: 0,
      lastEventName: "",
      lastEventDate: null,
      projectIds: [],
      lastKey: "",
    };
    if (PARTICIPATED_STATUSES.has(p.status)) entry.participationCount++;
    const key = eventSortKey(p.event_id);
    if (key >= entry.lastKey) {
      entry.lastKey = key;
      entry.lastEventName = event?.name ?? "";
      entry.lastEventDate = event?.start_date ?? event?.end_date ?? null;
    }
    if (event?.project_id && !entry.projectIds.includes(event.project_id)) entry.projectIds.push(event.project_id);
    byProfile.set(p.exhibitor_profile_id, entry);
  }

  return Array.from(byProfile.values())
    .filter((c) => c.participationCount > 0 && c.brandName !== "未設定")
    .sort((a, b) => b.participationCount - a.participationCount || b.lastKey.localeCompare(a.lastKey))
    .map((c) => ({
      profileId: c.profileId,
      brandName: c.brandName,
      companyName: c.companyName,
      contactEmail: c.contactEmail,
      participationCount: c.participationCount,
      lastEventName: c.lastEventName,
      lastEventDate: c.lastEventDate,
      projectIds: c.projectIds,
    }));
}

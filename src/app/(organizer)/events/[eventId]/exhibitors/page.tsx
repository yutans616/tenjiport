import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { Button } from "@/components/ui/button";
import { ExhibitorTable, type ExhibitorRow } from "./ExhibitorTable";

export default async function ExhibitorsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("organizer_organization_id", context!.organizationId)
    .single();

  if (!event) notFound();

  const { data: participations } = await supabase
    .from("event_participations")
    .select("id, status, group_tags, created_at, exhibitor_profiles(brand_name, company_name)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  const participationIds = (participations ?? []).map((p) => p.id);

  // 請求書ステータス：参加者ごとに、いずれか未入金があれば「未入金」、全て入金済みなら「入金済み」、
  // 請求書が無ければ「未発行」として要約する。
  const invoiceStatusByParticipation = new Map<string, "unpaid" | "paid">();
  if (participationIds.length > 0) {
    const { data: invoices } = await supabase
      .from("exhibitor_invoices")
      .select("event_participation_id, payment_status")
      .in("event_participation_id", participationIds);
    for (const inv of invoices ?? []) {
      const current = invoiceStatusByParticipation.get(inv.event_participation_id);
      if (inv.payment_status !== "paid") {
        invoiceStatusByParticipation.set(inv.event_participation_id, "unpaid");
      } else if (current !== "unpaid") {
        invoiceStatusByParticipation.set(inv.event_participation_id, "paid");
      }
    }
  }

  // 資料ステータス：イベント内で公開済みの資料のうち、各参加者が対象となるものの総数と、
  // うち確認済みの件数を数える。
  const totalByParticipation = new Map<string, number>();
  const ackByParticipation = new Map<string, number>();
  if (participationIds.length > 0) {
    const { data: eventAnnouncements } = await supabase.from("announcements").select("id").eq("event_id", eventId);
    const announcementIds = (eventAnnouncements ?? []).map((a) => a.id);

    const { data: publishedVersions } =
      announcementIds.length > 0
        ? await supabase
            .from("announcement_versions")
            .select("id, announcement_audiences(audience_type, event_participation_ids)")
            .eq("status", "published")
            .in("announcement_id", announcementIds)
        : { data: [] };

    const versionIds: string[] = [];
    for (const v of publishedVersions ?? []) {
      versionIds.push(v.id);
      const audience = Array.isArray(v.announcement_audiences) ? v.announcement_audiences[0] : v.announcement_audiences;
      for (const pid of participationIds) {
        const applies =
          audience?.audience_type === "all" || (audience?.event_participation_ids ?? []).includes(pid);
        if (applies) {
          totalByParticipation.set(pid, (totalByParticipation.get(pid) ?? 0) + 1);
        }
      }
    }

    if (versionIds.length > 0) {
      const { data: acks } = await supabase
        .from("acknowledgements")
        .select("event_participation_id, announcement_version_id")
        .in("announcement_version_id", versionIds)
        .in("event_participation_id", participationIds);
      for (const a of acks ?? []) {
        ackByParticipation.set(a.event_participation_id, (ackByParticipation.get(a.event_participation_id) ?? 0) + 1);
      }
    }
  }

  const rows: ExhibitorRow[] = (participations ?? []).map((p) => {
    const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
    return {
      id: p.id,
      brandName: profile?.brand_name ?? "（未設定）",
      companyName: profile?.company_name ?? "",
      status: p.status,
      createdAt: p.created_at,
      invoiceStatus: invoiceStatusByParticipation.get(p.id) ?? "none",
      announcementTotal: totalByParticipation.get(p.id) ?? 0,
      announcementAcked: ackByParticipation.get(p.id) ?? 0,
    };
  });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">出展者一覧</h2>
        <Button
          variant="outline"
          render={
            <Link href={`/events/${eventId}/export`}>
              <Download />
              全件CSVでダウンロード
            </Link>
          }
        />
      </div>

      <ExhibitorTable eventId={eventId} rows={rows} />
    </div>
  );
}

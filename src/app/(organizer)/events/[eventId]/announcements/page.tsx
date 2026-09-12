import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AnnouncementsPage({
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

  // announcementsとannouncement_versionsの間にはFKが2本ある
  // （versions側のannouncement_id、announcements側のcurrent_version_id）ため、
  // 全バージョンを取得したい場合はannouncement_id経由の関係を明示する必要がある。
  const { data: announcements } = await supabase
    .from("announcements")
    .select(
      "id, created_at, current_version_id, requires_submission, submission_due_date, announcement_versions!announcement_versions_announcement_id_fkey(id, title, status, published_at, version_number)",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  const today = new Date().toISOString().slice(0, 10);

  // 対象・確認率の算出（公開済みバージョンのみ。下書きには対象読者・確認状況が存在しないため対象外）。
  // イベントダッシュボード（events/[eventId]/page.tsx）と同じ「all/individualの対象解決 + 確認済み集計」の
  // ロジックを、一覧の行単位に適用する。
  const { data: participations } = await supabase.from("event_participations").select("id, status").eq("event_id", eventId);
  const activeParticipationIds = (participations ?? [])
    .filter((p) => p.status !== "cancelled" && p.status !== "merged")
    .map((p) => p.id);
  const activeIdSet = new Set(activeParticipationIds);

  const publishedVersionIds = (announcements ?? [])
    .flatMap((a) => (Array.isArray(a.announcement_versions) ? a.announcement_versions : [a.announcement_versions]))
    .filter((v): v is NonNullable<typeof v> => !!v && v.status === "published")
    .map((v) => v.id);

  const audienceByVersion = new Map<string, { audience_type: string; event_participation_ids: string[] | null }>();
  const ackedByVersion = new Map<string, Set<string>>();
  if (publishedVersionIds.length > 0) {
    const { data: audiences } = await supabase
      .from("announcement_audiences")
      .select("announcement_version_id, audience_type, event_participation_ids")
      .in("announcement_version_id", publishedVersionIds);
    for (const a of audiences ?? []) {
      audienceByVersion.set(a.announcement_version_id, a);
    }
    const { data: acks } = await supabase
      .from("acknowledgements")
      .select("announcement_version_id, event_participation_id")
      .in("announcement_version_id", publishedVersionIds);
    for (const a of acks ?? []) {
      if (!ackedByVersion.has(a.announcement_version_id)) ackedByVersion.set(a.announcement_version_id, new Set());
      ackedByVersion.get(a.announcement_version_id)!.add(a.event_participation_id);
    }
  }

  function resolveAudienceAndAckRate(versionId: string): { audienceLabel: string; ackRateLabel: string } {
    const audience = audienceByVersion.get(versionId);
    if (!audience) return { audienceLabel: "-", ackRateLabel: "-" };
    const recipients =
      audience.audience_type === "all"
        ? activeParticipationIds
        : (audience.event_participation_ids ?? []).filter((id) => activeIdSet.has(id));
    const acked = ackedByVersion.get(versionId) ?? new Set();
    const ackedCount = recipients.filter((id) => acked.has(id)).length;
    const audienceLabel = audience.audience_type === "all" ? `全員（${recipients.length}社）` : `個別（${recipients.length}社）`;
    const ackRateLabel = recipients.length > 0 ? `${ackedCount}/${recipients.length}社確認` : "対象者なし";
    return { audienceLabel, ackRateLabel };
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">資料</h2>
        <Button
          render={
            <Link href={`/events/${eventId}/announcements/new`}>
              <Plus />
              新規作成
            </Link>
          }
        />
      </div>

      {!announcements || announcements.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">まだ資料がありません。</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {announcements.map((a) => {
            const versions = Array.isArray(a.announcement_versions) ? a.announcement_versions : [a.announcement_versions];
            const latest = versions.filter(Boolean).sort((x, y) => y!.version_number - x!.version_number)[0];
            if (!latest) return null;
            const { audienceLabel, ackRateLabel } = resolveAudienceAndAckRate(latest.id);
            return (
              <Link key={a.id} href={`/events/${eventId}/announcements/${latest.id}`}>
                <Card className="transition-colors hover:border-primary/40 hover:bg-accent/40">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{latest.title}</p>
                      <p className="text-sm text-muted-foreground">
                        v{latest.version_number}
                        {latest.published_at ? ` ・ 公開: ${new Date(latest.published_at).toLocaleString("ja-JP")}` : ""}
                      </p>
                      {latest.status === "published" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          対象: {audienceLabel} ・ 確認状況: {ackRateLabel}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {a.requires_submission && a.submission_due_date && (
                        <Badge variant={a.submission_due_date < today ? "destructive" : "outline"}>
                          提出期限: {new Date(a.submission_due_date).toLocaleDateString("ja-JP")}
                        </Badge>
                      )}
                      <Badge variant={latest.status === "published" ? "default" : "outline"}>
                        {latest.status === "published" ? "公開中" : "下書き"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

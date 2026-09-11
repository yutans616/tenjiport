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

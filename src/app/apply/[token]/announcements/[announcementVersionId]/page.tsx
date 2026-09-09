import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acknowledgeAnnouncement } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MyAnnouncementRow } from "@/lib/notifications/types";

export default async function ExhibitorAnnouncementDetailPage({
  params,
}: {
  params: Promise<{ token: string; announcementVersionId: string }>;
}) {
  const { token, announcementVersionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/apply/${token}`);

  const { data: event } = await supabase.from("events").select("id, name").eq("public_form_token", token).maybeSingle();
  if (!event) redirect(`/apply/${token}`);

  const { data: announcements } = await supabase.rpc("get_my_announcements", { p_event_id: event.id });
  const announcement = (announcements as MyAnnouncementRow[] | null)?.find(
    (a) => a.announcement_version_id === announcementVersionId,
  );
  if (!announcement) notFound();

  const attachments = announcement.attachments ?? [];
  const acknowledgeWithIds = acknowledgeAnnouncement.bind(null, token, announcementVersionId);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-1 flex-col gap-6 p-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {announcement.title}
            {announcement.acknowledged_at && <Badge variant="secondary">確認済み</Badge>}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {announcement.published_at ? new Date(announcement.published_at).toLocaleString("ja-JP") : ""}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="whitespace-pre-wrap text-sm">{announcement.body}</p>

          {attachments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">添付ファイル</p>
              {attachments.map((att) => (
                <a
                  key={att.file_asset_id}
                  href={`/api/files/${att.file_asset_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  ダウンロード（{att.content_type}）
                </a>
              ))}
            </div>
          )}

          {!announcement.acknowledged_at && (
            <form action={acknowledgeWithIds}>
              <Button type="submit">確認しました</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

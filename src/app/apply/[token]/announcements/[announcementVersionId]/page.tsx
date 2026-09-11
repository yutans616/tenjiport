import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acknowledgeAnnouncement, deleteAnnouncementSubmission, uploadAnnouncementSubmission } from "../actions";
import { SubmitButton } from "@/components/organizer/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MyAnnouncementRow } from "@/lib/notifications/types";
import { SubmissionUploadManager } from "./SubmissionUploadManager";

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
  const submissions = (announcement.submissions ?? []).map((s) => ({
    id: s.id,
    fileId: s.file_asset_id,
    filename: s.filename ?? s.file_asset_id,
  }));
  const acknowledgeWithIds = acknowledgeAnnouncement.bind(null, token, announcementVersionId);
  const uploadWithIds = uploadAnnouncementSubmission.bind(null, token, announcementVersionId);
  const deleteWithIds = deleteAnnouncementSubmission.bind(null, token, announcementVersionId);

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
                  ダウンロード（{att.filename ?? att.content_type}）
                </a>
              ))}
            </div>
          )}

          {announcement.requires_submission && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">提出物</p>
                {announcement.submission_due_date && (
                  <p
                    className={`text-xs ${
                      submissions.length === 0 && announcement.submission_due_date < new Date().toISOString().slice(0, 10)
                        ? "font-medium text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    提出期限: {new Date(announcement.submission_due_date).toLocaleDateString("ja-JP")}
                    {submissions.length === 0 && announcement.submission_due_date < new Date().toISOString().slice(0, 10)
                      ? "（期限超過）"
                      : ""}
                  </p>
                )}
              </div>
              <SubmissionUploadManager submissions={submissions} uploadAction={uploadWithIds} deleteAction={deleteWithIds} />
            </div>
          )}

          {!announcement.acknowledged_at && (
            <form action={acknowledgeWithIds}>
              <SubmitButton pendingText="処理中...">確認しました</SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

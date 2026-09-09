import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import {
  deleteAttachment,
  processNotificationsNowAction,
  publishAnnouncementAction,
  resendAnnouncementAction,
  uploadAttachment,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AttachmentManager } from "./AttachmentManager";
import { SuccessBanner } from "@/components/organizer/success-banner";

export default async function AnnouncementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; announcementVersionId: string }>;
  searchParams: Promise<{ done?: string; count?: string }>;
}) {
  const { eventId, announcementVersionId } = await params;
  const { done, count } = await searchParams;
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

  const { data: version } = await supabase
    .from("announcement_versions")
    .select("id, title, body, status, version_number, published_at, announcement_id")
    .eq("id", announcementVersionId)
    .single();
  if (!version) notFound();

  const { data: attachments } = await supabase
    .from("announcement_attachments")
    .select("id, file_assets(id, filename, content_type)")
    .eq("announcement_version_id", announcementVersionId);

  let audienceParticipationIds: string[] | null = null;
  const { data: audience } = await supabase
    .from("announcement_audiences")
    .select("audience_type, event_participation_ids")
    .eq("announcement_version_id", announcementVersionId)
    .single();

  let recipients: { id: string; brand_name: string | null }[] = [];
  if (audience?.audience_type === "all") {
    const { data } = await supabase
      .from("event_participations")
      .select("id, exhibitor_profiles(brand_name)")
      .eq("event_id", eventId)
      .not("status", "in", "(cancelled,merged)");
    recipients = (data ?? []).map((p) => {
      const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
      return { id: p.id, brand_name: profile?.brand_name ?? null };
    });
  } else if (audience?.audience_type === "individual") {
    audienceParticipationIds = audience.event_participation_ids ?? [];
    const { data } = await supabase
      .from("event_participations")
      .select("id, exhibitor_profiles(brand_name)")
      .in("id", audienceParticipationIds ?? []);
    recipients = (data ?? []).map((p) => {
      const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
      return { id: p.id, brand_name: profile?.brand_name ?? null };
    });
  }

  const { data: acks } = version.status === "published"
    ? await supabase
        .from("acknowledgements")
        .select("event_participation_id, acknowledged_at")
        .eq("announcement_version_id", announcementVersionId)
    : { data: [] };
  const ackByParticipation = new Map((acks ?? []).map((a) => [a.event_participation_id, a.acknowledged_at]));

  const { data: deliveries } = version.status === "published"
    ? await supabase
        .from("notification_deliveries")
        .select("event_participation_id, status, error_message, attempt_count")
        .eq("related_entity_type", "announcement_version")
        .eq("related_entity_id", announcementVersionId)
    : { data: [] };
  const deliveryByParticipation = new Map((deliveries ?? []).map((d) => [d.event_participation_id, d]));

  const failedCount = (deliveries ?? []).filter((d) => d.status === "failed").length;
  const uploadAttachmentWithIds = uploadAttachment.bind(null, eventId, announcementVersionId);
  const deleteAttachmentWithIds = deleteAttachment.bind(null, eventId, announcementVersionId);
  const attachmentList = (attachments ?? []).map((att) => {
    const file = Array.isArray(att.file_assets) ? att.file_assets[0] : att.file_assets;
    return { id: att.id, fileId: file?.id ?? "", filename: file?.filename ?? file?.id ?? "" };
  });
  const canPublish = attachmentList.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <SuccessBanner done={done} count={count} />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {version.title}
            <Badge variant="outline" className="font-normal">
              v{version.version_number}
            </Badge>
            <Badge variant={version.status === "published" ? "default" : "outline"}>
              {version.status === "published" ? "公開中" : "下書き"}
            </Badge>
          </CardTitle>
          {version.status === "draft" && (
            <form action={publishAnnouncementAction.bind(null, eventId, announcementVersionId)}>
              <Button type="submit" disabled={!canPublish} title={canPublish ? undefined : "添付ファイルを1件以上追加してください"}>
                公開して通知
              </Button>
            </form>
          )}
          {version.status === "published" && (
            <div className="flex gap-2">
              <form action={resendAnnouncementAction.bind(null, eventId, announcementVersionId)}>
                <Button type="submit" variant="outline">
                  未確認者へ再通知
                </Button>
              </form>
              <form action={processNotificationsNowAction.bind(null, eventId, announcementVersionId)}>
                <Button type="submit" variant="ghost" className="text-muted-foreground">
                  送信処理を実行
                </Button>
              </form>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="whitespace-pre-wrap text-sm">{version.body}</p>
          {failedCount > 0 && <p className="text-sm text-destructive">送信失敗: {failedCount}件</p>}
          {version.status === "draft" && !canPublish && (
            <p className="text-xs text-muted-foreground">公開するには、下の「添付ファイル」を1件以上追加してください。</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">添付ファイル</CardTitle>
        </CardHeader>
        <CardContent>
          <AttachmentManager
            attachments={attachmentList}
            canEdit={version.status === "draft"}
            uploadAction={uploadAttachmentWithIds}
            deleteAction={deleteAttachmentWithIds}
          />
        </CardContent>
      </Card>

      {version.status === "published" && (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>出展者</TableHead>
                <TableHead>送信状況</TableHead>
                <TableHead className="text-right">確認状況</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((r) => {
                const delivery = deliveryByParticipation.get(r.id);
                const ackAt = ackByParticipation.get(r.id);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.brand_name ?? "（未設定）"}</TableCell>
                    <TableCell>
                      {delivery?.status === "sent" && <Badge variant="secondary">送信済み</Badge>}
                      {delivery?.status === "pending" && <Badge variant="outline">送信待ち</Badge>}
                      {delivery?.status === "failed" && <Badge variant="destructive">失敗</Badge>}
                      {!delivery && <Badge variant="outline">-</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {ackAt ? (
                        <span className="text-sm text-muted-foreground">
                          確認済み（{new Date(ackAt).toLocaleString("ja-JP")}）
                        </span>
                      ) : (
                        <Badge variant="outline">未確認</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import {
  addUsageCorrectionAction,
  cancelParticipationAction,
  cancelRevisionRequestAction,
  confirmSubmissionAction,
  requestRevisionAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Download, FileUp } from "lucide-react";
import { renderAnswerValue } from "../answerUtils";
import { OrganizerNoteCell } from "../OrganizerNoteCell";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "下書き", variant: "outline" },
  submitted: { label: "提出済み", variant: "default" },
  revision_requested: { label: "修正依頼中", variant: "destructive" },
  confirmed: { label: "確認済み", variant: "secondary" },
};

export default async function ExhibitorDetailPage({
  params,
}: {
  params: Promise<{ eventId: string; participationId: string }>;
}) {
  const { eventId, participationId } = await params;
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

  const { data: participation } = await supabase
    .from("event_participations")
    .select(
      "id, status, resolved_price_yen, organizer_note, cancelled_at, cancelled_reason, exhibitor_profiles(brand_name, company_name, default_contact_email)",
    )
    .eq("id", participationId)
    .eq("event_id", eventId)
    .single();
  if (!participation) notFound();

  const { data: invoices } = await supabase
    .from("exhibitor_invoices")
    .select("id, amount_yen, payment_status, created_at")
    .eq("event_participation_id", participationId)
    .order("created_at", { ascending: false });
  const latestInvoice = invoices?.[0];
  const priceMismatch =
    participation.resolved_price_yen != null && latestInvoice != null && latestInvoice.amount_yen !== participation.resolved_price_yen;

  const profile = Array.isArray(participation.exhibitor_profiles)
    ? participation.exhibitor_profiles[0]
    : participation.exhibitor_profiles;

  const { data: versions } = await supabase
    .from("submission_versions")
    .select("id, version_number, status, data_snapshot_json, quantities_json, submitted_at, form_id")
    .eq("event_participation_id", participationId)
    .order("version_number", { ascending: false });

  const latest = versions?.[0];
  const latestQuantities = (latest?.quantities_json as Record<string, Record<string, number>>) ?? {};

  let fieldLabelByKey = new Map<string, string>();
  if (latest) {
    const { data: sections } = await supabase.from("form_sections").select("id").eq("form_id", latest.form_id);
    const { data: fields } = await supabase
      .from("form_fields")
      .select("key, label")
      .in("form_section_id", (sections ?? []).map((s) => s.id));
    fieldLabelByKey = new Map((fields ?? []).map((f) => [f.key, f.label]));
  }

  const { data: revisionRequests } = await supabase
    .from("revision_requests")
    .select("id, comment, requested_at, resolved_at")
    .in("submission_version_id", (versions ?? []).map((v) => v.id))
    .order("requested_at", { ascending: false });

  const requestRevisionWithIds = latest
    ? requestRevisionAction.bind(null, eventId, participationId, latest.id)
    : null;

  const { data: ledgerRows } = await supabase
    .from("usage_ledger")
    .select("id, entry_type, quantity, amount_yen, reason, created_at")
    .eq("event_participation_id", participationId)
    .order("created_at", { ascending: true });
  const netBillable = (ledgerRows ?? []).reduce((sum, r) => sum + r.quantity, 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{profile?.brand_name ?? "（未設定）"}</h1>
          <p className="text-sm text-muted-foreground">{profile?.company_name}</p>
          <p className="text-sm text-muted-foreground">{profile?.default_contact_email}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            render={
              <a href={`/events/${eventId}/announcements/new?participationId=${participationId}`}>
                <FileUp />
                資料を依頼する
              </a>
            }
          />
          <Button
            variant="outline"
            size="sm"
            render={
              <a href={`/events/${eventId}/exhibitors/${participationId}/download`}>
                <Download />
                このデータをダウンロード
              </a>
            }
          />
        </div>
      </div>

      {participation.resolved_price_yen != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">コマ・オプション料金（フォームの選択内容から自動計算）</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-lg font-semibold">¥{participation.resolved_price_yen.toLocaleString("ja-JP")}</p>
            {priceMismatch && latestInvoice && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
                選択内容の金額（¥{participation.resolved_price_yen.toLocaleString("ja-JP")}）と、発行済みの請求書（¥
                {latestInvoice.amount_yen.toLocaleString("ja-JP")}）の金額が一致しません。出展者が再提出で選択内容を変更した可能性があります。必要であれば請求書側で「内容を訂正する」から金額を修正してください。
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">備考（主催者専用メモ・出展者には表示されません）</CardTitle>
        </CardHeader>
        <CardContent>
          <OrganizerNoteCell
            eventId={eventId}
            participationId={participationId}
            initialNote={participation.organizer_note}
            rows={3}
            compact={false}
          />
        </CardContent>
      </Card>

      {participation.status !== "merged" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">参加のキャンセル</CardTitle>
          </CardHeader>
          <CardContent>
            {participation.status === "cancelled" ? (
              <p className="text-sm text-muted-foreground">
                この出展者はキャンセルされています（
                {participation.cancelled_at ? new Date(participation.cancelled_at).toLocaleString("ja-JP") : ""}
                ）。理由：{participation.cancelled_reason}
              </p>
            ) : (
              <form action={cancelParticipationAction.bind(null, eventId, participationId)} className="flex flex-col gap-2">
                {latestInvoice && (
                  <p className="text-xs text-muted-foreground">
                    既に請求書が発行されています。必要に応じて個別にご対応ください。
                  </p>
                )}
                <Textarea name="reason" required rows={2} placeholder="キャンセル理由（例：出展辞退の申し出）" />
                <Button type="submit" variant="destructive" className="self-start">
                  この出展者をキャンセルする
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {ledgerRows && ledgerRows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">課金状況</CardTitle>
            <Badge variant={netBillable > 0 ? "default" : "outline"}>
              {netBillable > 0 ? "課金対象" : "課金対象外（訂正済み）"}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {ledgerRows.map((r) => (
                <li key={r.id}>
                  {new Date(r.created_at).toLocaleDateString("ja-JP")} —{" "}
                  {r.entry_type === "billable_participation" ? "課金計上" : "訂正"}（{r.quantity > 0 ? "+" : ""}
                  {r.quantity}）{r.reason ? `：${r.reason}` : ""}
                </li>
              ))}
            </ul>
            {netBillable > 0 && (
              <form action={addUsageCorrectionAction.bind(null, eventId, participationId)} className="flex flex-col gap-2">
                <Textarea name="reason" required rows={2} placeholder="訂正理由（例：重複登録、テスト登録）" />
                <Button type="submit" variant="outline" className="self-start">
                  課金対象から除外する（訂正）
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {!latest ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">まだ提出がありません。</CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                最新の提出内容
                <Badge variant="outline" className="font-normal">
                  v{latest.version_number}
                </Badge>
                <Badge variant={STATUS_LABEL[latest.status]?.variant ?? "outline"}>
                  {STATUS_LABEL[latest.status]?.label ?? latest.status}
                </Badge>
              </CardTitle>
              {latest.status === "submitted" && (
                <form action={confirmSubmissionAction.bind(null, eventId, participationId, latest.id)}>
                  <Button type="submit" size="sm">
                    確認済みにする
                  </Button>
                </form>
              )}
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-sm">
                {Object.entries((latest.data_snapshot_json as Record<string, unknown>) ?? {}).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4 border-b py-1.5 last:border-0">
                    <dt className="text-muted-foreground">{fieldLabelByKey.get(key) ?? key}</dt>
                    <dd className="text-right">{renderAnswerValue(value, latestQuantities[key])}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          {(latest.status === "submitted" || latest.status === "confirmed") && requestRevisionWithIds && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">修正を依頼する</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={requestRevisionWithIds} className="flex flex-col gap-3">
                  <Textarea name="comment" required rows={3} placeholder="修正してほしい内容を記入してください" />
                  <Button type="submit" className="self-start">
                    修正依頼を送信
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {latest.status === "revision_requested" && (
            <Card>
              <CardContent className="flex items-center justify-between gap-4 py-3">
                <p className="text-xs text-muted-foreground">
                  修正依頼を送信済みのため、出展者からの再提出をお待ちください。再提出されると、ここから改めて修正を依頼できます。取り消すと提出済みの状態に戻ります（送信済みの通知メール自体は取り消せません）。
                </p>
                <form action={cancelRevisionRequestAction.bind(null, eventId, participationId, latest.id)}>
                  <Button type="submit" variant="outline" size="sm" className="shrink-0">
                    修正依頼を取り消す
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {revisionRequests && revisionRequests.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">修正依頼の履歴</h2>
              {revisionRequests.map((r) => (
                <Card key={r.id}>
                  <CardContent className="py-3 text-sm">
                    <p>{r.comment}</p>
                    <p className="text-xs text-muted-foreground">{new Date(r.requested_at).toLocaleString("ja-JP")}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">提出版の履歴</h2>
            <Card>
              <CardContent className="flex flex-col gap-1.5 py-3 text-sm">
                {versions?.map((v) => (
                  <p key={v.id} className="text-muted-foreground">
                    v{v.version_number} — {STATUS_LABEL[v.status]?.label ?? v.status}
                    {v.submitted_at ? `（${new Date(v.submitted_at).toLocaleString("ja-JP")}）` : ""}
                  </p>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

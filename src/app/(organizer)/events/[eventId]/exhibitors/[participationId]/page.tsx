import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { addUsageCorrectionAction, confirmSubmissionAction, requestRevisionAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Download } from "lucide-react";
import Link from "next/link";

function renderAnswerValue(value: unknown) {
  if (Array.isArray(value)) return value.join("、");
  if (value && typeof value === "object" && "fileAssetId" in value) {
    const file = value as { fileAssetId: string; filename: string };
    return (
      <Link href={`/api/files/${file.fileAssetId}`} target="_blank" className="text-primary underline-offset-4 hover:underline">
        {file.filename}
      </Link>
    );
  }
  return String(value ?? "");
}

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
    .select("id, status, exhibitor_profiles(brand_name, company_name, default_contact_email)")
    .eq("id", participationId)
    .eq("event_id", eventId)
    .single();
  if (!participation) notFound();

  const profile = Array.isArray(participation.exhibitor_profiles)
    ? participation.exhibitor_profiles[0]
    : participation.exhibitor_profiles;

  const { data: versions } = await supabase
    .from("submission_versions")
    .select("id, version_number, status, data_snapshot_json, submitted_at, form_id")
    .eq("event_participation_id", participationId)
    .order("version_number", { ascending: false });

  const latest = versions?.[0];

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
                    <dd className="text-right">{renderAnswerValue(value)}</dd>
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

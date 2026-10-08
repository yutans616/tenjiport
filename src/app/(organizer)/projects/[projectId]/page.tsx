import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Download, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { loadCrossEventData, loadScopeEvents } from "@/lib/organizer/crossEvent";
import { formatYen } from "@/lib/billing/exhibitorBilling";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PARTICIPATION_LABEL: Record<string, string> = {
  invited: "未提出",
  draft: "下書き",
  submitted: "提出済み",
  revision_requested: "修正依頼中",
  confirmed: "確認済み",
  cancelled: "キャンセル",
};
const EVENT_STATUS_LABEL: Record<string, string> = { draft: "下書き", open: "公開中", closed: "終了", archived: "アーカイブ" };

export default async function ProjectCrossViewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const supabase = await createClient();
  const scope = await loadScopeEvents(supabase, context.organizationId, projectId);
  if (!scope) notFound();
  const { summaries, exhibitors } = await loadCrossEventData(supabase, scope.events);

  const totals = summaries.reduce(
    (acc, s) => ({
      participantCount: acc.participantCount + s.participantCount,
      resolvedTotal: acc.resolvedTotal + s.resolvedTotal,
      invoicedTotal: acc.invoicedTotal + s.invoicedTotal,
      paidTotal: acc.paidTotal + s.paidTotal,
      unbilledTotal: acc.unbilledTotal + s.unbilledTotal,
    }),
    { participantCount: 0, resolvedTotal: 0, invoicedTotal: 0, paidTotal: 0, unbilledTotal: 0 },
  );
  const repeatCount = exhibitors.filter((e) => e.participations.length > 1).length;
  const isRealProject = projectId !== "all" && projectId !== "none";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <Link href="/projects" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          プロジェクト一覧
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{scope.title}</h1>
          <div className="flex gap-2">
            {isRealProject && (
              <Button
                variant="outline"
                render={
                  <Link href={`/events/new?project=${projectId}`}>
                    <Plus />
                    このプロジェクトにイベントを作成
                  </Link>
                }
              />
            )}
            {exhibitors.length > 0 && (
              <Button
                variant="outline"
                render={
                  <Link href={`/projects/${projectId}/export`}>
                    <Download />
                    出展者の横断一覧CSV
                  </Link>
                }
              />
            )}
          </div>
        </div>
      </div>

      {scope.events.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            このプロジェクトにはまだイベントがありません。イベントの概要ページでプロジェクトを設定するか、新しく作成してください。
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">イベント別の状況（{scope.events.length}件）</h2>
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>イベント</TableHead>
                      <TableHead className="text-right">出展者</TableHead>
                      <TableHead className="text-right">提出済み</TableHead>
                      <TableHead className="text-right">確定金額</TableHead>
                      <TableHead className="text-right">請求額</TableHead>
                      <TableHead className="text-right">入金済み</TableHead>
                      <TableHead className="text-right">未入金</TableHead>
                      <TableHead className="text-right">未請求</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaries.map((s) => (
                      <TableRow key={s.event.id}>
                        <TableCell>
                          <Link href={`/events/${s.event.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                            {s.event.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {EVENT_STATUS_LABEL[s.event.status] ?? s.event.status}
                            {s.event.start_date ? ` ・ ${s.event.start_date}〜${s.event.end_date ?? ""}` : ""}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">{s.participantCount}</TableCell>
                        <TableCell className="text-right">{s.submittedCount}</TableCell>
                        <TableCell className="text-right">{formatYen(s.resolvedTotal)}</TableCell>
                        <TableCell className="text-right">{formatYen(s.invoicedTotal)}</TableCell>
                        <TableCell className="text-right">{formatYen(s.paidTotal)}</TableCell>
                        <TableCell className="text-right">{formatYen(s.invoicedTotal - s.paidTotal)}</TableCell>
                        <TableCell className="text-right">{formatYen(s.unbilledTotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {summaries.length > 1 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell>合計</TableCell>
                        <TableCell className="text-right">{totals.participantCount}</TableCell>
                        <TableCell />
                        <TableCell className="text-right">{formatYen(totals.resolvedTotal)}</TableCell>
                        <TableCell className="text-right">{formatYen(totals.invoicedTotal)}</TableCell>
                        <TableCell className="text-right">{formatYen(totals.paidTotal)}</TableCell>
                        <TableCell className="text-right">{formatYen(totals.invoicedTotal - totals.paidTotal)}</TableCell>
                        <TableCell className="text-right">{formatYen(totals.unbilledTotal)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </CardContent>
            </Card>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              出展者の横断一覧（{exhibitors.length}社
              {repeatCount > 0 ? ` ・ うち複数イベントに参加 ${repeatCount}社` : ""}）
            </h2>
            {exhibitors.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">まだ出展者がいません。</CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ブランド・会社</TableHead>
                        <TableHead>担当者</TableHead>
                        <TableHead>参加イベント</TableHead>
                        <TableHead className="text-right">請求額</TableHead>
                        <TableHead className="text-right">未入金</TableHead>
                        <TableHead className="text-right">未請求</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exhibitors.map((ex) => (
                        <TableRow key={ex.profileId}>
                          <TableCell>
                            <p className="font-medium">{ex.brandName}</p>
                            {ex.companyName && ex.companyName !== ex.brandName && (
                              <p className="text-xs text-muted-foreground">{ex.companyName}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <p>{ex.contactName}</p>
                            <p className="text-xs text-muted-foreground">{ex.contactEmail}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {ex.participations.map((p) => (
                                <Link
                                  key={p.participationId}
                                  href={`/events/${p.eventId}/exhibitors/${p.participationId}`}
                                  className="flex items-center gap-2 text-sm hover:underline"
                                >
                                  {p.eventName}
                                  <Badge variant="outline" className="font-normal">
                                    {PARTICIPATION_LABEL[p.status] ?? p.status}
                                  </Badge>
                                </Link>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{formatYen(ex.invoicedTotal)}</TableCell>
                          <TableCell className="text-right">{formatYen(ex.invoicedTotal - ex.paidTotal)}</TableCell>
                          <TableCell className="text-right">{formatYen(ex.unbilledTotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}

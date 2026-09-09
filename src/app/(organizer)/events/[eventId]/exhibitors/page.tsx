import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  invited: { label: "未提出", variant: "outline" },
  draft: { label: "下書き", variant: "outline" },
  submitted: { label: "提出済み", variant: "default" },
  revision_requested: { label: "修正依頼中", variant: "destructive" },
  confirmed: { label: "確認済み", variant: "secondary" },
  cancelled: { label: "キャンセル", variant: "outline" },
  merged: { label: "統合済み", variant: "outline" },
};

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

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">出展者一覧</h2>
        <Button
          variant="outline"
          render={
            <Link href={`/events/${eventId}/export`}>
              <Download />
              CSVでダウンロード
            </Link>
          }
        />
      </div>

      {!participations || participations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">まだ提出がありません。</CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ブランド名</TableHead>
                <TableHead>会社名</TableHead>
                <TableHead>状態</TableHead>
                <TableHead className="text-right">個別データ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participations.map((p) => {
                const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
                const status = STATUS_LABEL[p.status] ?? { label: p.status, variant: "outline" as const };
                return (
                  <TableRow key={p.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/events/${eventId}/exhibitors/${p.id}`} className="block">
                        {profile?.brand_name ?? "（未設定）"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <Link href={`/events/${eventId}/exhibitors/${p.id}`} className="block">
                        {profile?.company_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <a
                        href={`/events/${eventId}/exhibitors/${p.id}/download`}
                        className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                      >
                        <Download className="size-3.5" />
                        ダウンロード
                      </a>
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

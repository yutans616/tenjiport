import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function InvoicesPage({
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

  const { data: participationRows } = await supabase
    .from("event_participations")
    .select("id, exhibitor_profiles(brand_name)")
    .eq("event_id", eventId);
  const brandByParticipation = new Map(
    (participationRows ?? []).map((p) => {
      const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
      return [p.id, profile?.brand_name ?? "（未設定）"];
    }),
  );

  const { data: invoices } = await supabase
    .from("exhibitor_invoices")
    .select("id, event_participation_id, amount_yen, due_date, invoice_ack_status, payment_status, created_at")
    .in("event_participation_id", (participationRows ?? []).map((p) => p.id))
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">請求書</h2>
        <Button
          render={
            <Link href={`/events/${eventId}/invoices/new`}>
              <Plus />
              新規作成
            </Link>
          }
        />
      </div>

      {!invoices || invoices.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">まだ請求書がありません。</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {invoices.map((inv) => (
            <Link key={inv.id} href={`/events/${eventId}/invoices/${inv.id}`}>
              <Card className="transition-colors hover:border-primary/40 hover:bg-accent/40">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{brandByParticipation.get(inv.event_participation_id)}</p>
                    <p className="text-sm text-muted-foreground">
                      ¥{inv.amount_yen.toLocaleString("ja-JP")}
                      {inv.due_date ? ` ・ 期限: ${inv.due_date}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={inv.invoice_ack_status === "confirmed" ? "secondary" : "outline"}>
                      {inv.invoice_ack_status === "confirmed" ? "確認済み" : "未確認"}
                    </Badge>
                    <Badge variant={inv.payment_status === "paid" ? "default" : "outline"}>
                      {inv.payment_status === "paid" ? "入金済み" : "未入金"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

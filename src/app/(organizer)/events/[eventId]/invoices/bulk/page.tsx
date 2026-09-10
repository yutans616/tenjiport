import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { createInvoicesBulkAction } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BulkInvoicePreview, type BulkInvoiceRow } from "./BulkInvoicePreview";

export default async function BulkInvoicesPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");
  if (context.role !== "owner" && context.role !== "admin") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4">
        <p className="text-sm text-muted-foreground">請求書の一括発行はオーナー・管理者のみ利用できます。</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("organizer_organization_id", context.organizationId)
    .single();
  if (!event) notFound();

  const { data: participations } = await supabase
    .from("event_participations")
    .select("id, resolved_price_yen, exhibitor_profiles(brand_name)")
    .eq("event_id", eventId)
    .not("status", "in", "(cancelled,merged)");

  const participationIds = (participations ?? []).map((p) => p.id);
  const { data: existingInvoices } =
    participationIds.length > 0
      ? await supabase.from("exhibitor_invoices").select("event_participation_id").in("event_participation_id", participationIds)
      : { data: [] };
  const hasInvoiceSet = new Set((existingInvoices ?? []).map((i) => i.event_participation_id));

  const rows: BulkInvoiceRow[] = (participations ?? []).map((p) => {
    const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
    return {
      id: p.id,
      brandName: profile?.brand_name ?? "（未設定）",
      resolvedPriceYen: p.resolved_price_yen,
      hasInvoice: hasInvoiceSet.has(p.id),
    };
  });

  const createInvoicesBulkWithId = createInvoicesBulkAction.bind(null, eventId);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">請求書を一括発行</h1>
      <p className="text-sm text-muted-foreground">
        フォームの選択内容から自動計算された金額（コマ料金等）に基づいて発行します。金額が未設定、または既に請求書が発行済みの出展者は対象外です。
      </p>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">出展者がいません。</CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">発行内容</CardTitle>
          </CardHeader>
          <CardContent>
            <BulkInvoicePreview rows={rows} action={createInvoicesBulkWithId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

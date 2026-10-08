import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { RESIDUAL_KEY, loadBillingStates } from "@/lib/billing/exhibitorBilling";
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
    .not("status", "in", "(cancelled,merged)")
    .order("created_at", { ascending: true });

  const { pricedFields, states } = await loadBillingStates(supabase, eventId, participations ?? []);

  const rows: BulkInvoiceRow[] = (participations ?? []).map((p) => {
    const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
    const state = states.get(p.id)!;
    return {
      id: p.id,
      brandName: profile?.brand_name ?? "（未設定）",
      unbilledItems: state.unbilledItems,
      invoicedTotal: state.invoicedTotal,
      hasUnitemizedInvoice: state.hasUnitemizedInvoice,
      hasManualInvoice: state.hasManualInvoice,
      hasPrice: state.currentItems.length > 0,
    };
  });

  const fieldOptions = pricedFields.map((f) => ({ key: f.key, label: f.label }));
  if (rows.some((r) => r.unbilledItems.some((i) => i.field_key === RESIDUAL_KEY))) {
    fieldOptions.push({ key: RESIDUAL_KEY, label: pricedFields.length > 0 ? "その他（確定金額との差額）" : "出展料" });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">請求書を一括発行</h1>
      <p className="text-sm text-muted-foreground">
        フォームの選択内容（ブース・オプション品など）のうち、まだ請求していない品目をまとめて請求します。既に請求書がある出展者にも、未請求の品目があれば追加の請求書を発行します。「請求する項目」で、出展料だけ先に請求し、オプション品は後から請求する、といった使い分けができます。
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
            <BulkInvoicePreview rows={rows} fieldOptions={fieldOptions} action={createInvoicesBulkAction.bind(null, eventId)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

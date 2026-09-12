import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function yen(n: number) {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

export default async function AdminOverviewPage() {
  const admin = createServiceRoleClient();

  const { count: totalOrgCount } = await admin
    .from("organizer_organizations")
    .select("id", { count: "exact", head: true });

  const { data: activeContracts } = await admin
    .from("service_contracts")
    .select("plan_type")
    .eq("status", "active");
  const activeStandardCount = (activeContracts ?? []).filter((c) => c.plan_type === "standard").length;
  const activeAnnualCount = (activeContracts ?? []).filter((c) => c.plan_type === "annual").length;

  // 年間プランは実際の課金（Stripe決済・service_invoices行の作成）がまだ実装されて
  // いないため、以下の売上・リピート率・LTVはすべて通常プランの実績のみを反映する。
  const { data: chargedInvoices } = await admin
    .from("service_invoices")
    .select("organizer_organization_id, charge_kind, total_amount_yen, refunded_amount_yen, charged_at")
    .not("charged_at", "is", null);

  const rows = chargedInvoices ?? [];
  const netAmount = (r: { total_amount_yen: number; refunded_amount_yen: number }) => r.total_amount_yen - r.refunded_amount_yen;

  const lifetimeRevenue = rows.reduce((sum, r) => sum + netAmount(r), 0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const thisMonthRevenue = rows
    .filter((r) => new Date(r.charged_at!) >= startOfMonth)
    .reduce((sum, r) => sum + netAmount(r), 0);

  const payingOrgIds = new Set(rows.map((r) => r.organizer_organization_id));
  const payingOrgCount = payingOrgIds.size;
  const averageLtv = payingOrgCount > 0 ? lifetimeRevenue / payingOrgCount : 0;

  const baseFeeCountByOrg = new Map<string, number>();
  for (const r of rows) {
    if (r.charge_kind !== "base_fee") continue;
    baseFeeCountByOrg.set(r.organizer_organization_id, (baseFeeCountByOrg.get(r.organizer_organization_id) ?? 0) + 1);
  }
  const orgsWithBaseFee = baseFeeCountByOrg.size;
  const repeatOrgs = Array.from(baseFeeCountByOrg.values()).filter((c) => c >= 2).length;
  const repeatRate = orgsWithBaseFee > 0 ? (repeatOrgs / orgsWithBaseFee) * 100 : 0;

  const { data: uncollectibleInvoices } = await admin
    .from("service_invoices")
    .select("total_amount_yen, refunded_amount_yen")
    .eq("status", "uncollectible");
  const uncollectibleOutstanding = (uncollectibleInvoices ?? []).reduce((sum, r) => sum + netAmount(r), 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">概要</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          いずれも簡易的な指標です。年間プランは実際の課金機能が未実装のため、売上・リピート率・LTVは通常プランの実績のみを反映しています。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">組織数（累計）</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totalOrgCount ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">アクティブ契約（通常）</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{activeStandardCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">アクティブ契約（年間）</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{activeAnnualCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">今月の売上（純額）</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{yen(thisMonthRevenue)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">累計売上（純額）</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{yen(lifetimeRevenue)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">簡易LTV（組織あたり）</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{yen(averageLtv)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">リピート率</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {repeatRate.toFixed(0)}%
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({repeatOrgs}/{orgsWithBaseFee}組織)
            </span>
          </CardContent>
        </Card>
        <Card className={uncollectibleOutstanding > 0 ? "border-destructive/40" : undefined}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">自動リトライ停止中の未回収額</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{yen(uncollectibleOutstanding)}</CardContent>
        </Card>
      </div>
    </div>
  );
}

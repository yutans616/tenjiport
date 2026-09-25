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

  // 年間プランはクレカ払いを選んだ契約のみ実際の課金（service_invoices行・Stripe決済）が
  // 発生する（請求書払いを選んだ契約はアプリ外の手動運用のため反映されない）。
  // charge_kindを問わず charged_at が入っている行を素直に合算しているため、
  // 年間プランのクレカ課金分もリピート率を除き自動的に含まれる。
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

  // 営業LP（/demo）の計測。GA4と並行して自社DB（demo_analytics_events）にも
  // 記録しているため、GA4未設定でもここで即座に集計できる（tenjiport_demo_lp_spec.md 8章）。
  // ローリング30日ではなく、営業メール配信キャンペーンの開始日（JST基準）を固定の起点にする
  // （開発・検証中に発生したノイズを含めないため、既存データはクリーンアップ済み）。
  // 新しいキャンペーンを開始したら、この2行を更新すること。
  const CAMPAIGN_START_DATE_JST = "2026-09-25";
  const CAMPAIGN_START_DISPLAY = "2026年9月25日";
  const campaignStartUtc = new Date(`${CAMPAIGN_START_DATE_JST}T00:00:00+09:00`).toISOString();
  const { data: recentDemoEvents } = await admin
    .from("demo_analytics_events")
    .select("event_type")
    .gte("created_at", campaignStartUtc);
  const countByType = (type: string) => (recentDemoEvents ?? []).filter((e) => e.event_type === type).length;
  const demoLpViews = countByType("demo_lp_view");
  const demoStartClicks = countByType("demo_start_click");
  const demoStartRate = demoLpViews > 0 ? (demoStartClicks / demoLpViews) * 100 : 0;
  const documentViewClicks = countByType("document_view_click") + countByType("document_download_click");
  const bookingOpenClicks = countByType("booking_open_click");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">概要</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          いずれも簡易的な指標です。年間プランのうち請求書払いを選んだ契約（アプリ外の手動運用）の金額は含まれません。リピート率は通常プランの実績のみを反映しています。
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

      <div>
        <h2 className="text-base font-semibold tracking-tight">
          営業LP（/demo）の計測（{CAMPAIGN_START_DISPLAY}の配信開始〜）
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          GA4と並行して自社DBにも記録した実績です。予約クリック等は「操作した」事実のみで、予約確定や利用開始そのものを意味しません。
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">LP表示回数</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{demoLpViews}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">デモ開始クリック数</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{demoStartClicks}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">デモ開始率</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {demoStartRate.toFixed(0)}%
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({demoStartClicks}/{demoLpViews})
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">資料閲覧・DLクリック数</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{documentViewClicks}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">導入相談クリック数</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{bookingOpenClicks}</CardContent>
        </Card>
      </div>
    </div>
  );
}

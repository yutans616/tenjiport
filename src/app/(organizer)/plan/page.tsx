import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import {
  changeToAnnualPlanAction,
  changeToStandardPlanAction,
  startAnnualPlanAction,
  startStandardPlanAction,
} from "./actions";
import { startCardRegistration } from "./stripe-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type AnnualPlanUsageRow = {
  service_contract_id: string;
  annual_fee_yen: number;
  participant_cap_per_event: number;
  event_count_cap: number | null;
  events_used_count: number;
  event_id: string;
  event_name: string;
  event_billable_count: number;
  is_over_participant_cap: boolean;
};

export default async function PlanPage() {
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizer_organizations")
    .select("annual_plan_offer_config_id")
    .eq("id", context.organizationId)
    .single();
  let annualOffer: { annual_fee_yen: number; participant_cap_per_event: number; event_count_cap: number | null } | null = null;
  if (org?.annual_plan_offer_config_id) {
    const { data } = await supabase
      .from("annual_plan_configs")
      .select("annual_fee_yen, participant_cap_per_event, event_count_cap")
      .eq("id", org.annual_plan_offer_config_id)
      .single();
    annualOffer = data;
  }

  const { data: contract } = await supabase
    .from("service_contracts")
    .select("id, plan_type, status, payment_method_status, started_at, pricing_config_id, annual_plan_config_id")
    .eq("organizer_organization_id", context.organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (!contract) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
        <h1 className="text-xl font-semibold tracking-tight">プラン・課金</h1>
        <p className="text-sm text-muted-foreground">
          現在、有効な契約はありません。イベント数・出展者数の見込みに応じてプランをお選びください。
        </p>
        <div className={`grid gap-4 ${annualOffer ? "sm:grid-cols-2" : ""}`}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">通常プラン</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">出展者数に応じた従量課金。30社まで9,800円、以降1社300円（テスト価格）。</p>
              <p className="text-xs text-muted-foreground">開始後、お支払い方法の登録が必須です（登録時に課金は発生しません）。</p>
              <form action={startStandardPlanAction}>
                <Button type="submit">通常プランを開始する</Button>
              </form>
            </CardContent>
          </Card>
          {annualOffer && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">年間プラン（ご案内）</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  年額¥{annualOffer.annual_fee_yen.toLocaleString("ja-JP")}
                  ・1開催あたり{annualOffer.participant_cap_per_event}社まで
                  {annualOffer.event_count_cap ? `・年間${annualOffer.event_count_cap}開催まで` : "・開催数上限なし"}
                  。従量課金は発生しません。
                </p>
                <form action={startAnnualPlanAction}>
                  <Button type="submit" variant="outline">
                    年間プランを開始する
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
        <p className="text-xs text-muted-foreground">※通常プランの価格は未確定のためテスト設定値です。本番課金は価格確定後に反映します。</p>
      </div>
    );
  }

  if (contract.plan_type === "annual") {
    const { data: annualConfig } = await supabase
      .from("annual_plan_configs")
      .select("annual_fee_yen, participant_cap_per_event, event_count_cap, cap_definition_note")
      .eq("id", contract.annual_plan_config_id)
      .single();
    const { data: usage } = await supabase.rpc("get_annual_plan_usage", { p_org_id: context.organizationId });
    const usageRows = (usage as AnnualPlanUsageRow[] | null) ?? [];
    const overCapEvents = usageRows.filter((u) => u.is_over_participant_cap);
    const eventsUsedCount = usageRows[0]?.events_used_count ?? 0;

    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
        <h1 className="text-xl font-semibold tracking-tight">プラン・課金</h1>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">年間プラン</CardTitle>
            <Badge>契約中</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between border-b py-1.5">
                <dt className="text-muted-foreground">年額</dt>
                <dd>¥{(annualConfig?.annual_fee_yen ?? 0).toLocaleString("ja-JP")}</dd>
              </div>
              <div className="flex justify-between border-b py-1.5">
                <dt className="text-muted-foreground">1開催あたりの上限</dt>
                <dd>{annualConfig?.participant_cap_per_event ?? "-"}社</dd>
              </div>
              <div className="flex justify-between py-1.5">
                <dt className="text-muted-foreground">年間開催数</dt>
                <dd>
                  {eventsUsedCount}開催
                  {annualConfig?.event_count_cap ? ` / 上限${annualConfig.event_count_cap}開催` : "（上限なし）"}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              従量課金は発生しません。上限を超えても出展者の入力・提出は継続できます。
            </p>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground">
                カード登録: {contract.payment_method_status === "valid" ? "登録済み" : "未登録"}
              </p>
              {contract.payment_method_status !== "valid" && (
                <form action={startCardRegistration}>
                  <Button type="submit" size="sm" variant="outline">
                    カードを登録する
                  </Button>
                </form>
              )}
            </div>
            <form action={changeToStandardPlanAction}>
              <Button type="submit" variant="ghost" size="sm" className="self-start text-muted-foreground">
                通常プランに切り替える
              </Button>
            </form>
          </CardContent>
        </Card>

        {overCapEvents.length > 0 && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base text-destructive">上限を超えているイベントがあります</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                出展者の入力・提出は引き続き可能です。上位プランへの変更をご検討ください。
              </p>
              {overCapEvents.map((e) => (
                <p key={e.event_id} className="text-sm">
                  {e.event_name} — {e.event_billable_count}社（上限{annualConfig?.participant_cap_per_event}社）
                </p>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const { data: pricing } = await supabase
    .from("pricing_configs")
    .select("base_fee_yen, included_participants, overage_unit_yen, is_test")
    .eq("id", contract.pricing_config_id)
    .single();

  // 課金はイベント単位（終了日を起点に自動確定）のため、ここでは「まだ請求が
  // 確定していないイベント」ごとに、現時点の参加社数から見込み金額を計算して表示する。
  const { data: pendingUsage } = await supabase
    .from("usage_ledger")
    .select("event_id, quantity, events(name)")
    .eq("service_contract_id", contract.id)
    .is("billed_in_invoice_id", null);

  const pendingByEvent = new Map<string, { name: string; count: number }>();
  for (const row of pendingUsage ?? []) {
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    const existing = pendingByEvent.get(row.event_id) ?? { name: event?.name ?? "（不明なイベント）", count: 0 };
    existing.count += row.quantity;
    pendingByEvent.set(row.event_id, existing);
  }
  const pendingEstimates = Array.from(pendingByEvent.entries()).map(([eventId, v]) => {
    const overageCount = Math.max(v.count - (pricing?.included_participants ?? 0), 0);
    const overageAmount = overageCount * (pricing?.overage_unit_yen ?? 0);
    const total = (pricing?.base_fee_yen ?? 0) + overageAmount;
    return { eventId, name: v.name, count: v.count, overageCount, total };
  });

  const INVOICE_STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    draft: { label: "下書き", variant: "outline" },
    finalized: { label: "課金待ち", variant: "outline" },
    charged: { label: "課金済み", variant: "secondary" },
    failed: { label: "課金失敗", variant: "destructive" },
    refunded: { label: "返金済み", variant: "outline" },
  };

  const { data: invoices } = await supabase
    .from("service_invoices")
    .select("id, event_id, total_amount_yen, status, created_at, events(name)")
    .eq("service_contract_id", contract.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">プラン・課金</h1>

      {contract.payment_method_status !== "valid" && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">お支払い方法の登録が必須です</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              通常プランのご利用には、お支払い方法の登録が必須です。登録が完了するまで、このページ以外の機能はご利用いただけません（カード登録時に課金は発生しません。実際の請求はイベント終了日を起点に自動で行われます）。
            </p>
            <form action={startCardRegistration}>
              <Button type="submit" className="self-start">
                カードを登録する
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">通常プラン</CardTitle>
          <div className="flex gap-2">
            <Badge>契約中</Badge>
            {pricing?.is_test && <Badge variant="outline">テスト価格</Badge>}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            料金はイベントごとに、そのイベント終了日を起点として自動的に確定・課金されます（基本料金¥
            {(pricing?.base_fee_yen ?? 0).toLocaleString("ja-JP")}／{pricing?.included_participants ?? 30}社まで、以降1社¥
            {pricing?.overage_unit_yen ?? 0}）。
          </p>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              カード登録: {contract.payment_method_status === "valid" ? "登録済み" : "未登録"}
            </p>
            {contract.payment_method_status !== "valid" && (
              <form action={startCardRegistration}>
                <Button type="submit" size="sm" variant="outline">
                  カードを登録する
                </Button>
              </form>
            )}
          </div>
          {annualOffer && (
            <form action={changeToAnnualPlanAction}>
              <Button type="submit" variant="ghost" size="sm" className="self-start text-muted-foreground">
                年間プランに切り替える（年額¥{annualOffer.annual_fee_yen.toLocaleString("ja-JP")}のご案内）
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {pendingEstimates.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">開催中のイベント（見込み金額）</h2>
          {pendingEstimates.map((e) => (
            <Card key={e.eventId}>
              <CardContent className="flex items-center justify-between py-3 text-sm">
                <span>{e.name}</span>
                <span className="text-muted-foreground">{e.count}社</span>
                <span className="font-medium">¥{e.total.toLocaleString("ja-JP")}</span>
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground">イベント終了日を過ぎると自動的に金額が確定し、課金されます。</p>
        </div>
      )}

      {invoices && invoices.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">請求履歴</h2>
          {invoices.map((inv) => {
            const event = Array.isArray(inv.events) ? inv.events[0] : inv.events;
            const statusInfo = INVOICE_STATUS_LABEL[inv.status] ?? { label: inv.status, variant: "outline" as const };
            return (
              <Card key={inv.id}>
                <CardContent className="flex items-center justify-between py-3 text-sm">
                  <span className="text-muted-foreground">{event?.name ?? "（不明なイベント）"}</span>
                  <span className="font-medium">¥{inv.total_amount_yen.toLocaleString("ja-JP")}</span>
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

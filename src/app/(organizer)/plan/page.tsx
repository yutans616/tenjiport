import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import {
  changeToAnnualPlanAction,
  changeToStandardPlanAction,
  retryServiceInvoiceAction,
  startAnnualPlanAction,
  startStandardPlanAction,
} from "./actions";
import { startCardRegistration } from "./stripe-actions";
import { SubmitButton } from "@/components/organizer/submit-button";
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

const BILLING_ERROR_MESSAGE: Record<string, string> = {
  charge_failed: "基本料金のお支払いに失敗したため、イベントの作成を中止しました。カード情報をご確認のうえ再度お試しください。",
  confirm_failed: "請求の確定に失敗したため、イベントの作成を中止しました。時間をおいて再度お試しください。",
  annual_charge_failed: "年間プランのお支払いに失敗したため、契約を中止しました。カード情報をご確認のうえ再度お試しください。",
};

const CHARGE_KIND_LABEL: Record<string, string> = { base_fee: "基本料金", overage: "超過分", annual_fee: "年間プラン利用料" };
const INVOICE_STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "下書き", variant: "outline" },
  finalized: { label: "課金待ち", variant: "outline" },
  charged: { label: "課金済み", variant: "secondary" },
  failed: { label: "課金失敗", variant: "destructive" },
  refunded: { label: "返金済み", variant: "outline" },
  uncollectible: { label: "自動リトライ停止", variant: "destructive" },
};

function InvoiceHistoryList({
  invoices,
}: {
  invoices: {
    id: string;
    charge_kind: string;
    total_amount_yen: number;
    status: string;
    invoice_number: string | null;
    invoice_file_id: string | null;
    events: { name: string } | { name: string }[] | null;
  }[];
}) {
  if (invoices.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">請求履歴</h2>
      {invoices.map((inv) => {
        const event = Array.isArray(inv.events) ? inv.events[0] : inv.events;
        const displayName = event?.name ?? (inv.charge_kind === "annual_fee" ? "年間プラン契約" : "（不明なイベント）");
        const statusInfo = INVOICE_STATUS_LABEL[inv.status] ?? { label: inv.status, variant: "outline" as const };
        return (
          <Card key={inv.id}>
            <CardContent className="flex items-center justify-between py-3 text-sm">
              <span className="text-muted-foreground">
                {displayName}
                <span className="ml-1 text-xs">（{CHARGE_KIND_LABEL[inv.charge_kind] ?? inv.charge_kind}）</span>
                {inv.invoice_number && <span className="ml-1 text-xs">{inv.invoice_number}</span>}
              </span>
              <span className="font-medium">¥{inv.total_amount_yen.toLocaleString("ja-JP")}</span>
              <div className="flex items-center gap-2">
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                {inv.invoice_file_id && (
                  <a
                    href={`/api/files/${inv.invoice_file_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline-offset-4 hover:underline"
                  >
                    請求書PDF
                  </a>
                )}
                {(inv.status === "failed" || inv.status === "uncollectible") && (
                  <form action={retryServiceInvoiceAction.bind(null, inv.id)}>
                    <SubmitButton size="sm" variant="outline" pendingText="再試行中...">
                      今すぐ再試行
                    </SubmitButton>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ billingError?: string }>;
}) {
  const { billingError } = await searchParams;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizer_organizations")
    .select("annual_plan_offer_config_id, billing_exempt, payment_provider_customer_id, stripe_default_payment_method_id")
    .eq("id", context.organizationId)
    .single();
  const hasCardOnFile = !!(org?.payment_provider_customer_id && org?.stripe_default_payment_method_id);

  if (org?.billing_exempt) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
        <h1 className="text-xl font-semibold tracking-tight">プラン・課金</h1>
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            運営者アカウントのため、この組織は課金対象外です。イベント作成・利用のすべてを無制限にご利用いただけます。
          </CardContent>
        </Card>
      </div>
    );
  }

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
    .select("id, plan_type, status, payment_method_status, billing_method, started_at, pricing_config_id, annual_plan_config_id")
    .eq("organizer_organization_id", context.organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (!contract) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
        <h1 className="text-xl font-semibold tracking-tight">プラン・課金</h1>

        {billingError && BILLING_ERROR_MESSAGE[billingError] && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {BILLING_ERROR_MESSAGE[billingError]}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          現在、有効な契約はありません。イベント数・出展者数の見込みに応じてプランをお選びください。
        </p>
        <div className={`grid gap-4 ${annualOffer ? "sm:grid-cols-2" : ""}`}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">通常プラン</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">1開催9,800円／30社まで。31社目から1社300円を自動計算してカードへ課金します。</p>
              <p className="text-xs text-muted-foreground">
                開始後、お支払い方法の登録が必須です（登録自体に課金は発生しません）。イベントを作成すると基本料金が即時課金され、超過分はイベント終了日を起点に自動課金されます。
              </p>
              <form action={startStandardPlanAction}>
                <SubmitButton pendingText="処理中...">通常プランを開始する</SubmitButton>
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
                <form action={startAnnualPlanAction.bind(null, "invoice")}>
                  <SubmitButton variant="outline" pendingText="処理中...">
                    年間プランを開始する（請求書払い）
                  </SubmitButton>
                </form>
                {hasCardOnFile ? (
                  <form action={startAnnualPlanAction.bind(null, "card")}>
                    <SubmitButton variant="outline" pendingText="処理中...">
                      年間プランを開始する（登録済みのカードで即時決済）
                    </SubmitButton>
                  </form>
                ) : (
                  <div className="flex flex-col gap-2 rounded-lg border px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      クレジットカード払いをご希望の場合は、先にカードを登録してください（登録自体に課金は発生しません）。
                    </p>
                    <form action={startCardRegistration}>
                      <SubmitButton size="sm" variant="outline" pendingText="処理中...">
                        カードを登録する
                      </SubmitButton>
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
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
    const eventCountCap = annualConfig?.event_count_cap ?? null;
    const isOverEventCountCap = eventCountCap !== null && eventsUsedCount > eventCountCap;

    // 年間プランの請求（クレカ払いを選んだ契約のみ、年額1件のみ発生する）。
    const { data: annualInvoices } = await supabase
      .from("service_invoices")
      .select("id, event_id, charge_kind, total_amount_yen, status, created_at, invoice_number, invoice_file_id, events(name)")
      .eq("service_contract_id", contract.id)
      .gt("total_amount_yen", 0)
      .order("created_at", { ascending: false });

    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
        <h1 className="text-xl font-semibold tracking-tight">プラン・課金</h1>

        {billingError && BILLING_ERROR_MESSAGE[billingError] && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {BILLING_ERROR_MESSAGE[billingError]}
          </div>
        )}

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
                <dt className="text-muted-foreground">お支払い方法</dt>
                <dd>{contract.billing_method === "card" ? "クレジットカード" : "請求書払い（運営担当までお問い合わせください）"}</dd>
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
            {annualConfig?.cap_definition_note && (
              <p className="text-xs text-muted-foreground">{annualConfig.cap_definition_note}</p>
            )}
            {contract.billing_method === "card" && (
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground">
                  カード登録: {contract.payment_method_status === "valid" ? "登録済み" : "未登録"}
                </p>
                {contract.payment_method_status !== "valid" && (
                  <form action={startCardRegistration}>
                    <SubmitButton size="sm" variant="outline" pendingText="処理中...">
                      カードを登録する
                    </SubmitButton>
                  </form>
                )}
              </div>
            )}
            <form action={changeToStandardPlanAction}>
              <SubmitButton variant="ghost" size="sm" className="self-start text-muted-foreground" pendingText="処理中...">
                通常プランに切り替える
              </SubmitButton>
            </form>
          </CardContent>
        </Card>

        <InvoiceHistoryList invoices={annualInvoices ?? []} />

        {isOverEventCountCap && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base text-destructive">年間の開催数上限を超えています</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                現在{eventsUsedCount}開催（上限{eventCountCap}開催）。出展者の入力・提出は引き続き可能です。今後も超過が見込まれる場合は、個別見積もりへの切り替えをご検討ください。
              </p>
            </CardContent>
          </Card>
        )}

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

  // 基本料金はイベント作成時に即時課金済みのため、ここで表示するのは「終了日を
  // 迎えたときに追加課金される見込みの超過分」のみ（超過が無ければ表示しない）。
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
  const pendingEstimates = Array.from(pendingByEvent.entries())
    .map(([eventId, v]) => {
      const overageCount = Math.max(v.count - (pricing?.included_participants ?? 0), 0);
      const overageAmount = overageCount * (pricing?.overage_unit_yen ?? 0);
      return { eventId, name: v.name, count: v.count, overageCount, total: overageAmount };
    })
    .filter((e) => e.overageCount > 0);

  // 超過0件の確認済みマーカー行（total_amount_yen=0）は請求として意味を持たないため表示しない。
  const { data: invoices } = await supabase
    .from("service_invoices")
    .select("id, event_id, charge_kind, total_amount_yen, status, created_at, invoice_number, invoice_file_id, events(name)")
    .eq("service_contract_id", contract.id)
    .gt("total_amount_yen", 0)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">プラン・課金</h1>

      {billingError && BILLING_ERROR_MESSAGE[billingError] && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {BILLING_ERROR_MESSAGE[billingError]}
        </div>
      )}

      {contract.payment_method_status !== "valid" && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">お支払い方法の登録が必須です</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              通常プランのご利用には、お支払い方法の登録が必須です。登録が完了するまで、このページ以外の機能はご利用いただけません（カード登録時に課金は発生しません。実際の請求はイベント作成時（基本料金）とイベント終了日起点（超過分）で自動的に行われます）。
            </p>
            <form action={startCardRegistration}>
              <SubmitButton className="self-start" pendingText="処理中...">
                カードを登録する
              </SubmitButton>
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
            基本料金（¥{(pricing?.base_fee_yen ?? 0).toLocaleString("ja-JP")}）はイベント作成時に即時課金されます。{pricing?.included_participants ?? 30}
            社を超える参加社数分（1社¥{pricing?.overage_unit_yen ?? 0}）は、イベント終了日を起点に自動的に追加課金されます。
          </p>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              カード登録: {contract.payment_method_status === "valid" ? "登録済み" : "未登録"}
            </p>
            {contract.payment_method_status !== "valid" && (
              <form action={startCardRegistration}>
                <SubmitButton size="sm" variant="outline" pendingText="処理中...">
                  カードを登録する
                </SubmitButton>
              </form>
            )}
          </div>
          {annualOffer && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                年間プランのご案内：年額¥{annualOffer.annual_fee_yen.toLocaleString("ja-JP")}
              </p>
              <div className="flex flex-wrap gap-2">
                <form action={changeToAnnualPlanAction.bind(null, "invoice")}>
                  <SubmitButton variant="ghost" size="sm" className="text-muted-foreground" pendingText="処理中...">
                    年間プランに切り替える（請求書払い）
                  </SubmitButton>
                </form>
                <form action={changeToAnnualPlanAction.bind(null, "card")}>
                  <SubmitButton variant="ghost" size="sm" className="text-muted-foreground" pendingText="処理中...">
                    年間プランに切り替える（登録済みのカードで即時決済）
                  </SubmitButton>
                </form>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {pendingEstimates.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">超過分の見込み金額（終了日に追加課金）</h2>
          {pendingEstimates.map((e) => (
            <Card key={e.eventId}>
              <CardContent className="flex items-center justify-between py-3 text-sm">
                <span>{e.name}</span>
                <span className="text-muted-foreground">{e.count}社（超過{e.overageCount}社）</span>
                <span className="font-medium">¥{e.total.toLocaleString("ja-JP")}</span>
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground">イベント終了日を過ぎると超過分の金額が自動的に確定し、課金されます。</p>
        </div>
      )}

      <InvoiceHistoryList invoices={invoices ?? []} />
    </div>
  );
}

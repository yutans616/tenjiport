import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { markServiceInvoicePaidAction, refundServiceInvoiceAction } from "./actions";
import { SubmitButton } from "@/components/organizer/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function yen(n: number) {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

const PLAN_LABEL: Record<string, string> = { standard: "通常", annual: "年間" };
const CONTRACT_STATUS_LABEL: Record<string, string> = { active: "契約中", closed: "終了", cancelled: "解約" };
const CHARGE_KIND_LABEL: Record<string, string> = { base_fee: "基本料金", overage: "超過分", annual_fee: "年間プラン利用料" };
const INVOICE_STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "下書き", variant: "outline" },
  finalized: { label: "課金待ち", variant: "outline" },
  charged: { label: "課金済み", variant: "secondary" },
  failed: { label: "課金失敗", variant: "destructive" },
  refunded: { label: "返金済み", variant: "outline" },
  uncollectible: { label: "自動リトライ停止", variant: "destructive" },
};

const ADMIN_ERROR_MESSAGE: Record<string, string> = {
  invoice_not_found: "対象の請求書が見つかりませんでした。",
  not_eligible_for_manual_payment: "この請求書は入金確認の対象ではありません。",
  already_processed: "この請求書は既に処理済みです。",
  update_failed: "入金確認の処理に失敗しました。時間をおいて再度お試しください。",
  reason_required: "返金理由を入力してください。",
  invalid_amount: "返金額を正しく入力してください。",
  refund_amount_exceeds_remaining: "返金額が残額を超えているか、既に処理済みの請求書です。",
  stripe_refund_failed: "Stripeでの返金処理に失敗しました。カード情報や決済状況をご確認のうえ、時間をおいて再度お試しください。",
};

export default async function AdminOrganizationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ adminError?: string }>;
}) {
  const { orgId } = await params;
  const { adminError } = await searchParams;
  const admin = createServiceRoleClient();

  const { data: org } = await admin
    .from("organizer_organizations")
    .select("id, name, billing_email, status, payment_provider_customer_id, created_at")
    .eq("id", orgId)
    .single();
  if (!org) notFound();

  const { data: contracts } = await admin
    .from("service_contracts")
    .select("id, plan_type, status, payment_method_status, started_at, ended_at")
    .eq("organizer_organization_id", orgId)
    .order("started_at", { ascending: false });

  const { data: invoices } = await admin
    .from("service_invoices")
    .select(
      "id, charge_kind, total_amount_yen, refunded_amount_yen, status, due_date, charged_at, created_at, stripe_payment_intent_id, events(name)",
    )
    .eq("organizer_organization_id", orgId)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{org.name}</h1>
        <p className="text-sm text-muted-foreground">{org.billing_email}</p>
      </div>

      {adminError && ADMIN_ERROR_MESSAGE[adminError] && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ADMIN_ERROR_MESSAGE[adminError]}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">契約履歴</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(contracts ?? []).length === 0 && <p className="text-sm text-muted-foreground">契約がありません。</p>}
          {(contracts ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between border-b py-1.5 text-sm last:border-b-0">
              <span>
                {PLAN_LABEL[c.plan_type] ?? c.plan_type}プラン
                <span className="ml-2 text-xs text-muted-foreground">
                  {new Date(c.started_at).toLocaleDateString("ja-JP")}
                  {c.ended_at ? ` 〜 ${new Date(c.ended_at).toLocaleDateString("ja-JP")}` : ""}
                </span>
              </span>
              <Badge variant={c.status === "active" ? "default" : "outline"}>
                {CONTRACT_STATUS_LABEL[c.status] ?? c.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-4">
          <CardTitle className="text-base">請求履歴</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>イベント</TableHead>
              <TableHead>金額</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>課金日</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(invoices ?? []).map((inv) => {
              const event = Array.isArray(inv.events) ? inv.events[0] : inv.events;
              const statusInfo = INVOICE_STATUS_LABEL[inv.status] ?? { label: inv.status, variant: "outline" as const };
              const remaining = inv.total_amount_yen - inv.refunded_amount_yen;
              const canRefund = inv.status === "charged" && remaining > 0 && !!inv.stripe_payment_intent_id;
              const canMarkPaid = inv.charge_kind === "annual_fee" && inv.status === "finalized" && !!inv.due_date;
              const displayName = event?.name ?? (inv.charge_kind === "annual_fee" ? "年間プラン契約" : "（不明なイベント）");
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    {displayName}
                    <span className="ml-1 text-xs text-muted-foreground">
                      （{CHARGE_KIND_LABEL[inv.charge_kind] ?? inv.charge_kind}）
                    </span>
                  </TableCell>
                  <TableCell>
                    {yen(inv.total_amount_yen)}
                    {inv.refunded_amount_yen > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">（返金済 {yen(inv.refunded_amount_yen)}）</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {inv.charged_at
                      ? new Date(inv.charged_at).toLocaleDateString("ja-JP")
                      : inv.due_date
                        ? `期限: ${new Date(inv.due_date).toLocaleDateString("ja-JP")}`
                        : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {canMarkPaid && (
                      <form
                        action={markServiceInvoicePaidAction.bind(null, orgId, inv.id)}
                        className="flex flex-col items-end gap-1.5"
                      >
                        <div className="flex items-center gap-1.5">
                          <Label htmlFor={`paid_at_${inv.id}`} className="sr-only">
                            入金日
                          </Label>
                          <Input id={`paid_at_${inv.id}`} name="paid_at" type="date" className="h-8 w-36" />
                        </div>
                        <SubmitButton size="sm" pendingText="処理中...">
                          入金済みにする
                        </SubmitButton>
                      </form>
                    )}
                    {canRefund && (
                      <form
                        action={refundServiceInvoiceAction.bind(null, orgId, inv.id)}
                        className="flex flex-col items-end gap-1.5"
                      >
                        <div className="flex items-center gap-1.5">
                          <Label htmlFor={`amount_${inv.id}`} className="sr-only">
                            返金額
                          </Label>
                          <Input
                            id={`amount_${inv.id}`}
                            name="amount_yen"
                            type="number"
                            min={1}
                            max={remaining}
                            defaultValue={remaining}
                            className="h-8 w-28 text-right"
                          />
                        </div>
                        <Textarea
                          name="reason"
                          required
                          placeholder="返金理由（必須）"
                          className="h-14 w-56 text-xs"
                        />
                        <SubmitButton size="sm" variant="destructive" pendingText="返金中...">
                          返金する
                        </SubmitButton>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

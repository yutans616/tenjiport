import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus, Send, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SuccessBanner } from "@/components/organizer/success-banner";
import { SubmitButton } from "@/components/organizer/submit-button";
import { cn } from "@/lib/utils";
import { remindUnpaidInvoicesBulkAction } from "./actions";

const PAYMENT_FILTERS = [
  { value: "all", label: "すべて" },
  { value: "unpaid", label: "未入金" },
  { value: "paid", label: "入金済み" },
] as const;
type PaymentFilter = (typeof PAYMENT_FILTERS)[number]["value"];

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ done?: string; count?: string; payment?: string }>;
}) {
  const { eventId } = await params;
  const { done, count, payment } = await searchParams;
  const filter: PaymentFilter = payment === "unpaid" || payment === "paid" ? payment : "all";
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");
  const canBulkOperate = context.role === "owner" || context.role === "admin";

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
    .select("id, status, exhibitor_profiles(brand_name)")
    .eq("event_id", eventId);
  const brandByParticipation = new Map(
    (participationRows ?? []).map((p) => {
      const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
      return [p.id, profile?.brand_name ?? "（未設定）"];
    }),
  );
  const cancelledParticipationIds = new Set(
    (participationRows ?? []).filter((p) => p.status === "cancelled").map((p) => p.id),
  );

  const { data: invoices } = await supabase
    .from("exhibitor_invoices")
    .select("id, event_participation_id, amount_yen, due_date, invoice_ack_status, payment_status, created_at")
    .in("event_participation_id", (participationRows ?? []).map((p) => p.id))
    .order("created_at", { ascending: false });

  const allInvoices = invoices ?? [];
  const countByFilter: Record<PaymentFilter, number> = {
    all: allInvoices.length,
    unpaid: allInvoices.filter((inv) => inv.payment_status === "unpaid").length,
    paid: allInvoices.filter((inv) => inv.payment_status === "paid").length,
  };
  const visibleInvoices = filter === "all" ? allInvoices : allInvoices.filter((inv) => inv.payment_status === filter);
  // 一括督促はキャンセル済みの参加者を除く（サーバー側アクションと同じ条件）。
  const remindableCount = allInvoices.filter(
    (inv) => inv.payment_status === "unpaid" && !cancelledParticipationIds.has(inv.event_participation_id),
  ).length;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <SuccessBanner done={done} count={count} />
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">請求書</h2>
        <div className="flex gap-2">
          {canBulkOperate && (
            <Button
              variant="outline"
              render={
                <Link href={`/events/${eventId}/invoices/bulk`}>
                  <Zap />
                  一括発行
                </Link>
              }
            />
          )}
          <Button
            render={
              <Link href={`/events/${eventId}/invoices/new`}>
                <Plus />
                新規作成
              </Link>
            }
          />
        </div>
      </div>

      {allInvoices.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="入金状況で絞り込み">
            {PAYMENT_FILTERS.map((f) => (
              <Link
                key={f.value}
                href={f.value === "all" ? `/events/${eventId}/invoices` : `/events/${eventId}/invoices?payment=${f.value}`}
                aria-current={filter === f.value ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 transition-colors",
                  filter === f.value
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
                <span className="ml-1 text-xs text-muted-foreground">{countByFilter[f.value]}</span>
              </Link>
            ))}
          </nav>
          {canBulkOperate && remindableCount > 0 && (
            <form action={remindUnpaidInvoicesBulkAction.bind(null, eventId)}>
              <SubmitButton variant="outline" size="sm" pendingText="送信中...">
                <Send />
                未入金の{remindableCount}件に一括督促
              </SubmitButton>
            </form>
          )}
        </div>
      )}

      {allInvoices.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">まだ請求書がありません。</CardContent>
        </Card>
      ) : visibleInvoices.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {filter === "unpaid" ? "未入金の請求書はありません。" : "入金済みの請求書はありません。"}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {visibleInvoices.map((inv) => (
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
                    {cancelledParticipationIds.has(inv.event_participation_id) && (
                      <Badge variant="outline" className="text-muted-foreground">参加キャンセル</Badge>
                    )}
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

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { markInvoicePaid, markInvoiceUnpaid, resendInvoiceReminderAction, updateInvoiceDetails } from "../actions";
import { SubmitButton } from "@/components/organizer/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SuccessBanner } from "@/components/organizer/success-banner";
import Link from "next/link";

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; invoiceId: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { eventId, invoiceId } = await params;
  const { done } = await searchParams;
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

  const { data: invoice } = await supabase
    .from("exhibitor_invoices")
    .select(
      "id, invoice_number, event_participation_id, invoice_file_id, amount_yen, due_date, invoice_ack_status, invoice_ack_at, payment_status, paid_at, organizer_internal_memo, event_participations(resolved_price_yen, exhibitor_profiles(brand_name, company_name)), file_assets(filename)",
    )
    .eq("id", invoiceId)
    .single();
  if (!invoice) notFound();

  const invoiceFile = Array.isArray(invoice.file_assets) ? invoice.file_assets[0] : invoice.file_assets;

  const participation = Array.isArray(invoice.event_participations)
    ? invoice.event_participations[0]
    : invoice.event_participations;
  const profile = participation
    ? Array.isArray(participation.exhibitor_profiles)
      ? participation.exhibitor_profiles[0]
      : participation.exhibitor_profiles
    : null;
  const priceMismatch =
    participation?.resolved_price_yen != null && participation.resolved_price_yen !== invoice.amount_yen;

  const { data: changeLogs } = await supabase
    .from("invoice_change_logs")
    .select("id, changed_at, field_changed, old_value, new_value, note")
    .eq("exhibitor_invoice_id", invoiceId)
    .order("changed_at", { ascending: false });

  const { data: bankAccount } = await supabase
    .from("organizer_bank_accounts")
    .select("bank_name, branch_name, account_type, account_number, account_holder_name")
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  const hasBankAccount = bankAccount && (bankAccount.bank_name || bankAccount.account_number);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
      <SuccessBanner done={done} />
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{profile?.brand_name ?? "（未設定）"}</h1>
        <p className="text-sm text-muted-foreground">{profile?.company_name}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">請求内容</CardTitle>
          <div className="flex gap-2">
            <Badge variant={invoice.invoice_ack_status === "confirmed" ? "secondary" : "outline"}>
              {invoice.invoice_ack_status === "confirmed" ? "確認済み" : "未確認"}
            </Badge>
            <Badge variant={invoice.payment_status === "paid" ? "default" : "outline"}>
              {invoice.payment_status === "paid" ? "入金済み" : "未入金"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {invoice.invoice_number && <p className="text-xs text-muted-foreground">請求書番号: {invoice.invoice_number}</p>}
          {priceMismatch && participation && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
              フォームの選択内容による金額（¥{participation.resolved_price_yen!.toLocaleString("ja-JP")}）と、この請求書の金額（¥
              {invoice.amount_yen.toLocaleString("ja-JP")}）が一致しません。出展者が再提出で選択内容を変更した可能性があります。
            </div>
          )}
          {invoice.payment_status === "unpaid" && (
            <form action={resendInvoiceReminderAction.bind(null, eventId, invoiceId)}>
              <SubmitButton variant="outline" size="sm" className="self-start" pendingText="送信中...">
                請求書を再送する
              </SubmitButton>
            </form>
          )}

          {invoice.invoice_file_id && (
            <a
              href={`/api/files/${invoice.invoice_file_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              請求書ファイルを見る{invoiceFile?.filename ? `（${invoiceFile.filename}）` : ""}
            </a>
          )}

          <form action={updateInvoiceDetails.bind(null, eventId, invoiceId)} className="flex flex-col gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="amount_yen">金額（円）</Label>
              <Input id="amount_yen" type="number" name="amount_yen" min={0} step={1} defaultValue={invoice.amount_yen} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="due_date">支払期限</Label>
              <Input id="due_date" type="date" name="due_date" defaultValue={invoice.due_date ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="memo">主催者内部メモ</Label>
              <Input id="memo" name="memo" defaultValue={invoice.organizer_internal_memo ?? ""} />
            </div>
            <SubmitButton variant="outline" className="self-start" pendingText="保存中...">
              内容を訂正する
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      {!hasBankAccount && (
        <p className="text-xs text-muted-foreground">
          銀行口座が未登録のため、出展者には振込先が表示されません。
          <Link href="/settings" className="ml-1 text-primary underline-offset-4 hover:underline">
            設定で登録する
          </Link>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">入金確認</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {invoice.payment_status === "unpaid" ? (
            <form action={markInvoicePaid.bind(null, eventId, invoiceId)} className="flex flex-col gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="paid_at">入金日</Label>
                <Input id="paid_at" type="date" name="paid_at" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="note">メモ（任意）</Label>
                <Input id="note" name="note" />
              </div>
              <SubmitButton className="self-start" pendingText="処理中...">
                入金済みにする
              </SubmitButton>
            </form>
          ) : (
            <form action={markInvoiceUnpaid.bind(null, eventId, invoiceId)} className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                入金日: {invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString("ja-JP") : "-"}
              </p>
              <div className="grid gap-1.5">
                <Label htmlFor="note">訂正理由（任意）</Label>
                <Input id="note" name="note" />
              </div>
              <SubmitButton variant="outline" className="self-start" pendingText="処理中...">
                未入金に戻す
              </SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>

      {changeLogs && changeLogs.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">変更履歴</h2>
          <Card>
            <CardContent className="flex flex-col gap-2 py-3 text-sm">
              {changeLogs.map((log) => (
                <p key={log.id} className="text-muted-foreground">
                  {new Date(log.changed_at).toLocaleString("ja-JP")} — {log.field_changed}: {log.old_value ?? "(空)"} →{" "}
                  {log.new_value ?? "(空)"}
                  {log.note ? `（${log.note}）` : ""}
                </p>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

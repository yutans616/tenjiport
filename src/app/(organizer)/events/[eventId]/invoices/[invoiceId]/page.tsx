import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { markInvoicePaid, markInvoiceUnpaid, updateInvoiceDetails } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ eventId: string; invoiceId: string }>;
}) {
  const { eventId, invoiceId } = await params;
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
      "id, event_participation_id, invoice_file_id, amount_yen, due_date, invoice_ack_status, invoice_ack_at, payment_status, paid_at, organizer_internal_memo, event_participations(exhibitor_profiles(brand_name, company_name))",
    )
    .eq("id", invoiceId)
    .single();
  if (!invoice) notFound();

  const participation = Array.isArray(invoice.event_participations)
    ? invoice.event_participations[0]
    : invoice.event_participations;
  const profile = participation
    ? Array.isArray(participation.exhibitor_profiles)
      ? participation.exhibitor_profiles[0]
      : participation.exhibitor_profiles
    : null;

  const { data: changeLogs } = await supabase
    .from("invoice_change_logs")
    .select("id, changed_at, field_changed, old_value, new_value, note")
    .eq("exhibitor_invoice_id", invoiceId)
    .order("changed_at", { ascending: false });

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
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
          {invoice.invoice_file_id && (
            <a
              href={`/api/files/${invoice.invoice_file_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              請求書ファイルを見る
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
            <Button type="submit" variant="outline" className="self-start">
              内容を訂正する
            </Button>
          </form>
        </CardContent>
      </Card>

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
              <Button type="submit" className="self-start">
                入金済みにする
              </Button>
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
              <Button type="submit" variant="outline" className="self-start">
                未入金に戻す
              </Button>
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

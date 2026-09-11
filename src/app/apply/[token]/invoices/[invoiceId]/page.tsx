import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { confirmInvoiceAction } from "../actions";
import { SubmitButton } from "@/components/organizer/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function ExhibitorInvoiceDetailPage({
  params,
}: {
  params: Promise<{ token: string; invoiceId: string }>;
}) {
  const { token, invoiceId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/apply/${token}`);

  const { data: invoice } = await supabase
    .from("exhibitor_invoices")
    .select("id, invoice_number, invoice_file_id, amount_yen, due_date, invoice_ack_status, payment_status, paid_at")
    .eq("id", invoiceId)
    .single();
  if (!invoice) notFound();

  let invoiceFilename: string | null = null;
  if (invoice.invoice_file_id) {
    const { data } = await supabase.rpc("get_accessible_file_filename", { p_file_asset_id: invoice.invoice_file_id });
    invoiceFilename = data ?? null;
  }

  const { data: bankRows } = await supabase.rpc("get_invoice_bank_details", { p_invoice_id: invoiceId });
  const bankDetails = bankRows?.[0];
  const hasBankDetails = bankDetails && (bankDetails.bank_name || bankDetails.account_number);

  const confirmWithIds = confirmInvoiceAction.bind(null, token, invoiceId);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-1 flex-col gap-6 p-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            請求書
            <Badge variant={invoice.payment_status === "paid" ? "default" : "outline"}>
              {invoice.payment_status === "paid" ? "入金済み" : "未入金"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="flex flex-col gap-2 text-sm">
            {invoice.invoice_number && (
              <div className="flex justify-between border-b py-1.5">
                <dt className="text-muted-foreground">請求書番号</dt>
                <dd>{invoice.invoice_number}</dd>
              </div>
            )}
            <div className="flex justify-between border-b py-1.5">
              <dt className="text-muted-foreground">金額</dt>
              <dd>¥{invoice.amount_yen.toLocaleString("ja-JP")}</dd>
            </div>
            <div className="flex justify-between py-1.5">
              <dt className="text-muted-foreground">支払期限</dt>
              <dd>{invoice.due_date ?? "-"}</dd>
            </div>
          </dl>

          {invoice.invoice_file_id && (
            <a
              href={`/api/files/${invoice.invoice_file_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              請求書ファイルをダウンロード{invoiceFilename ? `（${invoiceFilename}）` : ""}
            </a>
          )}

          {hasBankDetails ? (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <p className="font-medium">お振込先</p>
              <dl className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                {bankDetails?.bank_name && (
                  <div className="flex justify-between gap-4">
                    <dt>銀行名</dt>
                    <dd className="text-foreground">{bankDetails.bank_name}</dd>
                  </div>
                )}
                {bankDetails?.branch_name && (
                  <div className="flex justify-between gap-4">
                    <dt>支店名</dt>
                    <dd className="text-foreground">{bankDetails.branch_name}</dd>
                  </div>
                )}
                {bankDetails?.account_type && bankDetails?.account_number && (
                  <div className="flex justify-between gap-4">
                    <dt>口座番号</dt>
                    <dd className="text-foreground">
                      {bankDetails.account_type} {bankDetails.account_number}
                    </dd>
                  </div>
                )}
                {bankDetails?.account_holder_name && (
                  <div className="flex justify-between gap-4">
                    <dt>口座名義</dt>
                    <dd className="text-foreground">{bankDetails.account_holder_name}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">入金確認は主催者側で行われます。</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">銀行振込にてお支払いください。入金確認は主催者側で行われます。</p>
          )}

          {invoice.invoice_ack_status === "confirmed" ? (
            <Badge variant="secondary" className="w-fit">
              内容を確認済み
            </Badge>
          ) : (
            <form action={confirmWithIds}>
              <SubmitButton pendingText="処理中...">内容を確認しました</SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

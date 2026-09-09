import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { confirmInvoiceAction } from "../actions";
import { Button } from "@/components/ui/button";
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
    .select("id, invoice_file_id, amount_yen, due_date, invoice_ack_status, payment_status, paid_at")
    .eq("id", invoiceId)
    .single();
  if (!invoice) notFound();

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
              請求書ファイルをダウンロード
            </a>
          )}

          <p className="text-sm text-muted-foreground">
            銀行振込にてお支払いください。入金確認は主催者側で行われます。
          </p>

          {invoice.invoice_ack_status === "confirmed" ? (
            <Badge variant="secondary" className="w-fit">
              内容を確認済み
            </Badge>
          ) : (
            <form action={confirmWithIds}>
              <Button type="submit">内容を確認しました</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

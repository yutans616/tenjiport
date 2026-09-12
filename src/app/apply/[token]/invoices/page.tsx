import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function ExhibitorInvoicesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/apply/${token}`);

  const { data: event } = await supabase.from("events").select("id, name").eq("public_form_token", token).maybeSingle();
  if (!event) redirect(`/apply/${token}`);

  // RLSにより自分がメンバーの出展者プロフィールに紐づく参加のみが返るため、
  // 同一イベントに複数ブランドで参加している場合も全件をここで拾う
  // （旧実装はcreated_at最古の1件だけを見ており、2つ目以降のブランドの
  // 請求書が永久に表示されないバグがあった）。
  const { data: participations } = await supabase
    .from("event_participations")
    .select("id, exhibitor_profiles(brand_name)")
    .eq("event_id", event.id)
    .order("created_at", { ascending: true });
  const participationIds = (participations ?? []).map((p) => p.id);
  const brandNameByParticipation = new Map(
    (participations ?? []).map((p) => {
      const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
      return [p.id, profile?.brand_name ?? "（未設定）"];
    }),
  );
  const showBrandLabel = participationIds.length > 1;

  const { data: invoices } = participationIds.length
    ? await supabase
        .from("exhibitor_invoices")
        .select("id, event_participation_id, amount_yen, due_date, invoice_ack_status, payment_status")
        .in("event_participation_id", participationIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-1 flex-col gap-6 p-4 py-10">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{event.name}</p>
        <h1 className="text-lg font-semibold tracking-tight">請求書</h1>
      </div>

      {!invoices || invoices.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">まだ請求書がありません。</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {invoices.map((inv) => (
            <Link key={inv.id} href={`/apply/${token}/invoices/${inv.id}`}>
              <Card className="transition-colors hover:border-primary/40 hover:bg-accent/40">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    {showBrandLabel && (
                      <p className="text-xs text-muted-foreground">{brandNameByParticipation.get(inv.event_participation_id)}</p>
                    )}
                    <p className="font-medium">¥{inv.amount_yen.toLocaleString("ja-JP")}</p>
                    <p className="text-sm text-muted-foreground">{inv.due_date ? `支払期限: ${inv.due_date}` : ""}</p>
                  </div>
                  <div className="flex gap-2">
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
    </main>
  );
}

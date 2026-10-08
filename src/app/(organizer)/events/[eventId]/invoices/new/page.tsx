import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { lineItemFormValue, loadBillingStates, sumLineItems } from "@/lib/billing/exhibitorBilling";
import { createInvoice } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/organizer/submit-button";
import { ParticipantSelect } from "./ParticipantSelect";

function yen(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function CommonFields({ idPrefix }: { idPrefix: string }) {
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}_due_date`}>支払期限</Label>
        <Input id={`${idPrefix}_due_date`} type="date" name="due_date" className="max-w-48" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}_file`}>請求書ファイル（PDF等・任意）</Label>
        <Input id={`${idPrefix}_file`} type="file" name="file" />
        <p className="text-xs text-muted-foreground">未添付の場合は自動生成されます。添付する場合は20MBまでです。</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}_memo`}>主催者内部メモ（出展者には表示されません）</Label>
        <Input id={`${idPrefix}_memo`} name="memo" />
      </div>
    </>
  );
}

export default async function NewInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ participation?: string }>;
}) {
  const { eventId } = await params;
  const { participation: participationParam } = await searchParams;
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

  const { data: participations } = await supabase
    .from("event_participations")
    .select("id, resolved_price_yen, exhibitor_profiles(brand_name)")
    .eq("event_id", eventId)
    .not("status", "in", "(cancelled,merged)")
    .order("created_at", { ascending: true });

  const participants = (participations ?? []).map((p) => {
    const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
    return { id: p.id, name: profile?.brand_name ?? "（未設定）" };
  });
  const selected = (participations ?? []).find((p) => p.id === participationParam) ?? null;
  const state = selected ? (await loadBillingStates(supabase, eventId, [selected])).states.get(selected.id)! : null;

  const createInvoiceWithId = createInvoice.bind(null, eventId);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">請求書を作成</h1>

      <div className="grid gap-1.5">
        <Label htmlFor="participation_select">対象の出展者</Label>
        <ParticipantSelect eventId={eventId} participants={participants} selectedId={selected?.id ?? null} />
      </div>

      {selected && state && (
        <>
          <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">確定金額</p>
              <p className="font-medium">{state.resolvedPriceYen != null ? yen(state.resolvedPriceYen) : "未設定"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">請求済み</p>
              <p className="font-medium">{yen(state.invoicedTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">未請求の品目</p>
              <p className="font-medium">{yen(sumLineItems(state.unbilledItems))}</p>
            </div>
          </div>

          {(state.hasUnitemizedInvoice || state.hasManualInvoice) && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
              {state.hasUnitemizedInvoice
                ? "品目の記録が無い以前の請求書があるため、「未請求の品目」にはその請求書で請求した分が反映されていません。"
                : "金額を手入力した請求書があります。「未請求の品目」にはその請求書の分は反映されません。"}
              二重請求にならないよう、既存の請求書を確認してから作成してください。
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">未請求の品目から作成</CardTitle>
            </CardHeader>
            <CardContent>
              {state.unbilledItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  未請求の品目はありません（フォームで選択された品目はすべて請求済み、または確定金額が未設定です）。
                </p>
              ) : (
                <form action={createInvoiceWithId} className="flex flex-col gap-4">
                  <input type="hidden" name="participation_id" value={selected.id} />
                  <input type="hidden" name="mode" value="items" />
                  <fieldset className="flex flex-col gap-1.5 rounded-lg border p-2">
                    <legend className="px-1 text-xs text-muted-foreground">請求する品目</legend>
                    {state.unbilledItems.map((item) => (
                      <label key={lineItemFormValue(item)} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="item_keys"
                            value={lineItemFormValue(item)}
                            defaultChecked
                            className="size-4 rounded border-input"
                          />
                          {item.label}
                          {item.quantity > 1 && <span className="text-muted-foreground">×{item.quantity}</span>}
                        </span>
                        <span>{yen(item.price_yen * item.quantity)}</span>
                      </label>
                    ))}
                  </fieldset>
                  <p className="text-xs text-muted-foreground">金額はチェックした品目の合計になり、請求書PDFに品目ごとの明細として載ります。</p>
                  <CommonFields idPrefix="items" />
                  <SubmitButton pendingText="作成中..." className="self-start">
                    作成して通知する
                  </SubmitButton>
                </form>
              )}
            </CardContent>
          </Card>

          <details className="rounded-xl border bg-card px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">金額を入力して作成する</summary>
            <form action={createInvoiceWithId} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="participation_id" value={selected.id} />
              <input type="hidden" name="mode" value="manual" />
              <p className="text-xs text-muted-foreground">
                フォームに無い費用（追加工事費など）を請求する場合に使います。フォームの品目の請求済み・未請求には影響しません（フォームの品目はこの方法ではなく、上の「未請求の品目から作成」で請求してください）。
              </p>
              <div className="grid gap-1.5">
                <Label htmlFor="manual_label">品目名</Label>
                <Input id="manual_label" name="manual_label" placeholder="出展料" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="amount_yen">金額（円）</Label>
                <Input id="amount_yen" type="number" name="amount_yen" min={0} step={1} required className="max-w-48" />
              </div>
              <CommonFields idPrefix="manual" />
              <SubmitButton variant="outline" pendingText="作成中..." className="self-start">
                作成して通知する
              </SubmitButton>
            </form>
          </details>
        </>
      )}
    </div>
  );
}

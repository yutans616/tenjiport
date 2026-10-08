import type { createClient } from "@/lib/supabase/server";
import { extractPricedSelections, isPricedField } from "@/lib/forms/pricedSelections";

// 請求書（exhibitor_invoices.line_items_json）に記録する品目。migrations/0071参照。
export type BillingLineItem = { field_key: string; label: string; price_yen: number; quantity: number };

// 確定金額と、フォームの価格付き選択肢から復元した品目合計との差額（価格付き項目の無いフォームや、
// 提出後に選択肢の価格が変更された場合など）。差額も品目として請求・追跡する。
export const RESIDUAL_KEY = "__residual__";
// 金額訂正で生じた調整額。未請求の計算には使わない。
export const ADJUST_KEY = "__adjust__";
// フォームに無い費用を、品目名と金額の手入力で請求したもの。フォームの品目とは独立した
// 請求として扱い、未請求の計算には使わない（二重請求の確認を促す表示だけ行う）。
export const MANUAL_KEY = "__manual__";

export type BillingState = {
  resolvedPriceYen: number | null;
  currentItems: BillingLineItem[];
  unbilledItems: BillingLineItem[];
  invoicedTotal: number;
  /** 品目の記録が無い（0071導入前の作成で品目を復元できなかった）請求書がある。未請求分を自動計算できない。 */
  hasUnitemizedInvoice: boolean;
  /** 品目名・金額を手入力した請求書がある。 */
  hasManualInvoice: boolean;
};

export type InvoiceForBilling = { amount_yen: number; line_items_json: unknown };

export function formatYen(n: number): string {
  return `${n < 0 ? "-" : ""}¥${Math.abs(n).toLocaleString("ja-JP")}`;
}

export function sumLineItems(items: BillingLineItem[]): number {
  return items.reduce((sum, i) => sum + i.price_yen * i.quantity, 0);
}

function itemKey(item: { field_key: string; label: string }) {
  return `${item.field_key}\u0000${item.label}`;
}

export function parseLineItems(value: unknown): BillingLineItem[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(
    (v): v is BillingLineItem =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as BillingLineItem).label === "string" &&
      typeof (v as BillingLineItem).price_yen === "number" &&
      typeof (v as BillingLineItem).quantity === "number",
  );
}

export function computeBillingState(params: {
  pricedFields: { key: string; type: string; options_json: unknown }[];
  answers: Record<string, unknown> | null;
  quantities: Record<string, Record<string, number>> | null;
  resolvedPriceYen: number | null;
  invoices: InvoiceForBilling[];
}): BillingState {
  const { pricedFields, answers, quantities, resolvedPriceYen, invoices } = params;

  const pricedItems: BillingLineItem[] = answers
    ? extractPricedSelections(pricedFields, answers, quantities ?? {}).map((s) => ({
        field_key: s.fieldKey,
        label: s.label,
        price_yen: s.priceYen,
        quantity: s.quantity,
      }))
    : [];
  const residualYen = resolvedPriceYen != null ? resolvedPriceYen - sumLineItems(pricedItems) : 0;
  const residualLabel = pricedItems.length === 0 ? "出展料" : "その他（確定金額との差額）";
  const currentItems =
    residualYen > 0
      ? [...pricedItems, { field_key: RESIDUAL_KEY, label: residualLabel, price_yen: residualYen, quantity: 1 }]
      : pricedItems;

  const billedQty = new Map<string, number>();
  let billedResidualYen = 0;
  let hasUnitemizedInvoice = false;
  let hasManualInvoice = false;
  for (const invoice of invoices) {
    const items = parseLineItems(invoice.line_items_json);
    if (!items) {
      hasUnitemizedInvoice = true;
      continue;
    }
    for (const item of items) {
      if (item.field_key === MANUAL_KEY) hasManualInvoice = true;
      if (item.field_key === ADJUST_KEY || item.field_key === MANUAL_KEY) continue;
      if (item.field_key === RESIDUAL_KEY) {
        billedResidualYen += item.price_yen * item.quantity;
        continue;
      }
      billedQty.set(itemKey(item), (billedQty.get(itemKey(item)) ?? 0) + item.quantity);
    }
  }

  const unbilledItems: BillingLineItem[] = [];
  for (const item of pricedItems) {
    const remaining = item.quantity - (billedQty.get(itemKey(item)) ?? 0);
    if (remaining > 0) unbilledItems.push({ ...item, quantity: remaining });
  }
  if (residualYen - billedResidualYen > 0) {
    unbilledItems.push({ field_key: RESIDUAL_KEY, label: residualLabel, price_yen: residualYen - billedResidualYen, quantity: 1 });
  }

  return {
    resolvedPriceYen,
    currentItems,
    unbilledItems,
    invoicedTotal: invoices.reduce((sum, i) => sum + i.amount_yen, 0),
    hasUnitemizedInvoice,
    hasManualInvoice,
  };
}

export type PricedFieldInfo = { key: string; label: string; type: string; options_json: unknown };

// イベントの最新フォームの価格付き項目と、参加者ごとの請求状況をまとめて取得する。
// 品目は確定金額（resolved_price_yen）と同じく最新の「提出済み」版から復元する。
export async function loadBillingStates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  participations: { id: string; resolved_price_yen: number | null }[],
): Promise<{ pricedFields: PricedFieldInfo[]; states: Map<string, BillingState> }> {
  const { data: form } = await supabase
    .from("forms")
    .select("id")
    .eq("event_id", eventId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  let pricedFields: PricedFieldInfo[] = [];
  if (form) {
    const { data: sections } = await supabase
      .from("form_sections")
      .select("order, form_fields(key, label, type, order, options_json)")
      .eq("form_id", form.id)
      .order("order", { ascending: true });
    pricedFields = (sections ?? [])
      .flatMap((s) => ((s.form_fields ?? []) as (PricedFieldInfo & { order: number })[]).slice().sort((a, b) => a.order - b.order))
      .filter(isPricedField)
      .map(({ key, label, type, options_json }) => ({ key, label, type, options_json }));
  }

  const participationIds = participations.map((p) => p.id);
  const states = new Map<string, BillingState>();
  if (participationIds.length === 0) return { pricedFields, states };

  const [{ data: versions }, { data: invoices }] = await Promise.all([
    supabase
      .from("submission_versions")
      .select("event_participation_id, version_number, data_snapshot_json, quantities_json")
      .in("event_participation_id", participationIds)
      .neq("status", "draft")
      .order("version_number", { ascending: false }),
    supabase
      .from("exhibitor_invoices")
      .select("event_participation_id, amount_yen, line_items_json")
      .in("event_participation_id", participationIds),
  ]);

  const latestByParticipation = new Map<string, { answers: Record<string, unknown>; quantities: Record<string, Record<string, number>> }>();
  for (const v of versions ?? []) {
    if (latestByParticipation.has(v.event_participation_id)) continue;
    latestByParticipation.set(v.event_participation_id, {
      answers: (v.data_snapshot_json as Record<string, unknown>) ?? {},
      quantities: (v.quantities_json as Record<string, Record<string, number>>) ?? {},
    });
  }

  for (const p of participations) {
    const latest = latestByParticipation.get(p.id);
    states.set(
      p.id,
      computeBillingState({
        pricedFields,
        answers: latest?.answers ?? null,
        quantities: latest?.quantities ?? null,
        resolvedPriceYen: p.resolved_price_yen,
        invoices: (invoices ?? []).filter((i) => i.event_participation_id === p.id),
      }),
    );
  }

  return { pricedFields, states };
}

// 画面のチェックボックスの値。サーバー側で未請求分を再計算し、この値で突き合わせる。
export function lineItemFormValue(item: { field_key: string; label: string }) {
  return `${item.field_key}\u0001${item.label}`;
}

export function formatLineItemsSummary(items: BillingLineItem[], max = 3): string {
  const visible = items.filter((i) => i.field_key !== ADJUST_KEY);
  const names = visible.slice(0, max).map((i) => (i.quantity > 1 ? `${i.label}×${i.quantity}` : i.label));
  return visible.length > max ? `${names.join("、")} ほか${visible.length - max}点` : names.join("、");
}

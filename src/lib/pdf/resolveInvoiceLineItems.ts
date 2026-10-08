import type { createClient } from "@/lib/supabase/server";
import { extractPricedSelections } from "@/lib/forms/pricedSelections";

export type InvoiceLineItem = { label: string; priceYen: number; quantity: number };

// 出展者の最新提出内容から、価格付き選択肢（コマ選択等）ごとの品目・金額を復元する。
// 復元結果の合計が実際の請求金額と一致しない場合（主催者が金額を手動訂正した等）は、
// 内訳が実態と食い違うPDFを出さないよう、汎用の1行（"出展料"）にフォールバックする。
export async function resolveInvoiceLineItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  participationId: string,
  fallbackAmountYen: number,
): Promise<InvoiceLineItem[]> {
  const fallback: InvoiceLineItem[] = [{ label: "出展料", priceYen: fallbackAmountYen, quantity: 1 }];

  const { data: versions } = await supabase
    .from("submission_versions")
    .select("form_id, data_snapshot_json, quantities_json")
    .eq("event_participation_id", participationId)
    .order("version_number", { ascending: false })
    .limit(1);
  const latest = versions?.[0];
  if (!latest) return fallback;

  const { data: sections } = await supabase
    .from("form_sections")
    .select("form_fields(key, type, options_json)")
    .eq("form_id", latest.form_id);

  const items = extractPricedSelections(
    (sections ?? []).flatMap((s) => s.form_fields ?? []),
    (latest.data_snapshot_json as Record<string, unknown>) ?? {},
    (latest.quantities_json as Record<string, Record<string, number>>) ?? {},
  ).map(({ label, priceYen, quantity }) => ({ label, priceYen, quantity }));

  if (items.length === 0) return fallback;

  const sum = items.reduce((total, item) => total + item.priceYen * item.quantity, 0);
  if (sum !== fallbackAmountYen) return fallback;

  return items;
}

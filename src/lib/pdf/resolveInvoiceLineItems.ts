import type { createClient } from "@/lib/supabase/server";

export type InvoiceLineItem = { label: string; priceYen: number; quantity: number };

type PricedChoice = { label: string; price_yen: number; capacity: number | null };

function isPricedChoice(c: unknown): c is PricedChoice {
  return typeof c === "object" && c !== null && "label" in c && "price_yen" in c;
}

// 出展者の最新提出内容から、価格付き選択肢（コマ選択等）ごとの品目・金額を復元する。
// 単一選択・複数選択いずれでも、選択された各選択肢を1行として扱い、数量は
// quantities_json（選択肢ラベルごとの個数。同一選択肢を複数個購入した場合など）から復元する。
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

  const fields = (sections ?? []).flatMap((s) => s.form_fields ?? []);
  const answers = (latest.data_snapshot_json as Record<string, unknown>) ?? {};
  const quantities = (latest.quantities_json as Record<string, Record<string, number>>) ?? {};

  const items: InvoiceLineItem[] = [];
  for (const field of fields) {
    if (field.type !== "single_select" && field.type !== "multi_select") continue;
    const choices = (field.options_json as { choices?: unknown[] } | null)?.choices ?? [];
    const pricedChoices = choices.filter(isPricedChoice);
    if (pricedChoices.length === 0) continue;

    const answer = answers[field.key];
    const selectedLabels: string[] =
      field.type === "single_select"
        ? typeof answer === "string" && answer
          ? [answer]
          : []
        : Array.isArray(answer)
          ? answer.filter((v): v is string => typeof v === "string")
          : [];

    for (const label of selectedLabels) {
      const choice = pricedChoices.find((c) => c.label === label);
      if (choice) {
        const rawQty = quantities[field.key]?.[label];
        const quantity = Number.isFinite(rawQty) && (rawQty as number) >= 1 ? Math.floor(rawQty as number) : 1;
        items.push({ label: choice.label, priceYen: choice.price_yen, quantity });
      }
    }
  }

  if (items.length === 0) return fallback;

  const sum = items.reduce((total, item) => total + item.priceYen * item.quantity, 0);
  if (sum !== fallbackAmountYen) return fallback;

  return items;
}

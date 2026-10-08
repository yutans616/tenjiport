export type PricedSelection = { fieldKey: string; label: string; priceYen: number; quantity: number };

type PricedChoice = { label: string; price_yen: number; capacity: number | null };
type FieldLike = { key: string; type: string; options_json: unknown };

function isPricedChoice(c: unknown): c is PricedChoice {
  return typeof c === "object" && c !== null && "label" in c && "price_yen" in c;
}

export function isPricedField(field: FieldLike): boolean {
  if (field.type !== "single_select" && field.type !== "multi_select") return false;
  const choices = (field.options_json as { choices?: unknown[] } | null)?.choices ?? [];
  return choices.some(isPricedChoice);
}

// 提出内容から、価格付き選択肢（コマ・オプション品等）で選ばれたものを品目として復元する。
// 数量はquantities_json（選択肢ラベルごとの個数）から取り、無効値は1個として扱う
// （submit_current_versionの金額計算と同じ扱い）。
export function extractPricedSelections(
  fields: FieldLike[],
  answers: Record<string, unknown>,
  quantities: Record<string, Record<string, number>>,
): PricedSelection[] {
  const items: PricedSelection[] = [];
  for (const field of fields) {
    if (!isPricedField(field)) continue;
    const pricedChoices = ((field.options_json as { choices?: unknown[] }).choices ?? []).filter(isPricedChoice);

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
      if (!choice) continue;
      const rawQty = quantities[field.key]?.[label];
      const quantity = Number.isFinite(rawQty) && (rawQty as number) >= 1 ? Math.min(100, Math.floor(rawQty as number)) : 1;
      items.push({ fieldKey: field.key, label: choice.label, priceYen: choice.price_yen, quantity });
    }
  }
  return items;
}

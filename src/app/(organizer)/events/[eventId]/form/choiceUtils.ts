export type Choice = string | { label: string; price_yen: number; capacity: number | null };

export function formatChoicesSummary(optionsJson: { choices?: Choice[] } | null): string | null {
  const choices = optionsJson?.choices;
  if (!choices || choices.length === 0) return null;
  return choices
    .map((c) => {
      if (typeof c === "string") return c;
      const price = c.price_yen > 0 ? `¥${c.price_yen.toLocaleString("ja-JP")}` : "無料";
      const capacity = c.capacity != null ? `・在庫${c.capacity}` : "";
      return `${c.label}（${price}${capacity}）`;
    })
    .join("、");
}

// 編集フォームの初期値用に、options_json.choices を「選択肢」欄・「価格・在庫付きの選択肢」欄の
// 生テキストへ戻す。1フィールド内の選択肢は文字列のみ or オブジェクトのみで統一されている前提。
export function serializeChoicesForEdit(optionsJson: { choices?: Choice[] } | null): {
  options: string;
  pricedOptions: string;
} {
  const choices = optionsJson?.choices ?? [];
  if (choices.length === 0) return { options: "", pricedOptions: "" };

  const hasPriced = choices.some((c) => typeof c !== "string");
  if (hasPriced) {
    const pricedOptions = choices
      .map((c) => (typeof c === "string" ? c : `${c.label},${c.price_yen || ""},${c.capacity ?? ""}`))
      .join("\n");
    return { options: "", pricedOptions };
  }

  return { options: (choices as string[]).join(","), pricedOptions: "" };
}

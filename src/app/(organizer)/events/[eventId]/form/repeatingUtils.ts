// choiceUtils.ts と対になる、繰り返し入力フィールド（options_json.repeatingFields）用のヘルパー。
export function formatRepeatingFieldsSummary(optionsJson: { repeatingFields?: string[] } | null): string | null {
  const fields = optionsJson?.repeatingFields;
  if (!fields || fields.length === 0) return null;
  return `繰り返し項目：${fields.join("、")}`;
}

export function serializeRepeatingFieldsForEdit(optionsJson: { repeatingFields?: string[] } | null): string {
  return optionsJson?.repeatingFields?.join(",") ?? "";
}

export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "number",
  "date",
  "single_select",
  "multi_select",
  "checkbox",
  "file",
  "repeating",
] as const;

export const FIELD_TYPE_LABEL: Record<string, string> = {
  short_text: "短文",
  long_text: "長文",
  number: "数値",
  date: "日付",
  single_select: "単一選択",
  multi_select: "複数選択",
  checkbox: "チェック",
  file: "ファイル",
  repeating: "繰り返し入力",
};

export const SELECT_FIELD_TYPES = new Set(["single_select", "multi_select"]);

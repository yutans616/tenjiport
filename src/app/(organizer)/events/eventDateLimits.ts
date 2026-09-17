// 終了日に上限を設けない場合、超過分の自動課金（終了日起点）が事実上無期限に
// 先延ばしされてしまい、ストレージ等のインフラ消費も塩漬けになるため、
// 「今日から最大24ヶ月以内」という上限を設ける。
// actions.ts（"use server"ファイル、async関数以外export不可）とは分離している。
export const MAX_END_DATE_MONTHS_AHEAD = 24;

// 上限日時（Date）そのもの。フォームのmax属性表示・サーバー側検証の両方が
// これ1箇所から導出する（別々にnew Date();setMonth(...)を書くと将来ズレる）。
export function maxEndDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + MAX_END_DATE_MONTHS_AHEAD);
  return d;
}

// フォームのdate input の max 属性用（YYYY-MM-DD）。toISOString()はUTC変換により
// タイムゾーンによっては日付が1日ずれるため、ローカルのgetterから直接組み立てる。
export function maxEndDateString(): string {
  const d = maxEndDate();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

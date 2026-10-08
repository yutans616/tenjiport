"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/organizer/submit-button";
import { formatLineItemsSummary, sumLineItems, type BillingLineItem } from "@/lib/billing/exhibitorBilling";

export type BulkInvoiceRow = {
  id: string;
  brandName: string;
  unbilledItems: BillingLineItem[];
  invoicedTotal: number;
  hasUnitemizedInvoice: boolean;
  hasManualInvoice: boolean;
  hasPrice: boolean;
};

function yen(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

export function BulkInvoicePreview({
  rows,
  fieldOptions,
  action,
}: {
  rows: BulkInvoiceRow[];
  fieldOptions: { key: string; label: string }[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [fieldKeys, setFieldKeys] = useState<Set<string>>(new Set(fieldOptions.map((f) => f.key)));

  const computed = rows.map((r) => {
    const items = r.unbilledItems.filter((i) => fieldKeys.has(i.field_key));
    const excludedReason = r.hasUnitemizedInvoice
      ? "品目の記録が無い以前の請求書があるため個別に作成してください"
      : !r.hasPrice
        ? "確定金額が未設定"
        : items.length === 0
          ? r.invoicedTotal > 0
            ? "選択中の項目は請求済み"
            : "選択中の項目の選択なし"
          : null;
    return { ...r, items, amount: sumLineItems(items), excludedReason };
  });
  const eligibleRows = computed.filter((r) => !r.excludedReason);
  const excludedRows = computed.filter((r) => r.excludedReason);

  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const selectedRows = eligibleRows.filter((r) => !deselected.has(r.id));
  const totalYen = selectedRows.reduce((sum, r) => sum + r.amount, 0);

  function toggleRow(id: string) {
    const next = new Set(deselected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDeselected(next);
  }

  function toggleField(key: string) {
    const next = new Set(fieldKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setFieldKeys(next);
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {fieldOptions.length > 0 && (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">請求する項目</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {fieldOptions.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="field_keys"
                  value={f.key}
                  checked={fieldKeys.has(f.key)}
                  onChange={() => toggleField(f.key)}
                  className="size-4 rounded border-input"
                />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="due_date">支払期限（全件共通）</Label>
        <Input id="due_date" type="date" name="due_date" required className="max-w-48" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="memo">主催者内部メモ（任意・出展者には表示されません）</Label>
        <Input id="memo" name="memo" className="max-w-md" />
      </div>

      {eligibleRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">発行対象（{eligibleRows.length}件）</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setDeselected(new Set())}
              >
                すべて選択
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setDeselected(new Set(eligibleRows.map((r) => r.id)))}
              >
                すべて解除
              </button>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5 rounded-lg border p-2">
            {eligibleRows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    name="participation_ids"
                    value={r.id}
                    checked={!deselected.has(r.id)}
                    onChange={() => toggleRow(r.id)}
                    className="size-4 shrink-0 rounded border-input"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2">
                      {r.brandName}
                      {r.invoicedTotal > 0 && (
                        <Badge variant="outline" className="font-normal">
                          追加請求
                        </Badge>
                      )}
                      {r.hasManualInvoice && (
                        <Badge variant="outline" className="border-amber-300 font-normal text-amber-800 dark:text-amber-400">
                          手入力の請求書あり・二重請求に注意
                        </Badge>
                      )}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{formatLineItemsSummary(r.items)}</span>
                  </span>
                </label>
                <span className="shrink-0 font-medium">{yen(r.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="text-right text-sm text-muted-foreground">
            選択中 {selectedRows.length}件 ・ 合計 {yen(totalYen)}
          </p>
        </div>
      )}

      {excludedRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">対象外（{excludedRows.length}件）</p>
          <ul className="flex flex-col gap-1.5 rounded-lg border border-dashed p-2 opacity-70">
            {excludedRows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                <span>{r.brandName}</span>
                <Badge variant="outline" className="font-normal">
                  {r.excludedReason}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SubmitButton disabled={selectedRows.length === 0} pendingText="発行処理中です...しばらくお待ちください" className="self-start">
        {selectedRows.length > 0 ? `${selectedRows.length}件を発行する` : "発行する"}
      </SubmitButton>
      <p className="text-xs text-muted-foreground">
        件数が多いほど処理に時間がかかります。発行中はボタンが無効になり、完了まで自動で待機します。
      </p>
    </form>
  );
}

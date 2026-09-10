"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/organizer/submit-button";

export type BulkInvoiceRow = {
  id: string;
  brandName: string;
  resolvedPriceYen: number | null;
  hasInvoice: boolean;
};

export function BulkInvoicePreview({
  rows,
  action,
}: {
  rows: BulkInvoiceRow[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const eligibleRows = useMemo(() => rows.filter((r) => r.resolvedPriceYen != null && !r.hasInvoice), [rows]);
  const excludedRows = useMemo(() => rows.filter((r) => r.resolvedPriceYen == null || r.hasInvoice), [rows]);
  const [selected, setSelected] = useState<Set<string>>(new Set(eligibleRows.map((r) => r.id)));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const totalYen = eligibleRows.filter((r) => selected.has(r.id)).reduce((sum, r) => sum + (r.resolvedPriceYen ?? 0), 0);

  return (
    <form action={action} className="flex flex-col gap-4">
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
                onClick={() => setSelected(new Set(eligibleRows.map((r) => r.id)))}
              >
                すべて選択
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setSelected(new Set())}
              >
                すべて解除
              </button>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5 rounded-lg border p-2">
            {eligibleRows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <label className="flex flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    name="participation_ids"
                    value={r.id}
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="size-4 rounded border-input"
                  />
                  {r.brandName}
                </label>
                <span className="font-medium">¥{(r.resolvedPriceYen ?? 0).toLocaleString("ja-JP")}</span>
              </li>
            ))}
          </ul>
          <p className="text-right text-sm text-muted-foreground">
            選択中 {selected.size}件 ・ 合計 ¥{totalYen.toLocaleString("ja-JP")}
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
                <Badge variant="outline">{r.hasInvoice ? "発行済み" : "確定金額が未設定"}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SubmitButton disabled={selected.size === 0} pendingText="発行処理中です...しばらくお待ちください" className="self-start">
        {selected.size > 0 ? `${selected.size}件を発行する` : "発行する"}
      </SubmitButton>
      <p className="text-xs text-muted-foreground">
        件数が多いほど処理に時間がかかります。発行中はボタンが無効になり、完了まで自動で待機します。
      </p>
    </form>
  );
}

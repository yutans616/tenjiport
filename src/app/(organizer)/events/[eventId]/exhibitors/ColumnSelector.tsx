"use client";

import { ChevronDown, ChevronUp, ChevronDown as ArrowDown, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ColumnDef = { key: string; label: string };

export function ColumnSelector({
  allColumns,
  order,
  checked,
  onChange,
}: {
  allColumns: ColumnDef[];
  order: string[];
  checked: Set<string>;
  onChange: (order: string[], checked: Set<string>) => void;
}) {
  const labelByKey = new Map(allColumns.map((c) => [c.key, c.label]));
  // orderに含まれない新規項目（フォーム変更などで後から増えたもの）は末尾に補う。
  const fullOrder = [...order, ...allColumns.map((c) => c.key).filter((k) => !order.includes(k))];
  const selected = fullOrder.filter((k) => checked.has(k));
  const unselected = fullOrder.filter((k) => !checked.has(k));

  function toggle(key: string) {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(fullOrder, next);
  }

  function move(key: string, direction: -1 | 1) {
    const idx = selected.indexOf(key);
    const swapWith = idx + direction;
    if (swapWith < 0 || swapWith >= selected.length) return;
    const reorderedSelected = selected.slice();
    [reorderedSelected[idx], reorderedSelected[swapWith]] = [reorderedSelected[swapWith], reorderedSelected[idx]];
    onChange([...reorderedSelected, ...unselected], checked);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
        表示項目
        {checked.size > 0 ? `（${checked.size}）` : ""}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {selected.length > 0 && (
          <>
            <DropdownMenuLabel>表示中（並べ替え可）</DropdownMenuLabel>
            <div className="flex flex-col gap-0.5 px-1 pb-1">
              {selected.map((key, i) => (
                <div key={key} className="flex items-center gap-1 rounded-md py-1 pr-1 pl-1.5 text-sm hover:bg-accent">
                  <span className="flex-1 truncate">{labelByKey.get(key) ?? key}</span>
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(key, -1)}
                    aria-label="上へ"
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={i === selected.length - 1}
                    onClick={() => move(key, 1)}
                    aria-label="下へ"
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    aria-label="非表示にする"
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>追加できる項目</DropdownMenuLabel>
        <div className="flex flex-col gap-0.5 px-1 pb-1">
          {unselected.length === 0 && <p className="px-1.5 py-1 text-xs text-muted-foreground">すべて表示中です。</p>}
          {unselected.map((key) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md py-1 px-1.5 text-sm hover:bg-accent">
              <input type="checkbox" checked={false} onChange={() => toggle(key)} className="size-4 rounded border-input" />
              {labelByKey.get(key) ?? key}
            </label>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

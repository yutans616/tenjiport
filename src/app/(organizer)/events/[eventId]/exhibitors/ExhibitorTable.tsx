"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { MultiSelectFilter } from "./MultiSelectFilter";
import { ColumnSelector, type ColumnDef } from "./ColumnSelector";
import { renderAnswerValue } from "./answerUtils";

export type ExhibitorRow = {
  id: string;
  brandName: string;
  companyName: string;
  status: string;
  createdAt: string;
  invoiceStatus: "none" | "unpaid" | "paid";
  announcementTotal: number;
  announcementAcked: number;
  resolvedPriceYen: number | null;
  answers: Record<string, unknown>;
};

const RESOLVED_PRICE_COLUMN_KEY = "__resolved_price_yen";

type AnnouncementFilterValue = "none" | "all_acked" | "has_unacked";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  invited: { label: "未提出", variant: "outline" },
  draft: { label: "下書き", variant: "outline" },
  submitted: { label: "提出済み", variant: "default" },
  revision_requested: { label: "修正依頼中", variant: "destructive" },
  confirmed: { label: "確認済み", variant: "secondary" },
  cancelled: { label: "キャンセル", variant: "outline" },
  merged: { label: "統合済み", variant: "outline" },
};

const INVOICE_LABEL: Record<ExhibitorRow["invoiceStatus"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  none: { label: "未発行", variant: "outline" },
  unpaid: { label: "未入金", variant: "destructive" },
  paid: { label: "入金済み", variant: "secondary" },
};

const ANNOUNCEMENT_FILTER_OPTIONS: { value: AnnouncementFilterValue; label: string }[] = [
  { value: "none", label: "対象なし" },
  { value: "has_unacked", label: "未確認あり" },
  { value: "all_acked", label: "全て確認済み" },
];

function announcementFilterValue(r: ExhibitorRow): AnnouncementFilterValue {
  if (r.announcementTotal === 0) return "none";
  return r.announcementAcked >= r.announcementTotal ? "all_acked" : "has_unacked";
}

const SORT_OPTIONS = {
  created_desc: "提出が新しい順",
  created_asc: "提出が古い順",
  brand_asc: "ブランド名（あいうえお順）",
} as const;
type SortKey = keyof typeof SORT_OPTIONS;

export function ExhibitorTable({
  eventId,
  rows,
  formColumns,
}: {
  eventId: string;
  rows: ExhibitorRow[];
  formColumns: ColumnDef[];
}) {
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [invoiceFilter, setInvoiceFilter] = useState<Set<string>>(new Set());
  const [announcementFilter, setAnnouncementFilter] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("created_desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allColumns = useMemo<ColumnDef[]>(
    () => [{ key: RESOLVED_PRICE_COLUMN_KEY, label: "確定金額（コマ等）" }, ...formColumns],
    [formColumns],
  );
  const storageKey = `tenjiport:exhibitor-columns:${eventId}`;
  const [columnOrder, setColumnOrder] = useState<string[]>(() => allColumns.map((c) => c.key));
  const [checkedColumns, setCheckedColumns] = useState<Set<string>>(new Set());

  useEffect(() => {
    // localStorageはSSR時に存在しないため、この読み込みはマウント後のエフェクトでしか行えない
    // （サーバー描画とクライアント初回描画を一致させ、ハイドレーション不整合を避けるため）。
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { order?: string[]; checked?: string[] };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (Array.isArray(saved.order)) setColumnOrder(saved.order);
        if (Array.isArray(saved.checked)) setCheckedColumns(new Set(saved.checked));
      }
    } catch {
      // ローカルストレージが使えない環境ではデフォルト（全項目非表示）のまま
    }
  }, [storageKey]);

  function updateColumns(order: string[], checked: Set<string>) {
    setColumnOrder(order);
    setCheckedColumns(checked);
    try {
      localStorage.setItem(storageKey, JSON.stringify({ order, checked: Array.from(checked) }));
    } catch {
      // 保存できなくても表示自体は継続する
    }
  }

  const visibleColumns = useMemo(
    () => columnOrder.filter((k) => checkedColumns.has(k)).map((k) => allColumns.find((c) => c.key === k)).filter((c): c is ColumnDef => !!c),
    [columnOrder, checkedColumns, allColumns],
  );

  function columnCellValue(row: ExhibitorRow, key: string) {
    if (key === RESOLVED_PRICE_COLUMN_KEY) {
      return row.resolvedPriceYen != null ? `¥${row.resolvedPriceYen.toLocaleString("ja-JP")}` : "-";
    }
    return renderAnswerValue(row.answers[key]);
  }

  const statusesPresent = useMemo(() => Array.from(new Set(rows.map((r) => r.status))), [rows]);
  const invoiceStatusesPresent = useMemo(() => Array.from(new Set(rows.map((r) => r.invoiceStatus))), [rows]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (statusFilter.size > 0 && !statusFilter.has(r.status)) return false;
      if (invoiceFilter.size > 0 && !invoiceFilter.has(r.invoiceStatus)) return false;
      if (announcementFilter.size > 0 && !announcementFilter.has(announcementFilterValue(r))) return false;
      return true;
    });
    const sorted = filtered.slice();
    if (sortKey === "created_desc") sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sortKey === "created_asc") sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else if (sortKey === "brand_asc") sorted.sort((a, b) => a.brandName.localeCompare(b.brandName, "ja"));
    return sorted;
  }, [rows, statusFilter, invoiceFilter, announcementFilter, sortKey]);

  const visibleIds = useMemo(() => new Set(visibleRows.map((r) => r.id)), [visibleRows]);
  const selectedVisibleCount = useMemo(
    () => Array.from(selected).filter((id) => visibleIds.has(id)).length,
    [selected, visibleIds],
  );
  const allVisibleSelected = visibleRows.length > 0 && selectedVisibleCount === visibleRows.length;
  const activeFilterCount = statusFilter.size + invoiceFilter.size + announcementFilter.size;

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">まだ提出がありません。</CardContent>
      </Card>
    );
  }

  return (
    <form method="post" action={`/events/${eventId}/exhibitors/bulk-download`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelectFilter
          label="提出状態"
          options={statusesPresent.map((s) => ({ value: s, label: STATUS_LABEL[s]?.label ?? s }))}
          selected={statusFilter}
          onChange={setStatusFilter}
        />
        <MultiSelectFilter
          label="請求書"
          options={invoiceStatusesPresent.map((s) => ({ value: s, label: INVOICE_LABEL[s as ExhibitorRow["invoiceStatus"]]?.label ?? s }))}
          selected={invoiceFilter}
          onChange={setInvoiceFilter}
        />
        <MultiSelectFilter
          label="資料確認"
          options={ANNOUNCEMENT_FILTER_OPTIONS}
          selected={announcementFilter}
          onChange={setAnnouncementFilter}
        />
        <ColumnSelector allColumns={allColumns} order={columnOrder} checked={checkedColumns} onChange={updateColumns} />
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter(new Set());
              setInvoiceFilter(new Set());
              setAnnouncementFilter(new Set());
            }}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            絞り込みをすべて解除
          </button>
        )}
        <NativeSelect
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="w-auto"
          aria-label="並べ替え"
        >
          {Object.entries(SORT_OPTIONS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <span className="text-xs text-muted-foreground">{visibleRows.length}件表示中</span>
        <Button type="submit" variant="outline" disabled={selected.size === 0} className="ml-auto">
          <Download />
          選択した{selected.size > 0 ? `${selected.size}件` : ""}をダウンロード
        </Button>
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  aria-label="表示中の全出展者を選択"
                  className="size-4 rounded border-input"
                />
              </TableHead>
              <TableHead>ブランド名</TableHead>
              <TableHead>会社名</TableHead>
              <TableHead>提出状態</TableHead>
              <TableHead>請求書</TableHead>
              <TableHead>資料確認</TableHead>
              {visibleColumns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const status = STATUS_LABEL[r.status] ?? { label: r.status, variant: "outline" as const };
              const invoice = INVOICE_LABEL[r.invoiceStatus];
              const hidden = !visibleIds.has(r.id);
              return (
                <TableRow key={r.id} hidden={hidden}>
                  <TableCell>
                    <input
                      type="checkbox"
                      name="participation_ids"
                      value={r.id}
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      aria-label={`${r.brandName}を選択`}
                      className="size-4 rounded border-input"
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/events/${eventId}/exhibitors/${r.id}`} className="block">
                      {r.brandName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Link href={`/events/${eventId}/exhibitors/${r.id}`} className="block">
                      {r.companyName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={invoice.variant}>{invoice.label}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.announcementTotal === 0 ? "対象なし" : `${r.announcementAcked}/${r.announcementTotal}件確認済み`}
                  </TableCell>
                  {visibleColumns.map((c) => (
                    <TableCell key={c.key} className="text-sm text-muted-foreground">
                      {columnCellValue(r, c.key)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </form>
  );
}

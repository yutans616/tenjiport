"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent } from "@/components/ui/card";

export type BrandRow = {
  id: string;
  brandName: string;
  companyName: string;
  createdAt: string;
  eventNames: string[];
};

type SortKey = "brand_asc" | "brand_desc" | "company_asc" | "company_desc" | "created_desc" | "created_asc";

const SORTERS: Record<SortKey, (a: BrandRow, b: BrandRow) => number> = {
  brand_asc: (a, b) => a.brandName.localeCompare(b.brandName, "ja"),
  brand_desc: (a, b) => b.brandName.localeCompare(a.brandName, "ja"),
  company_asc: (a, b) => a.companyName.localeCompare(b.companyName, "ja"),
  company_desc: (a, b) => b.companyName.localeCompare(a.companyName, "ja"),
  created_desc: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  created_asc: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
};

export function BrandListClient({ token, rows }: { token: string; rows: BrandRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("brand_asc");

  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (r) =>
            r.brandName.toLowerCase().includes(q) ||
            r.companyName.toLowerCase().includes(q) ||
            r.eventNames.some((name) => name.toLowerCase().includes(q)),
        )
      : rows;
    return [...filtered].sort(SORTERS[sortKey]);
  }, [rows, query, sortKey]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          type="search"
          placeholder="ブランド名・会社名で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <NativeSelect
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="w-40 shrink-0"
        >
          <option value="brand_asc">ブランド名（昇順）</option>
          <option value="brand_desc">ブランド名（降順）</option>
          <option value="company_asc">会社名（昇順）</option>
          <option value="company_desc">会社名（降順）</option>
          <option value="created_desc">登録が新しい順</option>
          <option value="created_asc">登録が古い順</option>
        </NativeSelect>
      </div>

      {filteredAndSorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">該当するブランドがありません。</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredAndSorted.map((row) => (
            <Link key={row.id} href={`/apply/${token}/brands/${row.id}`}>
              <Card className="transition-colors hover:border-primary/40 hover:bg-accent/40">
                <CardContent className="flex flex-col gap-1 py-3">
                  <p className="font-medium">{row.brandName}</p>
                  <p className="text-sm text-muted-foreground">{row.companyName}</p>
                  {row.eventNames.length > 0 && (
                    <p className="text-xs text-muted-foreground">参加イベント: {row.eventNames.join("、")}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

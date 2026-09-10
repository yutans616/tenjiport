"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MultiSelectFilter } from "../../exhibitors/MultiSelectFilter";

const STATUS_LABEL: Record<string, string> = {
  invited: "未提出",
  draft: "下書き",
  submitted: "提出済み",
  revision_requested: "修正依頼中",
  confirmed: "確認済み",
};

export function AudienceSelector({
  participations,
  defaultParticipationId,
  defaultAudienceType,
  defaultParticipationIds,
}: {
  participations: { id: string; brandName: string; status: string }[];
  defaultParticipationId?: string;
  defaultAudienceType?: "all" | "individual";
  defaultParticipationIds?: string[];
}) {
  const initialIds = defaultParticipationIds ?? (defaultParticipationId ? [defaultParticipationId] : []);
  const [audienceType, setAudienceType] = useState<"all" | "individual">(
    defaultAudienceType ?? (initialIds.length > 0 ? "individual" : "all"),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(initialIds));
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());

  const statusesPresent = useMemo(() => Array.from(new Set(participations.map((p) => p.status))), [participations]);

  const visible = useMemo(
    () => (statusFilter.size === 0 ? participations : participations.filter((p) => statusFilter.has(p.status))),
    [participations, statusFilter],
  );

  return (
    <div className="grid gap-2">
      <Label>公開対象</Label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="audience_type"
          value="all"
          checked={audienceType === "all"}
          onChange={() => {
            setAudienceType("all");
            setSelected(new Set());
          }}
          className="size-4"
        />
        全出展者
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="audience_type"
          value="individual"
          checked={audienceType === "individual"}
          onChange={() => setAudienceType("individual")}
          className="size-4"
        />
        個別選択
      </label>
      {participations.length > 0 && (
        <div className={`ml-6 flex flex-col gap-2 ${audienceType === "all" ? "opacity-50" : ""}`}>
          <div className="flex items-center gap-2">
            <MultiSelectFilter
              label="ステータス"
              options={statusesPresent.map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s }))}
              selected={statusFilter}
              onChange={setStatusFilter}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={audienceType === "all"}
              onClick={() => setSelected(new Set([...selected, ...visible.map((p) => p.id)]))}
            >
              表示中を全選択
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={audienceType === "all"}
              onClick={() => setSelected(new Set([...selected].filter((id) => !visible.some((p) => p.id === id))))}
            >
              表示中を解除
            </Button>
            {selected.size > 0 && <Badge variant="secondary">{selected.size}件選択中</Badge>}
          </div>
          <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-lg border p-3">
            {visible.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="participation_ids"
                  value={p.id}
                  checked={selected.has(p.id)}
                  disabled={audienceType === "all"}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(p.id);
                    else next.delete(p.id);
                    setSelected(next);
                  }}
                  className="size-4 rounded border-input"
                />
                {p.brandName}
                <Badge variant="outline" className="font-normal">
                  {STATUS_LABEL[p.status] ?? p.status}
                </Badge>
              </label>
            ))}
            {visible.length === 0 && <p className="text-sm text-muted-foreground">条件に一致する出展者がいません。</p>}
          </div>
        </div>
      )}
    </div>
  );
}

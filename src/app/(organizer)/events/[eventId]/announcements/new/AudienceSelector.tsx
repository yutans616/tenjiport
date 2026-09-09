"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";

export function AudienceSelector({
  participations,
}: {
  participations: { id: string; brandName: string }[];
}) {
  const [audienceType, setAudienceType] = useState<"all" | "individual">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        <div
          className={`ml-6 flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-lg border p-3 ${
            audienceType === "all" ? "opacity-50" : ""
          }`}
        >
          {participations.map((p) => (
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
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

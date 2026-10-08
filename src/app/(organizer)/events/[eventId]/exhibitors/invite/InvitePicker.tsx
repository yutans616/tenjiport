"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/organizer/submit-button";
import type { InviteCandidate } from "@/lib/organizer/inviteCandidates";

export function InvitePicker({
  candidates,
  projects,
  action,
  disabledReason,
}: {
  candidates: InviteCandidate[];
  projects: { id: string; name: string }[];
  action: (formData: FormData) => void | Promise<void>;
  disabledReason: string | null;
}) {
  const [projectId, setProjectId] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter(
      (c) =>
        (projectId === "all" || c.projectIds.includes(projectId)) &&
        (!q || [c.brandName, c.companyName, c.contactEmail].some((v) => v.toLowerCase().includes(q))),
    );
  }, [candidates, projectId, query]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {projects.length > 0 && (
          <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="プロジェクトで絞り込み" className="w-48">
            <option value="all">すべてのプロジェクト</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ブランド名・会社名・メールで検索" className="max-w-xs" />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">参加回数の多い順（{visible.length}件）</span>
        <div className="flex gap-3">
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setSelected(new Set([...selected, ...visible.map((c) => c.profileId)]))}
          >
            表示中をすべて選択
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
        {visible.map((c) => (
          <li key={c.profileId} className="rounded-md px-2 py-1.5 text-sm hover:bg-accent">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="profile_ids"
                value={c.profileId}
                checked={selected.has(c.profileId)}
                onChange={() => toggle(c.profileId)}
                className="size-4 shrink-0 rounded border-input"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">
                  {c.brandName}
                  {c.companyName && c.companyName !== c.brandName && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{c.companyName}</span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {c.contactEmail} ・ 直近：{c.lastEventName}
                  {c.lastEventDate ? `（${c.lastEventDate}）` : ""}
                </span>
              </span>
              <Badge variant={c.participationCount > 1 ? "default" : "outline"} className="shrink-0 font-normal">
                参加{c.participationCount}回
              </Badge>
            </label>
          </li>
        ))}
        {visible.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">該当する出展者がいません。</li>}
      </ul>

      {/* 絞り込みで非表示になった選択も送信する（チェックボックスはvisibleのみ描画されるため） */}
      {[...selected]
        .filter((id) => !visible.some((c) => c.profileId === id))
        .map((id) => (
          <input key={id} type="hidden" name="profile_ids" value={id} />
        ))}

      {disabledReason && <p className="text-sm text-destructive">{disabledReason}</p>}
      <SubmitButton disabled={selected.size === 0 || !!disabledReason} pendingText="招待を送信中..." className="self-start">
        {selected.size > 0 ? `${selected.size}件を招待してご案内を送る` : "招待してご案内を送る"}
      </SubmitButton>
    </form>
  );
}

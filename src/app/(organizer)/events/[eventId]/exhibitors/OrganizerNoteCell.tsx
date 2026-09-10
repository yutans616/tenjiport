"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { updateOrganizerNote } from "./[participationId]/actions";

// 出展者には表示されない、主催者専用の備考欄。フォーカスを外したタイミングで自動保存する。
export function OrganizerNoteCell({
  eventId,
  participationId,
  initialNote,
  rows = 1,
  compact = true,
}: {
  eventId: string;
  participationId: string;
  initialNote: string | null;
  rows?: number;
  compact?: boolean;
}) {
  const [note, setNote] = useState(initialNote ?? "");
  const [savedNote, setSavedNote] = useState(initialNote ?? "");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function handleBlur() {
    if (note === savedNote) return;
    setState("saving");
    const result = await updateOrganizerNote(eventId, participationId, note);
    if (result.ok) {
      setSavedNote(note);
      setState("idle");
    } else {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={handleBlur}
        rows={rows}
        placeholder="メモ"
        className={compact ? "min-h-8 min-w-40 resize-y text-xs" : "resize-y"}
      />
      {state === "saving" && <span className="text-[10px] text-muted-foreground">保存中...</span>}
      {state === "error" && <span className="text-[10px] text-destructive">保存に失敗しました</span>}
    </div>
  );
}

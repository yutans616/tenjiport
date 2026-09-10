"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AudienceSelector } from "../new/AudienceSelector";

type UpdateAudienceResult = { ok: true } | { ok: false; error: string };

export function AudienceEditor({
  participations,
  currentAudienceType,
  currentParticipationIds,
  updateAction,
}: {
  participations: { id: string; brandName: string; status: string }[];
  currentAudienceType: "all" | "individual" | null;
  currentParticipationIds: string[];
  updateAction: (formData: FormData) => Promise<UpdateAudienceResult>;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    setError(null);
    const result = await updateAction(formData);
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setIsEditing(false);
    router.refresh();
  }

  if (!isEditing) {
    const summary =
      currentAudienceType === "all"
        ? "全出展者"
        : currentAudienceType === "individual"
          ? `個別指定（${currentParticipationIds.length}件）`
          : "未設定";
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>公開対象: {summary}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
          編集
        </Button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">
        公開後に対象を変更した場合、新しく対象になった出展者に遡って通知メールは送られません（必要であれば「未確認者へ再通知」を使ってください）。
      </p>
      <AudienceSelector
        participations={participations}
        defaultAudienceType={currentAudienceType ?? "all"}
        defaultParticipationIds={currentParticipationIds}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving ? "保存中..." : "保存する"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)} disabled={isSaving}>
          キャンセル
        </Button>
      </div>
    </form>
  );
}

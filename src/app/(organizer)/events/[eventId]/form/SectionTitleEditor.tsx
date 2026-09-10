"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardTitle } from "@/components/ui/card";

export function SectionTitleEditor({
  title,
  updateAction,
}: {
  title: string;
  updateAction: (formData: FormData) => void | Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <form
        action={async (formData) => {
          await updateAction(formData);
          setIsEditing(false);
        }}
        className="flex flex-1 items-center gap-2"
      >
        <Input name="title" defaultValue={title} required autoFocus className="h-8 max-w-64" />
        <Button type="submit" size="sm">
          保存
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
          キャンセル
        </Button>
      </form>
    );
  }

  return (
    <button type="button" onClick={() => setIsEditing(true)} className="group flex items-center gap-1.5 text-left">
      <CardTitle className="text-base">{title}</CardTitle>
      <Pencil className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

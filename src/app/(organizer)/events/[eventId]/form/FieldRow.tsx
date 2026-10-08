"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/organizer/submit-button";
import { Badge } from "@/components/ui/badge";
import { FieldForm } from "./FieldForm";
import { FIELD_TYPE_LABEL } from "./fieldTypes";
import { formatChoicesSummary, serializeChoicesForEdit, type Choice } from "./choiceUtils";
import { formatRepeatingFieldsSummary, serializeRepeatingFieldsForEdit } from "./repeatingUtils";
import { cn } from "@/lib/utils";

export type FieldRowData = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  help_text: string | null;
  options_json: { choices?: Choice[]; repeatingFields?: string[] } | null;
};

export function FieldRow({
  field,
  updateAction,
  deleteAction,
  onMoveUp,
  onMoveDown,
  dragHandle,
  containerProps,
}: {
  field: FieldRowData;
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  dragHandle?: React.ReactNode;
  containerProps?: React.LiHTMLAttributes<HTMLLIElement>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const choicesSummary = formatChoicesSummary(field.options_json);
  const repeatingSummary = formatRepeatingFieldsSummary(field.options_json);

  if (isEditing) {
    const { options, pricedOptions } = serializeChoicesForEdit(field.options_json);
    return (
      <li {...containerProps} className={cn("rounded-lg border bg-muted/30 px-3 py-3", containerProps?.className)}>
        <FieldForm
          action={async (formData) => {
            await updateAction(formData);
            setIsEditing(false);
          }}
          initial={{
            label: field.label,
            type: field.type,
            required: field.required,
            helpText: field.help_text ?? "",
            options,
            pricedOptions,
            repeatingFields: serializeRepeatingFieldsForEdit(field.options_json),
          }}
          submitLabel="保存する"
          onCancel={() => setIsEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      {...containerProps}
      className={cn(
        "flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm",
        containerProps?.className,
      )}
    >
      <span className="flex items-center gap-2">
      {dragHandle}
      <span className="flex flex-col gap-1">
        <span className="flex items-center gap-2">
          {field.label}
          <Badge variant="secondary" className="font-normal">
            {FIELD_TYPE_LABEL[field.type] ?? field.type}
          </Badge>
          {field.required && (
            <Badge variant="outline" className="font-normal">
              必須
            </Badge>
          )}
        </span>
        {(choicesSummary ?? repeatingSummary) && (
          <span className="text-xs text-muted-foreground">{choicesSummary ?? repeatingSummary}</span>
        )}
      </span>
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          disabled={!onMoveUp}
          onClick={onMoveUp}
          title="上へ移動"
        >
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          disabled={!onMoveDown}
          onClick={onMoveDown}
          title="下へ移動"
        >
          <ChevronDown className="size-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
          編集
        </Button>
        <form action={deleteAction}>
          <SubmitButton variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" pendingText="削除中...">
            削除
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}

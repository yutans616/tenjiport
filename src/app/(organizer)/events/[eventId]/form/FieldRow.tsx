"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldForm } from "./FieldForm";
import { FIELD_TYPE_LABEL } from "./fieldTypes";
import { formatChoicesSummary, serializeChoicesForEdit, type Choice } from "./choiceUtils";

export type FieldRowData = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  help_text: string | null;
  options_json: { choices?: Choice[] } | null;
};

export function FieldRow({
  field,
  updateAction,
  deleteAction,
}: {
  field: FieldRowData;
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const choicesSummary = formatChoicesSummary(field.options_json);

  if (isEditing) {
    const { options, pricedOptions } = serializeChoicesForEdit(field.options_json);
    return (
      <li className="rounded-lg border bg-muted/30 px-3 py-3">
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
          }}
          submitLabel="保存する"
          onCancel={() => setIsEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
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
        {choicesSummary && <span className="text-xs text-muted-foreground">{choicesSummary}</span>}
      </span>
      <div className="flex shrink-0 gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
          編集
        </Button>
        <form action={deleteAction}>
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            削除
          </Button>
        </form>
      </div>
    </li>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FIELD_TYPE_LABEL, SELECT_FIELD_TYPES } from "./fieldTypes";

export type FieldFormInitial = {
  label: string;
  type: string;
  required: boolean;
  helpText: string;
  options: string;
  pricedOptions: string;
};

export function FieldForm({
  action,
  initial,
  submitLabel,
  onCancel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial?: FieldFormInitial;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const [type, setType] = useState(initial?.type ?? "short_text");
  const isSelectType = SELECT_FIELD_TYPES.has(type);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label>項目名</Label>
        <Input name="label" required defaultValue={initial?.label} />
      </div>
      <div className="grid gap-1.5">
        <Label>タイプ</Label>
        <NativeSelect name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(FIELD_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {isSelectType && (
        <>
          <div className="grid gap-1.5">
            <Label>選択肢（カンマ区切り）</Label>
            <Input name="options" placeholder="例：あり,なし" defaultValue={initial?.options} />
          </div>
          <div className="grid gap-1.5">
            <Label>価格・在庫付きの選択肢（コマ選択など。設定する場合は上の「選択肢」ではなくこちらを使用）</Label>
            <Textarea
              name="priced_options"
              rows={3}
              defaultValue={initial?.pricedOptions}
              placeholder={"1行に1つ、「選択肢名,価格円,在庫上限」の形式で入力（在庫上限は空欄で無制限）\n例：コマA(3m×3m),15000,10\nコマB(2m×2m),8000,"}
            />
            <p className="text-xs text-muted-foreground">
              入力すると、出展者の選択に応じた金額が自動計算され、出展者詳細ページに表示されます。
            </p>
          </div>
        </>
      )}
      <div className="grid gap-1.5">
        <Label>説明（任意）</Label>
        <Input name="help_text" defaultValue={initial?.helpText} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="required" className="size-4 rounded border-input" defaultChecked={initial?.required} />
        必須項目にする
      </label>
      <div className="flex gap-2">
        <Button type="submit" className="self-start">
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            キャンセル
          </Button>
        )}
      </div>
    </form>
  );
}

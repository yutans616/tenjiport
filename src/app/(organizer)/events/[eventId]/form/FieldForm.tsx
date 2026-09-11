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
  repeatingFields: string;
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
  const isRepeatingType = type === "repeating";

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
              placeholder={"例：コマA(3m×3m),15000,10\nコマB(2m×2m),8000,"}
            />
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <p>
                1行に1つ、<strong className="text-foreground">「選択肢名,価格円,在庫上限」</strong>
                の形式で入力してください（在庫上限は空欄で無制限）。
              </p>
              <p className="mt-1">
                入力すると、出展者の選択（数量含む）に応じた金額が自動計算され、出展者一覧・請求書に反映されます。
              </p>
              <p className="mt-1 font-medium text-foreground">
                ※価格は請求書発行に使用されるため、必ず税込金額で入力してください。
              </p>
            </div>
          </div>
        </>
      )}
      {isRepeatingType && (
        <div className="grid gap-1.5">
          <Label>繰り返す項目（カンマ区切り）</Label>
          <Input name="repeating_fields" placeholder="例：氏名,所属,メールアドレス" defaultValue={initial?.repeatingFields} />
          <p className="text-xs text-muted-foreground">
            出展者は「追加する」ボタンで、ここで指定した項目のセットを何行でも入力できます（例：スタッフを複数人分、車両を複数台分など）。
          </p>
        </div>
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

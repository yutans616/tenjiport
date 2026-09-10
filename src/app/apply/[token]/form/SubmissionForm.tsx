"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitExhibitorForm, uploadSubmissionFile } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Choice = string | { label: string; price_yen: number; capacity: number | null };

type FormField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  help_text: string | null;
  order: number;
  options_json: { choices?: Choice[] } | null;
};

type FormSection = {
  id: string;
  title: string;
  order: number;
  form_fields: FormField[];
};

export type ChoiceAvailability = { fieldKey: string; choiceLabel: string; capacity: number; takenCount: number };

const UNSUPPORTED_TYPES = new Set(["repeating"]);

function choiceLabel(c: Choice) {
  return typeof c === "string" ? c : c.label;
}

function choiceDisplayText(c: Choice) {
  if (typeof c === "string") return c;
  const price = c.price_yen > 0 ? `¥${c.price_yen.toLocaleString("ja-JP")}` : "無料";
  return `${c.label}（${price}）`;
}

export function SubmissionForm({
  submissionVersionId,
  sections,
  initialAnswers,
  doneHref,
  availability = [],
}: {
  submissionVersionId: string;
  sections: FormSection[];
  initialAnswers: Record<string, unknown>;
  doneHref: string;
  availability?: ChoiceAvailability[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function updateAnswer(key: string, value: unknown) {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    setSaveState("saving");

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase
        .from("submission_versions")
        .update({ data_snapshot_json: next })
        .eq("id", submissionVersionId);
      setSaveState(error ? "error" : "saved");
    }, 800);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    const result = await submitExhibitorForm(submissionVersionId, answers, honeypot);

    setIsSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    router.push(doneHref);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="sticky top-0 z-10 -mx-4 flex justify-end bg-background/80 px-4 py-1 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {saveState === "saving" && "保存中..."}
          {saveState === "saved" && "自動保存されました"}
          {saveState === "error" && "自動保存に失敗しました。通信状況をご確認ください。"}
        </p>
      </div>

      {sections
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((section) => (
          <Card key={section.id}>
            <CardHeader>
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {section.form_fields
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((field) => (
                  <FieldInput
                    key={field.id}
                    field={field}
                    value={answers[field.key]}
                    onChange={updateAnswer}
                    submissionVersionId={submissionVersionId}
                    availability={availability}
                  />
                ))}
            </CardContent>
          </Card>
        ))}

      {/* ハニーポット：人間には見えない */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          会社所在地（空欄のままにしてください）
          <input
            type="text"
            name="office_location"
            autoComplete="off"
            tabIndex={-1}
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting} size="lg">
        {isSubmitting ? "送信中..." : "この内容で提出する"}
      </Button>
    </form>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  submissionVersionId,
  availability,
}: {
  field: FormField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  submissionVersionId: string;
  availability: ChoiceAvailability[];
}) {
  function isSoldOut(c: Choice) {
    if (typeof c === "string") return false;
    const a = availability.find((x) => x.fieldKey === field.key && x.choiceLabel === c.label);
    return !!a && a.takenCount >= a.capacity;
  }
  const label = (
    <Label>
      {field.label}
      {field.required && <span className="text-destructive">*</span>}
    </Label>
  );

  if (UNSUPPORTED_TYPES.has(field.type)) {
    return (
      <div className="flex flex-col gap-1">
        {label}
        <p className="text-xs text-muted-foreground">この項目タイプは近日対応予定です。</p>
      </div>
    );
  }

  if (field.type === "file") {
    return (
      <div className="grid gap-1.5">
        {label}
        <FileFieldInput
          fieldKey={field.key}
          value={value as { fileAssetId: string; filename: string } | undefined}
          onChange={onChange}
          submissionVersionId={submissionVersionId}
        />
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  if (field.type === "long_text") {
    return (
      <div className="grid gap-1.5">
        {label}
        <Textarea
          required={field.required}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.key, e.target.value)}
          rows={4}
        />
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div className="grid gap-1.5">
        {label}
        <Input
          type="number"
          required={field.required}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <div className="grid gap-1.5">
        {label}
        <Input
          type="date"
          required={field.required}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => onChange(field.key, checked === true)} />
        {field.label}
        {field.required && <span className="text-destructive">*</span>}
      </label>
    );
  }

  if (field.type === "single_select") {
    const choices = field.options_json?.choices ?? [];
    return (
      <div className="grid gap-1.5">
        {label}
        <Select value={(value as string) ?? undefined} onValueChange={(v) => onChange(field.key, v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="選択してください" />
          </SelectTrigger>
          <SelectContent>
            {choices.map((choice) => {
              const soldOut = isSoldOut(choice);
              return (
                <SelectItem key={choiceLabel(choice)} value={choiceLabel(choice)} disabled={soldOut}>
                  {choiceDisplayText(choice)}
                  {soldOut && "（満枠）"}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === "multi_select") {
    const choices = field.options_json?.choices ?? [];
    const selected = new Set((value as string[]) ?? []);
    return (
      <div className="grid gap-2">
        {label}
        <div className="flex flex-col gap-2">
          {choices.map((choice) => {
            const l = choiceLabel(choice);
            const soldOut = isSoldOut(choice) && !selected.has(l);
            return (
              <label key={l} className={`flex items-center gap-2 text-sm ${soldOut ? "opacity-50" : ""}`}>
                <Checkbox
                  checked={selected.has(l)}
                  disabled={soldOut}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected);
                    if (checked === true) next.add(l);
                    else next.delete(l);
                    onChange(field.key, Array.from(next));
                  }}
                />
                {choiceDisplayText(choice)}
                {soldOut && "（満枠）"}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  // short_text（デフォルト）
  return (
    <div className="grid gap-1.5">
      {label}
      <Input
        type="text"
        required={field.required}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(field.key, e.target.value)}
      />
      {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
    </div>
  );
}

function FileFieldInput({
  fieldKey,
  value,
  onChange,
  submissionVersionId,
}: {
  fieldKey: string;
  value: { fileAssetId: string; filename: string } | undefined;
  onChange: (key: string, value: unknown) => void;
  submissionVersionId: string;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.set("file", file);
    const result = await uploadSubmissionFile(submissionVersionId, formData);

    setIsUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChange(fieldKey, { fileAssetId: result.fileAssetId, filename: result.filename });
  }

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">アップロード済み: {value.filename}</span>
          <label className="cursor-pointer text-primary underline-offset-4 hover:underline">
            差し替える
            <input type="file" className="hidden" onChange={handleFileChange} disabled={isUploading} />
          </label>
        </div>
      ) : (
        <label className="w-fit cursor-pointer">
          <span className="inline-flex items-center rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted">
            {isUploading ? "アップロード中..." : "ファイルを選択"}
          </span>
          <input type="file" className="hidden" onChange={handleFileChange} disabled={isUploading} />
        </label>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

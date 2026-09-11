import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
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
  options_json: { choices?: Choice[]; repeatingFields?: string[] } | null;
};

function choiceLabel(c: Choice) {
  return typeof c === "string" ? c : c.label;
}

function choiceDisplayText(c: Choice) {
  if (typeof c === "string") return c;
  const price = c.price_yen > 0 ? `¥${c.price_yen.toLocaleString("ja-JP")}` : "無料";
  const capacity = c.capacity != null ? `・在庫${c.capacity}` : "";
  return `${c.label}（${price}${capacity}）`;
}

type FormSection = {
  id: string;
  title: string;
  order: number;
  form_fields: FormField[];
};

export default async function FormPreviewPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("organizer_organization_id", context!.organizationId)
    .single();

  if (!event) notFound();

  const { data: form } = await supabase
    .from("forms")
    .select("id, status")
    .eq("event_id", eventId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!form) notFound();

  const { data: sections } = await supabase
    .from("form_sections")
    .select("id, title, order, form_fields(id, key, label, type, required, help_text, order, options_json)")
    .eq("form_id", form.id)
    .order("order", { ascending: true });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/events/${eventId}/form`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          フォーム設定に戻る
        </Link>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
          これは出展者に表示される画面のプレビューです。入力・送信はできません。
          {form.status !== "published" && "（このフォームはまだ公開されていません）"}
        </div>
      </div>

      <div className="text-center">
        <h1 className="text-lg font-semibold tracking-tight">{event.name}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">出展者情報の入力</CardTitle>
          <p className="text-sm text-muted-foreground">メールアドレスの確認後、入力を開始できます（パスワードは不要です）。</p>
        </CardHeader>
      </Card>

      {(sections as FormSection[] | null)
        ?.slice()
        .sort((a, b) => a.order - b.order)
        .map((section) => (
          <Card key={section.id}>
            <CardHeader>
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {section.form_fields.length === 0 && (
                <p className="text-sm text-muted-foreground">このセクションにはまだ項目がありません。</p>
              )}
              {section.form_fields
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((field) => (
                  <PreviewFieldInput key={field.id} field={field} />
                ))}
            </CardContent>
          </Card>
        ))}

      {(!sections || sections.length === 0) && (
        <p className="text-center text-sm text-muted-foreground">
          まだセクションがありません。「フォーム設定」でセクション・項目を追加してください。
        </p>
      )}
    </div>
  );
}

function PreviewFieldInput({ field }: { field: FormField }) {
  const label = (
    <Label>
      {field.label}
      {field.required && <span className="text-destructive">*</span>}
    </Label>
  );

  if (field.type === "repeating") {
    const subFields = field.options_json?.repeatingFields ?? [];
    return (
      <div className="grid gap-1.5">
        {label}
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          {subFields.length === 0 && <p className="text-xs text-muted-foreground">繰り返す項目が未設定です。</p>}
          {subFields.map((sub) => (
            <div key={sub} className="grid gap-1">
              <Label className="text-xs text-muted-foreground">{sub}</Label>
              <Input type="text" disabled />
            </div>
          ))}
        </div>
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  if (field.type === "file") {
    return (
      <div className="grid gap-1.5">
        {label}
        <span className="inline-flex w-fit items-center rounded-lg border border-input px-3 py-1.5 text-sm text-muted-foreground">
          ファイルを選択
        </span>
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  if (field.type === "long_text") {
    return (
      <div className="grid gap-1.5">
        {label}
        <Textarea disabled rows={4} />
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div className="grid gap-1.5">
        {label}
        <Input type="number" disabled />
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <div className="grid gap-1.5">
        {label}
        <Input type="date" disabled />
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Checkbox disabled />
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
        <Select disabled>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="選択してください" />
          </SelectTrigger>
          <SelectContent>
            {choices.map((choice) => (
              <SelectItem key={choiceLabel(choice)} value={choiceLabel(choice)}>
                {choiceDisplayText(choice)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === "multi_select") {
    const choices = field.options_json?.choices ?? [];
    return (
      <div className="grid gap-2">
        {label}
        <div className="flex flex-col gap-2">
          {choices.map((choice) => (
            <label key={choiceLabel(choice)} className="flex items-center gap-2 text-sm">
              <Checkbox disabled />
              {choiceDisplayText(choice)}
            </label>
          ))}
        </div>
      </div>
    );
  }

  // short_text（デフォルト）
  return (
    <div className="grid gap-1.5">
      {label}
      <Input type="text" disabled />
      {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
    </div>
  );
}

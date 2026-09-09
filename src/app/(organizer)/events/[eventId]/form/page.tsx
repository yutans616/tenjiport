import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import {
  addField,
  addPresetField,
  addSection,
  addSectionTemplate,
  deleteField,
  deleteSection,
  ensureDraftForm,
  publishForm,
  regeneratePublicToken,
} from "./actions";
import { SECTION_TEMPLATES } from "./templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { SuccessBanner } from "@/components/organizer/success-banner";
import { CopyButton } from "@/components/organizer/copy-button";

const PRESET_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: "brand_name", label: "ブランド名" },
  { key: "company_name", label: "会社名" },
  { key: "default_contact_name", label: "担当者氏名" },
  { key: "default_contact_email", label: "担当者メールアドレス" },
  { key: "default_contact_phone", label: "担当者電話番号" },
  { key: "website", label: "Webサイト" },
  { key: "sns_instagram", label: "Instagram" },
  { key: "sns_facebook", label: "Facebook（Meta）" },
  { key: "sns_x", label: "X（旧Twitter）" },
  { key: "sns_youtube", label: "YouTube" },
];

const FIELD_TYPE_LABEL: Record<string, string> = {
  short_text: "短文",
  long_text: "長文",
  number: "数値",
  date: "日付",
  single_select: "単一選択",
  multi_select: "複数選択",
  checkbox: "チェック",
  file: "ファイル",
  repeating: "繰り返し入力",
};

export default async function FormBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { eventId } = await params;
  const { done } = await searchParams;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name, public_form_token")
    .eq("id", eventId)
    .eq("organizer_organization_id", context!.organizationId)
    .single();

  if (!event) notFound();

  const formId = await ensureDraftForm(eventId);

  const { data: form } = await supabase.from("forms").select("id, status, published_at").eq("id", formId).single();

  const { data: sections } = await supabase
    .from("form_sections")
    .select("id, title, order, form_fields(id, key, label, type, required, help_text, order)")
    .eq("form_id", formId)
    .order("order", { ascending: true });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const publicUrl = `${appUrl}/apply/${event.public_form_token}`;

  const addSectionWithIds = addSection.bind(null, eventId, formId);
  const publishFormWithIds = publishForm.bind(null, eventId, formId);
  const regenerateTokenWithId = regeneratePublicToken.bind(null, eventId);

  const usedTemplateTitles = new Set((sections ?? []).map((s) => s.title));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8">
      <SuccessBanner done={done} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">出展者への共有URL</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            状態:{" "}
            <span className="font-medium text-foreground">
              {form?.status === "published" ? "公開中" : "下書き"}
            </span>
            {form?.published_at ? `（最終公開: ${new Date(form.published_at).toLocaleString("ja-JP")}）` : ""}
          </p>
          <div className="flex items-center gap-2">
            <p className="flex-1 break-all rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm">{publicUrl}</p>
            <CopyButton text={publicUrl} />
          </div>
          <div className="flex gap-2">
            <form action={publishFormWithIds}>
              <Button type="submit">{form?.status === "published" ? "再公開する" : "公開して出展者を募集する"}</Button>
            </form>
            <form action={regenerateTokenWithId}>
              <Button type="submit" variant="outline">
                URLを再発行(失効)
              </Button>
            </form>
            <Button
              type="button"
              variant="outline"
              render={
                <Link href={`/events/${eventId}/form/preview`} target="_blank" rel="noopener noreferrer">
                  出展者としてプレビュー
                </Link>
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            未公開のフォームは出展者から見えません。公開後も項目の追加・編集はできますが、既に入力を始めた出展者に影響する場合があります。
          </p>
          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">「イベントの状態」と「フォームの公開」の違い</p>
            <p className="mt-1">
              出展者がこのURLから入力できるようにするには、<strong className="text-foreground">両方</strong>
              が必要です。
            </p>
            <ul className="mt-1 list-disc pl-4">
              <li>イベントの状態を「公開中」にする（概要ページで設定）— イベント自体を募集受付中として扱うかどうか</li>
              <li>フォームを「公開して出展者を募集する」（このページ）— この共有URLを実際に開放するかどうか</li>
            </ul>
            <p className="mt-1">どちらか一方でも欠けると、出展者は「現在、入力フォームは準備中です」という画面になります。</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">セクション・項目</h2>

        {sections?.map((section) => (
          <Card key={section.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{section.title}</CardTitle>
              <form action={deleteSection.bind(null, eventId, section.id)}>
                <Button type="submit" variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                  <Trash2 />
                </Button>
              </form>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {(section.form_fields ?? []).length > 0 && (
                <ul className="flex flex-col gap-2">
                  {(section.form_fields ?? [])
                    .sort((a, b) => a.order - b.order)
                    .map((field) => (
                      <li
                        key={field.id}
                        className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                      >
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
                        <form action={deleteField.bind(null, eventId, field.id)}>
                          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                            削除
                          </Button>
                        </form>
                      </li>
                    ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2">
                {PRESET_FIELD_OPTIONS.map((preset) => (
                  <form key={preset.key} action={addPresetField.bind(null, eventId, section.id, preset.key)}>
                    <Button type="submit" variant="outline" size="sm" className="rounded-full">
                      + {preset.label}
                    </Button>
                  </form>
                ))}
              </div>

              <Separator />

              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                  + その他の項目を追加
                </summary>
                <form action={addField.bind(null, eventId, section.id)} className="mt-4 flex flex-col gap-4">
                  <div className="grid gap-1.5">
                    <Label>項目名</Label>
                    <Input name="label" required />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>タイプ</Label>
                    <NativeSelect name="type" defaultValue="short_text">
                      {Object.entries(FIELD_TYPE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>選択肢（単一選択・複数選択の場合、カンマ区切り）</Label>
                    <Input name="options" placeholder="例：あり,なし" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>説明（任意）</Label>
                    <Input name="help_text" />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="required" className="size-4 rounded border-input" />
                    必須項目にする
                  </label>
                  <Button type="submit" className="self-start">
                    追加する
                  </Button>
                </form>
              </details>
            </CardContent>
          </Card>
        ))}

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">セクションを追加</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                よく使うセクションをテンプレートから追加
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SECTION_TEMPLATES).map(([key, template]) => {
                  const alreadyAdded = usedTemplateTitles.has(template.title);
                  return (
                    <form key={key} action={addSectionTemplate.bind(null, eventId, formId, key)}>
                      <Button type="submit" variant="outline" size="sm" disabled={alreadyAdded}>
                        + {template.title}
                        {alreadyAdded && "（追加済み）"}
                      </Button>
                    </form>
                  );
                })}
              </div>
            </div>

            <Separator />

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">カスタムセクションを追加</p>
              <form action={addSectionWithIds} className="flex gap-2">
                <Input name="title" required placeholder="例：ブランド情報" />
                <Button type="submit">追加</Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

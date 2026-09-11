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
  copySectionsFromEvent,
  deleteField,
  deleteSection,
  ensureDraftForm,
  publishForm,
  regeneratePublicToken,
  updateField,
  updateSectionTitle,
} from "./actions";
import { SECTION_TEMPLATES } from "./templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { SuccessBanner } from "@/components/organizer/success-banner";
import { CopyButton } from "@/components/organizer/copy-button";
import { FieldForm } from "./FieldForm";
import { FieldRow } from "./FieldRow";
import { SectionTitleEditor } from "./SectionTitleEditor";

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
    .select("id, title, order, form_fields(id, key, label, type, required, help_text, order, options_json)")
    .eq("form_id", formId)
    .order("order", { ascending: true });

  const { data: otherEventsRaw } = await supabase
    .from("events")
    .select("id, name, created_at, forms(id, form_sections(id))")
    .eq("organizer_organization_id", context!.organizationId)
    .neq("id", eventId)
    .order("created_at", { ascending: false });

  const copySourceEvents = (otherEventsRaw ?? [])
    .filter((e) => (e.forms ?? []).some((f) => (f.form_sections ?? []).length > 0))
    .map((e) => ({ id: e.id, name: e.name }));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const publicUrl = `${appUrl}/apply/${event.public_form_token}`;

  const addSectionWithIds = addSection.bind(null, eventId, formId);
  const copySectionsWithIds = copySectionsFromEvent.bind(null, eventId, formId);
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
              <SectionTitleEditor title={section.title} updateAction={updateSectionTitle.bind(null, eventId, section.id)} />
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
                      <FieldRow
                        key={field.id}
                        field={field}
                        updateAction={updateField.bind(null, eventId, field.id)}
                        deleteAction={deleteField.bind(null, eventId, field.id)}
                      />
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
                <div className="mt-4">
                  <FieldForm action={addField.bind(null, eventId, section.id)} submitLabel="追加する" />
                </div>
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

            {copySourceEvents.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    他のイベントのセクション・項目をまとめてコピー
                  </p>
                  <form action={copySectionsWithIds} className="flex gap-2">
                    <NativeSelect name="sourceEventId" required defaultValue="" className="flex-1">
                      <option value="" disabled>
                        コピー元のイベントを選択
                      </option>
                      {copySourceEvents.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button type="submit" variant="outline">
                      コピーする
                    </Button>
                  </form>
                  <p className="mt-1 text-xs text-muted-foreground">
                    選択したイベントのセクション・項目をすべて、このフォームの末尾に追加します（既存のセクションは変更されません）。
                  </p>
                </div>
              </>
            )}

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

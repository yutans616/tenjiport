"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { SECTION_TEMPLATES } from "./templates";
import { FIELD_TYPES } from "./fieldTypes";

// 選択肢入力（プレーンなカンマ区切り欄・価格/在庫付きの複数行欄）を options_json に変換する。
// addField/updateField で共通利用する。
function buildOptionsJson(type: string, optionsRaw: string, pricedOptionsRaw: string): { choices: unknown[] } | null {
  if (type !== "single_select" && type !== "multi_select") return null;

  if (pricedOptionsRaw) {
    const choices = pricedOptionsRaw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [labelPart, pricePart, capacityPart] = line.split(",").map((s) => s.trim());
        const priceYen = pricePart ? Number(pricePart.replace(/[^\d]/g, "")) : 0;
        const capacity = capacityPart ? Number(capacityPart.replace(/[^\d]/g, "")) : null;
        return {
          label: labelPart,
          price_yen: Number.isFinite(priceYen) ? priceYen : 0,
          capacity: capacity !== null && Number.isFinite(capacity) ? capacity : null,
        };
      })
      .filter((c) => c.label);
    return choices.length > 0 ? { choices } : null;
  }

  if (optionsRaw) {
    return { choices: optionsRaw.split(",").map((s) => s.trim()).filter(Boolean) };
  }

  return null;
}

async function requireOrganizerEvent(eventId: string) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, organizer_organization_id")
    .eq("id", eventId)
    .eq("organizer_organization_id", context!.organizationId)
    .single();
  if (!event) throw new Error("イベントが見つかりません。");
  return { context: context!, supabase, event };
}

// フォームが無ければ下書きを1つ作成し、あれば最新のものを返す
export async function ensureDraftForm(eventId: string) {
  const { supabase, event } = await requireOrganizerEvent(eventId);

  const { data: existing } = await supabase
    .from("forms")
    .select("id")
    .eq("event_id", event.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("forms")
    .insert({ event_id: event.id, version: 1, status: "draft" })
    .select("id")
    .single();

  if (error || !created) throw new Error(`フォームの作成に失敗しました: ${error?.message}`);
  return created.id as string;
}

export async function addSection(eventId: string, formId: string, formData: FormData) {
  const { supabase } = await requireOrganizerEvent(eventId);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("セクション名は必須です。");

  const { data: sections } = await supabase
    .from("form_sections")
    .select("order")
    .eq("form_id", formId)
    .order("order", { ascending: false })
    .limit(1);

  const nextOrder = (sections?.[0]?.order ?? -1) + 1;

  const { error } = await supabase.from("form_sections").insert({ form_id: formId, title, order: nextOrder });
  if (error) throw new Error(`セクションの追加に失敗しました: ${error.message}`);

  revalidatePath(`/events/${eventId}/form`);
}

export async function deleteSection(eventId: string, sectionId: string) {
  const { supabase } = await requireOrganizerEvent(eventId);
  const { error } = await supabase.from("form_sections").delete().eq("id", sectionId);
  if (error) throw new Error(`セクションの削除に失敗しました: ${error.message}`);
  revalidatePath(`/events/${eventId}/form`);
}

export async function addSectionTemplate(eventId: string, formId: string, templateKey: string) {
  const { supabase } = await requireOrganizerEvent(eventId);
  const template = SECTION_TEMPLATES[templateKey];
  if (!template) throw new Error("不正なテンプレートです。");

  const { data: existingSections } = await supabase
    .from("form_sections")
    .select("id, title, order")
    .eq("form_id", formId)
    .order("order", { ascending: false });

  if ((existingSections ?? []).some((s) => s.title === template.title)) {
    throw new Error("このテンプレートは既に追加されています。");
  }

  const nextOrder = (existingSections?.[0]?.order ?? -1) + 1;

  const { data: section, error: sectionError } = await supabase
    .from("form_sections")
    .insert({ form_id: formId, title: template.title, order: nextOrder })
    .select("id")
    .single();
  if (sectionError || !section) throw new Error(`セクションの追加に失敗しました: ${sectionError?.message}`);

  const fieldRows = template.fields.map((f, i) => ({
    form_section_id: section.id,
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required ?? false,
    options_json: f.options ? { choices: f.options } : null,
    order: i,
  }));

  const { error: fieldsError } = await supabase.from("form_fields").insert(fieldRows);
  if (fieldsError) throw new Error(`項目の追加に失敗しました: ${fieldsError.message}`);

  revalidatePath(`/events/${eventId}/form`);
}

// 他のイベントのフォームから、セクション・項目一式をこのフォームの末尾にコピーする。
export async function copySectionsFromEvent(eventId: string, formId: string, formData: FormData) {
  const { supabase, context } = await requireOrganizerEvent(eventId);
  const sourceEventId = String(formData.get("sourceEventId") ?? "").trim();
  if (!sourceEventId) throw new Error("コピー元のイベントを選択してください。");
  if (sourceEventId === eventId) throw new Error("同じイベントからはコピーできません。");

  const { data: sourceEvent } = await supabase
    .from("events")
    .select("id")
    .eq("id", sourceEventId)
    .eq("organizer_organization_id", context.organizationId)
    .single();
  if (!sourceEvent) throw new Error("コピー元のイベントが見つかりません。");

  const { data: sourceForm } = await supabase
    .from("forms")
    .select("id")
    .eq("event_id", sourceEventId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sourceForm) throw new Error("コピー元のイベントにはフォームがありません。");

  const { data: sourceSections } = await supabase
    .from("form_sections")
    .select("id, title, order, form_fields(id, key, label, type, required, help_text, order, options_json)")
    .eq("form_id", sourceForm.id)
    .order("order", { ascending: true });
  if (!sourceSections || sourceSections.length === 0) {
    throw new Error("コピー元のイベントにはセクションがありません。");
  }

  const { data: existingSections } = await supabase
    .from("form_sections")
    .select("order")
    .eq("form_id", formId)
    .order("order", { ascending: false })
    .limit(1);
  let nextSectionOrder = (existingSections?.[0]?.order ?? -1) + 1;

  const reservedKeys = new Set(Object.keys(PRESET_FIELDS));

  for (const section of sourceSections) {
    const { data: newSection, error: sectionError } = await supabase
      .from("form_sections")
      .insert({ form_id: formId, title: section.title, order: nextSectionOrder++ })
      .select("id")
      .single();
    if (sectionError || !newSection) throw new Error(`セクションのコピーに失敗しました: ${sectionError?.message}`);

    const fields = (section.form_fields ?? []).sort((a, b) => a.order - b.order);
    if (fields.length === 0) continue;

    const fieldRows = fields.map((f) => ({
      form_section_id: newSection.id,
      key: reservedKeys.has(f.key) ? f.key : `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      label: f.label,
      type: f.type,
      required: f.required,
      help_text: f.help_text,
      options_json: f.options_json,
      order: f.order,
    }));

    const { error: fieldsError } = await supabase.from("form_fields").insert(fieldRows);
    if (fieldsError) throw new Error(`項目のコピーに失敗しました: ${fieldsError.message}`);
  }

  revalidatePath(`/events/${eventId}/form`);
}

export async function addField(eventId: string, sectionId: string, formData: FormData) {
  const { supabase } = await requireOrganizerEvent(eventId);
  const label = String(formData.get("label") ?? "").trim();
  const type = String(formData.get("type") ?? "short_text");
  const required = formData.get("required") === "on";
  const helpText = String(formData.get("help_text") ?? "").trim() || null;
  const optionsRaw = String(formData.get("options") ?? "").trim();
  const pricedOptionsRaw = String(formData.get("priced_options") ?? "").trim();

  if (!label) throw new Error("項目名は必須です。");
  if (!FIELD_TYPES.includes(type as (typeof FIELD_TYPES)[number])) {
    throw new Error("不正な項目タイプです。");
  }

  const optionsJson = buildOptionsJson(type, optionsRaw, pricedOptionsRaw);

  const key = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  const { data: fields } = await supabase
    .from("form_fields")
    .select("order")
    .eq("form_section_id", sectionId)
    .order("order", { ascending: false })
    .limit(1);

  const nextOrder = (fields?.[0]?.order ?? -1) + 1;

  const { error } = await supabase.from("form_fields").insert({
    form_section_id: sectionId,
    key,
    label,
    type,
    required,
    help_text: helpText,
    options_json: optionsJson,
    order: nextOrder,
  });
  if (error) throw new Error(`項目の追加に失敗しました: ${error.message}`);

  revalidatePath(`/events/${eventId}/form`);
}

const PRESET_FIELDS: Record<string, { label: string; type: string }> = {
  brand_name: { label: "ブランド名", type: "short_text" },
  company_name: { label: "会社名", type: "short_text" },
  default_contact_name: { label: "担当者氏名", type: "short_text" },
  default_contact_email: { label: "担当者メールアドレス", type: "short_text" },
  default_contact_phone: { label: "担当者電話番号", type: "short_text" },
  website: { label: "Webサイト", type: "short_text" },
  sns_instagram: { label: "Instagram", type: "short_text" },
  sns_facebook: { label: "Facebook（Meta）", type: "short_text" },
  sns_x: { label: "X（旧Twitter）", type: "short_text" },
  sns_youtube: { label: "YouTube", type: "short_text" },
};

// ブランド共通情報の予約キーで項目を追加する（exhibitor_profilesへの自動同期対象）
export async function addPresetField(eventId: string, sectionId: string, presetKey: string) {
  const { supabase } = await requireOrganizerEvent(eventId);
  const preset = PRESET_FIELDS[presetKey];
  if (!preset) throw new Error("不正なプリセットです。");

  const { data: fields } = await supabase
    .from("form_fields")
    .select("order")
    .eq("form_section_id", sectionId)
    .order("order", { ascending: false })
    .limit(1);
  const nextOrder = (fields?.[0]?.order ?? -1) + 1;

  const { error } = await supabase.from("form_fields").insert({
    form_section_id: sectionId,
    key: presetKey,
    label: preset.label,
    type: preset.type,
    required: presetKey === "brand_name" || presetKey === "default_contact_email",
    order: nextOrder,
  });
  if (error) throw new Error(`項目の追加に失敗しました: ${error.message}`);

  revalidatePath(`/events/${eventId}/form`);
}

export async function updateField(eventId: string, fieldId: string, formData: FormData) {
  const { supabase } = await requireOrganizerEvent(eventId);
  const label = String(formData.get("label") ?? "").trim();
  const type = String(formData.get("type") ?? "short_text");
  const required = formData.get("required") === "on";
  const helpText = String(formData.get("help_text") ?? "").trim() || null;
  const optionsRaw = String(formData.get("options") ?? "").trim();
  const pricedOptionsRaw = String(formData.get("priced_options") ?? "").trim();

  if (!label) throw new Error("項目名は必須です。");
  if (!FIELD_TYPES.includes(type as (typeof FIELD_TYPES)[number])) {
    throw new Error("不正な項目タイプです。");
  }

  const optionsJson = buildOptionsJson(type, optionsRaw, pricedOptionsRaw);

  const { error } = await supabase
    .from("form_fields")
    .update({ label, type, required, help_text: helpText, options_json: optionsJson })
    .eq("id", fieldId);
  if (error) throw new Error(`項目の更新に失敗しました: ${error.message}`);

  revalidatePath(`/events/${eventId}/form`);
}

export async function updateSectionTitle(eventId: string, sectionId: string, formData: FormData) {
  const { supabase } = await requireOrganizerEvent(eventId);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("セクション名は必須です。");

  const { error } = await supabase.from("form_sections").update({ title }).eq("id", sectionId);
  if (error) throw new Error(`セクション名の更新に失敗しました: ${error.message}`);

  revalidatePath(`/events/${eventId}/form`);
}

export async function deleteField(eventId: string, fieldId: string) {
  const { supabase } = await requireOrganizerEvent(eventId);
  const { error } = await supabase.from("form_fields").delete().eq("id", fieldId);
  if (error) throw new Error(`項目の削除に失敗しました: ${error.message}`);
  revalidatePath(`/events/${eventId}/form`);
}

export async function publishForm(eventId: string, formId: string) {
  const { supabase, context } = await requireOrganizerEvent(eventId);

  const { error } = await supabase
    .from("forms")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", formId);
  if (error) throw new Error(`公開に失敗しました: ${error.message}`);

  await supabase.from("audit_logs").insert({
    actor_user_id: context.userId,
    organization_id: context.organizationId,
    action_type: "publish",
    entity_type: "form",
    entity_id: formId,
  });

  revalidatePath(`/events/${eventId}/form`);
  redirect(`/events/${eventId}/form?done=published`);
}

export async function regeneratePublicToken(eventId: string) {
  const { supabase } = await requireOrganizerEvent(eventId);
  const { error } = await supabase
    .from("events")
    .update({ public_form_token: crypto.randomUUID() })
    .eq("id", eventId);
  if (error) throw new Error(`URLの再発行に失敗しました: ${error.message}`);
  revalidatePath(`/events/${eventId}/form`);
  redirect(`/events/${eventId}/form?done=regenerated`);
}

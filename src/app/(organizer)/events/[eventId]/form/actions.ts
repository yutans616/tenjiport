"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { SECTION_TEMPLATES } from "./templates";

const FIELD_TYPES = [
  "short_text",
  "long_text",
  "number",
  "date",
  "single_select",
  "multi_select",
  "checkbox",
  "file",
  "repeating",
] as const;

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

  let optionsJson: { choices: unknown[] } | null = null;
  if (type === "single_select" || type === "multi_select") {
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
      if (choices.length > 0) optionsJson = { choices };
    } else if (optionsRaw) {
      optionsJson = { choices: optionsRaw.split(",").map((s) => s.trim()).filter(Boolean) };
    }
  }

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

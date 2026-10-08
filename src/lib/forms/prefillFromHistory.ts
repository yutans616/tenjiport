import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isPricedField } from "@/lib/forms/pricedSelections";

type FieldDef = { key: string; type: string; options_json: unknown };

// 出展者プロフィールに保存されている値（ブランド共通情報テンプレートの予約キーに対応）。
function profileAnswers(profile: Record<string, unknown> | null): Record<string, unknown> {
  if (!profile) return {};
  const sns = (profile.sns_links as Record<string, unknown> | null) ?? {};
  const placeholder = (v: unknown) => (v === "未設定" ? null : v);
  const values: Record<string, unknown> = {
    brand_name: placeholder(profile.brand_name),
    company_name: placeholder(profile.company_name),
    address: profile.address,
    website: profile.website,
    description: profile.description,
    default_contact_name: profile.default_contact_name,
    default_contact_email: profile.default_contact_email,
    default_contact_phone: profile.default_contact_phone,
    sns_instagram: sns.instagram,
    sns_facebook: sns.facebook,
    sns_x: sns.x,
    sns_youtube: sns.youtube,
  };
  return Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "string" && v.trim() !== ""));
}

function choiceLabels(field: FieldDef): string[] {
  const choices = (field.options_json as { choices?: unknown[] } | null)?.choices ?? [];
  return choices.map((c) => (typeof c === "string" ? c : (c as { label?: string })?.label)).filter((l): l is string => !!l);
}

// 今回のフォームにある項目だけに絞り、今回のフォームでは成り立たない値を落とす。
// ファイル・価格付き選択肢（コマ・オプション品＝在庫と金額が開催ごとに違う）は引き継がない。
function fitToForm(fields: FieldDef[], answers: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = answers[field.key];
    if (value === undefined || value === null || value === "") continue;
    if (field.type === "file" || isPricedField(field)) continue;
    if (field.type === "single_select") {
      if (typeof value === "string" && choiceLabels(field).includes(value)) result[field.key] = value;
    } else if (field.type === "multi_select") {
      const labels = choiceLabels(field);
      const kept = Array.isArray(value) ? value.filter((v) => typeof v === "string" && labels.includes(v)) : [];
      if (kept.length > 0) result[field.key] = kept;
    } else {
      result[field.key] = value;
    }
  }
  return result;
}

// 新しいイベントで初めてフォームを開いたときの初期値。同じ組織の過去イベントでの最新の提出内容
// （同じ項目キーの回答）を基に、ブランド名・連絡先などはプロフィールの最新値で上書きする。
// 過去イベントは終了・非公開のものも含むため、出展者本人のプロフィールIDに限定したうえで
// service roleで参照する（RLSでは公開中のイベントしか出展者から見えないため）。
export async function buildPrefillAnswers(params: {
  participationId: string;
  fields: FieldDef[];
}): Promise<Record<string, unknown>> {
  const db = createServiceRoleClient();
  const { data: participation } = await db
    .from("event_participations")
    .select("id, exhibitor_profile_id, events(organizer_organization_id), exhibitor_profiles(*)")
    .eq("id", params.participationId)
    .single();
  if (!participation) return {};
  const event = Array.isArray(participation.events) ? participation.events[0] : participation.events;
  const profile = Array.isArray(participation.exhibitor_profiles) ? participation.exhibitor_profiles[0] : participation.exhibitor_profiles;

  let previous: Record<string, unknown> = {};
  if (event?.organizer_organization_id) {
    const { data: others } = await db
      .from("event_participations")
      .select("id, events!inner(organizer_organization_id)")
      .eq("exhibitor_profile_id", participation.exhibitor_profile_id)
      .eq("events.organizer_organization_id", event.organizer_organization_id)
      .neq("id", participation.id)
      .neq("status", "merged");
    const otherIds = (others ?? []).map((o) => o.id);
    if (otherIds.length > 0) {
      const { data: versions } = await db
        .from("submission_versions")
        .select("data_snapshot_json, submitted_at")
        .in("event_participation_id", otherIds)
        .neq("status", "draft")
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(1);
      previous = (versions?.[0]?.data_snapshot_json as Record<string, unknown>) ?? {};
    }
  }

  return fitToForm(params.fields, { ...previous, ...profileAnswers(profile as Record<string, unknown> | null) });
}

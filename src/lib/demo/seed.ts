import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  DEMO_ORGANIZER_EMAIL,
  DEMO_BACKGROUND_EXHIBITOR_EMAIL,
  DEMO_FEATURED_EXHIBITOR_EMAIL,
} from "@/lib/demo/constants";

// アプリ内「最初に戻す」・深夜リセット用のTS版シードロジック。
// 初回ブートストラップ（デモ組織・デモ用authユーザーの作成）は scripts/seed-demo.mjs を
// 先に実行しておく前提だが、このモジュール単体でも同じ内容を冪等に再構築できる。
// ロジックを変更する場合は scripts/seed-demo.mjs 側も合わせて更新すること。

type ExhibitorDef = {
  name: string;
  submitted: boolean;
  ackBaseline: boolean;
  paid: boolean;
  featured?: boolean;
};

const EXHIBITOR_DEFS: ExhibitorDef[] = [
  { name: "サンプル物産株式会社", submitted: true, ackBaseline: true, paid: true },
  { name: "テンジ工房合同会社", submitted: true, ackBaseline: true, paid: true },
  { name: "有限会社みらいクラフト", submitted: true, ackBaseline: true, paid: true },
  { name: "株式会社ノーザンベイク", submitted: true, ackBaseline: true, paid: true },
  { name: "さくらフーズ株式会社", submitted: true, ackBaseline: true, paid: true },
  { name: "株式会社グリーンリーフ", submitted: true, ackBaseline: true, paid: true },
  { name: "一般社団法人てくてくマルシェ", submitted: true, ackBaseline: true, paid: true },
  { name: "株式会社ブルーウェーブ", submitted: true, ackBaseline: false, paid: true },
  { name: "有限会社ことのは雑貨店", submitted: true, ackBaseline: false, paid: false },
  { name: "株式会社ソライロデザイン", submitted: false, ackBaseline: false, paid: false, featured: true },
  { name: "なでしこ手仕事舎", submitted: false, ackBaseline: false, paid: false },
  { name: "株式会社ヒノデ商会", submitted: false, ackBaseline: false, paid: false },
];

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

async function findOrCreateUser(db: SupabaseClient, email: string) {
  let page = 1;
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) break;
    page += 1;
  }
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return data.user;
}

async function deleteEventTree(db: SupabaseClient, eventId: string) {
  const { data: participations } = await db.from("event_participations").select("id").eq("event_id", eventId);
  const participationIds = (participations ?? []).map((p: { id: string }) => p.id);

  const { data: announcements } = await db.from("announcements").select("id").eq("event_id", eventId);
  const announcementIds = (announcements ?? []).map((a: { id: string }) => a.id);
  if (announcementIds.length > 0) {
    await db.from("announcements").update({ current_version_id: null }).in("id", announcementIds);
    const { data: versions } = await db.from("announcement_versions").select("id").in("announcement_id", announcementIds);
    const versionIds = (versions ?? []).map((v: { id: string }) => v.id);
    if (versionIds.length > 0) {
      await db.from("acknowledgements").delete().in("announcement_version_id", versionIds);
      await db.from("announcement_audiences").delete().in("announcement_version_id", versionIds);
      await db.from("announcement_attachments").delete().in("announcement_version_id", versionIds);
    }
    await db.from("announcement_versions").delete().in("announcement_id", announcementIds);
    await db.from("announcements").delete().in("id", announcementIds);
  }

  if (participationIds.length > 0) {
    await db.from("notification_deliveries").delete().in("event_participation_id", participationIds);
    const { data: invoices } = await db.from("exhibitor_invoices").select("id").in("event_participation_id", participationIds);
    const invoiceIds = (invoices ?? []).map((i: { id: string }) => i.id);
    if (invoiceIds.length > 0) await db.from("invoice_change_logs").delete().in("exhibitor_invoice_id", invoiceIds);
    await db.from("exhibitor_invoices").delete().in("event_participation_id", participationIds);
    const { data: submissions } = await db
      .from("submission_versions")
      .select("id")
      .in("event_participation_id", participationIds);
    const submissionIds = (submissions ?? []).map((s: { id: string }) => s.id);
    if (submissionIds.length > 0) await db.from("revision_requests").delete().in("submission_version_id", submissionIds);
    await db.from("submission_versions").delete().in("event_participation_id", participationIds);
  }
  await db.from("event_participations").delete().eq("event_id", eventId);

  const { data: forms } = await db.from("forms").select("id").eq("event_id", eventId);
  const formIds = (forms ?? []).map((f: { id: string }) => f.id);
  if (formIds.length > 0) {
    const { data: sections } = await db.from("form_sections").select("id").in("form_id", formIds);
    const sectionIds = (sections ?? []).map((s: { id: string }) => s.id);
    if (sectionIds.length > 0) await db.from("form_fields").delete().in("form_section_id", sectionIds);
    await db.from("form_sections").delete().in("form_id", formIds);
    await db.from("forms").delete().in("id", formIds);
  }

  await db.from("events").delete().eq("id", eventId);
}

export type DemoResetResult = {
  organizationId: string;
  eventId: string;
  publicFormToken: string;
};

/**
 * デモ組織のイベント配下データ（フォーム・出展者参加・提出・資料・請求書・通知）を
 * 全て削除し、初期状態（tenjiport_demo_lp_spec.md 4.1節の状態配分）で作り直す。
 * デモ組織・デモ用authユーザー自体は作り直さず再利用する。
 * デモ組織が存在しない場合はエラーになる（初回はscripts/seed-demo.mjsを実行すること）。
 */
export async function resetDemoEnvironment(): Promise<DemoResetResult> {
  const db = createServiceRoleClient();

  const { data: org, error: orgError } = await db
    .from("organizer_organizations")
    .select("id")
    .eq("is_demo", true)
    .single();
  if (orgError || !org) {
    throw new Error("デモ組織が見つかりません。先に scripts/seed-demo.mjs を実行してください。");
  }
  const orgId = org.id as string;

  const organizerUser = await findOrCreateUser(db, DEMO_ORGANIZER_EMAIL);
  const backgroundExhibitorUser = await findOrCreateUser(db, DEMO_BACKGROUND_EXHIBITOR_EMAIL);
  const featuredExhibitorUser = await findOrCreateUser(db, DEMO_FEATURED_EXHIBITOR_EMAIL);

  await db
    .from("organizer_memberships")
    .upsert(
      { organization_id: orgId, user_id: organizerUser.id, role: "owner", status: "active" },
      { onConflict: "organization_id,user_id" },
    );

  const { data: existingEvents } = await db.from("events").select("id").eq("organizer_organization_id", orgId);
  for (const ev of existingEvents ?? []) {
    await deleteEventTree(db, ev.id as string);
  }

  const { data: event, error: eventError } = await db
    .from("events")
    .insert({
      organizer_organization_id: orgId,
      name: "テンジポート サンプル展示会",
      venue: "サンプル会場（架空）",
      start_date: futureDate(30),
      end_date: futureDate(32),
      status: "open",
    })
    .select("id, public_form_token")
    .single();
  if (eventError || !event) throw eventError ?? new Error("デモイベントの作成に失敗しました。");
  const eventId = event.id as string;

  const { data: form, error: formError } = await db
    .from("forms")
    .insert({ event_id: eventId, version: 1, status: "published", published_at: new Date().toISOString() })
    .select("id")
    .single();
  if (formError || !form) throw formError ?? new Error("デモフォームの作成に失敗しました。");

  const { data: section, error: sectionError } = await db
    .from("form_sections")
    .insert({ form_id: form.id, title: "出展ブース情報", order: 0 })
    .select("id")
    .single();
  if (sectionError || !section) throw sectionError ?? new Error("デモフォームセクションの作成に失敗しました。");

  const { error: fieldsError } = await db.from("form_fields").insert([
    { form_section_id: section.id, key: "booth_size", label: "希望ブースサイズ", type: "single_select", required: true, order: 0, options_json: ["S", "M", "L"] },
    { form_section_id: section.id, key: "power_needed", label: "電源利用の希望", type: "checkbox", required: false, order: 1 },
    { form_section_id: section.id, key: "notes", label: "備考", type: "long_text", required: false, order: 2 },
  ]);
  if (fieldsError) throw fieldsError;

  // モジュールスコープのEXHIBITOR_DEFSは複数リクエスト間で共有されるため、書き込み用の
  // ローカルコピーを作る（並行実行時の競合・前回実行分の値の混入を避けるため）。
  const runtimeExhibitors: (ExhibitorDef & { participationId?: string; ownerUserId?: string })[] = EXHIBITOR_DEFS.map(
    (def) => ({ ...def }),
  );

  for (const [i, def] of runtimeExhibitors.entries()) {
    const ownerUser = def.featured ? featuredExhibitorUser : backgroundExhibitorUser;
    const idx = i + 1;
    const contactEmail = `demo-contact-${String(idx).padStart(2, "0")}@example.com`;

    const { data: profile, error: profileError } = await db
      .from("exhibitor_profiles")
      .insert({
        brand_name: def.name,
        company_name: def.name,
        default_contact_name: `担当 太郎${idx}`,
        default_contact_email: contactEmail,
        default_contact_phone: "00-0000-0000",
        created_by_user_id: ownerUser.id,
      })
      .select("id")
      .single();
    if (profileError || !profile) throw profileError ?? new Error("デモ出展者プロフィールの作成に失敗しました。");

    await db
      .from("exhibitor_memberships")
      .upsert(
        { user_id: ownerUser.id, exhibitor_profile_id: profile.id, role: "owner", status: "active" },
        { onConflict: "user_id,exhibitor_profile_id" },
      );

    const { data: participation, error: participationError } = await db
      .from("event_participations")
      .insert({
        event_id: eventId,
        exhibitor_profile_id: profile.id,
        status: def.submitted ? "confirmed" : "invited",
        first_submitted_at: def.submitted ? new Date().toISOString() : null,
        is_billable: true,
      })
      .select("id")
      .single();
    if (participationError || !participation) throw participationError ?? new Error("デモ参加登録の作成に失敗しました。");

    if (def.submitted) {
      const { error: submissionError } = await db.from("submission_versions").insert({
        event_participation_id: participation.id,
        form_id: form.id,
        version_number: 1,
        status: "confirmed",
        data_snapshot_json: { booth_size: "M", power_needed: true, notes: "デモ用のサンプル回答です。" },
        submitted_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        confirmed_by_user_id: ownerUser.id,
      });
      if (submissionError) throw submissionError;
    }

    const { error: invoiceError } = await db.from("exhibitor_invoices").insert({
      event_participation_id: participation.id,
      organizer_organization_id: orgId,
      amount_yen: 30000,
      due_date: futureDate(20),
      invoice_ack_status: def.paid ? "confirmed" : "unconfirmed",
      invoice_ack_at: def.paid ? new Date().toISOString() : null,
      invoice_ack_by_user_id: def.paid ? ownerUser.id : null,
      payment_status: def.paid ? "paid" : "unpaid",
      paid_at: def.paid ? new Date().toISOString() : null,
      organizer_internal_memo: "デモ用サンプル請求書",
      created_by_user_id: organizerUser.id,
    });
    if (invoiceError) throw invoiceError;

    def.participationId = participation.id as string;
    def.ownerUserId = ownerUser.id;
  }

  const { data: announcement, error: announcementError } = await db
    .from("announcements")
    .insert({ event_id: eventId, created_by_user_id: organizerUser.id, ack_required: true })
    .select("id")
    .single();
  if (announcementError || !announcement) throw announcementError ?? new Error("デモ資料の作成に失敗しました。");

  const { data: version, error: versionError } = await db
    .from("announcement_versions")
    .insert({
      announcement_id: announcement.id,
      version_number: 1,
      title: "搬入案内",
      body: "会場への搬入経路・時間帯についてのご案内です（デモ用サンプル本文）。",
      status: "published",
      published_at: new Date().toISOString(),
      published_by_user_id: organizerUser.id,
    })
    .select("id")
    .single();
  if (versionError || !version) throw versionError ?? new Error("デモ資料バージョンの作成に失敗しました。");

  await db.from("announcements").update({ current_version_id: version.id }).eq("id", announcement.id);
  await db.from("announcement_audiences").insert({
    announcement_version_id: version.id,
    audience_type: "all",
    group_tags: [],
    event_participation_ids: [],
  });

  for (const def of runtimeExhibitors) {
    if (!def.participationId || !def.ownerUserId) continue;
    await db.from("notification_deliveries").insert({
      event_participation_id: def.participationId,
      channel: "email",
      template_type: "announcement_publish",
      related_entity_type: "announcement_version",
      related_entity_id: version.id,
      idempotency_key: `demo-seed:${def.participationId}:${version.id}`,
      status: "sent",
      provider_message_id: "demo-seed-not-actually-sent",
    });
    if (def.ackBaseline) {
      await db.from("acknowledgements").insert({
        announcement_version_id: version.id,
        event_participation_id: def.participationId,
        acknowledged_by_user_id: def.ownerUserId,
      });
    }
  }

  return { organizationId: orgId, eventId, publicFormToken: event.public_form_token as string };
}

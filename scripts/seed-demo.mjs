// デモ環境（実環境シード方式）のシードスクリプト。tenjiport_demo_lp_spec.md 4章参照。
// 実行: node --env-file=.env.local scripts/seed-demo.mjs
//
// 冪等性: is_demo=trueの組織が既に存在する場合、そのイベント配下（フォーム・参加・提出・
// 資料・請求書・通知）だけを一度削除してから作り直す（「最初に戻す」と同じロジック）。
// 組織自体・デモ用authユーザーは使い回す（毎回作り直すと不要なauth.usersが積み上がるため）。
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です（.env.local を確認）");
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const DEMO_ORG_NAME = "テンジポート サンプル展示会（デモ）";
const DEMO_ORGANIZER_EMAIL = "demo-organizer@example.com";
const DEMO_BACKGROUND_EXHIBITOR_EMAIL = "demo-background-exhibitor@example.com";
const DEMO_FEATURED_EXHIBITOR_EMAIL = "demo-featured-exhibitor@example.com";

async function findUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function findOrCreateUser(email) {
  const existing = await findUserByEmail(email);
  if (existing) return existing;
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return data.user;
}

async function main() {
  console.log("[1/8] デモ用authユーザーを準備...");
  const organizerUser = await findOrCreateUser(DEMO_ORGANIZER_EMAIL);
  const backgroundExhibitorUser = await findOrCreateUser(DEMO_BACKGROUND_EXHIBITOR_EMAIL);
  const featuredExhibitorUser = await findOrCreateUser(DEMO_FEATURED_EXHIBITOR_EMAIL);
  console.log(`  organizer=${organizerUser.id} background=${backgroundExhibitorUser.id} featured=${featuredExhibitorUser.id}`);

  console.log("[2/8] デモ組織を準備...");
  let { data: org } = await db.from("organizer_organizations").select("id").eq("is_demo", true).maybeSingle();
  if (!org) {
    const { data: created, error } = await db
      .from("organizer_organizations")
      .insert({ name: DEMO_ORG_NAME, billing_email: DEMO_ORGANIZER_EMAIL, is_demo: true, billing_exempt: true })
      .select("id")
      .single();
    if (error) throw error;
    org = created;
  }
  const orgId = org.id;
  console.log(`  organizationId=${orgId}`);

  await db
    .from("organizer_memberships")
    .upsert(
      { organization_id: orgId, user_id: organizerUser.id, role: "owner", status: "active" },
      { onConflict: "organization_id,user_id" },
    );

  console.log("[3/8] 既存のデモイベントを削除（リセット）...");
  const { data: existingEvents } = await db.from("events").select("id").eq("organizer_organization_id", orgId);
  for (const ev of existingEvents ?? []) {
    await deleteEventTree(ev.id);
  }

  console.log("[4/8] デモイベントを作成...");
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
  if (eventError) throw eventError;
  const eventId = event.id;

  console.log("[5/8] サンプルフォームを作成...");
  const { data: form, error: formError } = await db
    .from("forms")
    .insert({ event_id: eventId, version: 1, status: "published", published_at: new Date().toISOString() })
    .select("id")
    .single();
  if (formError) throw formError;
  const { data: section, error: sectionError } = await db
    .from("form_sections")
    .insert({ form_id: form.id, title: "出展ブース情報", order: 0 })
    .select("id")
    .single();
  if (sectionError) throw sectionError;
  const fieldDefs = [
    { key: "booth_size", label: "希望ブースサイズ", type: "single_select", required: true, order: 0, options_json: ["S", "M", "L"] },
    { key: "power_needed", label: "電源利用の希望", type: "checkbox", required: false, order: 1 },
    { key: "notes", label: "備考", type: "long_text", required: false, order: 2 },
  ];
  const { error: fieldsError } = await db
    .from("form_fields")
    .insert(fieldDefs.map((f) => ({ form_section_id: section.id, ...f })));
  if (fieldsError) throw fieldsError;

  console.log("[6/8] 出展者12社を作成...");
  const exhibitorDefs = [
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

  const participations = [];
  let seq = 1;
  for (const def of exhibitorDefs) {
    const ownerUser = def.featured ? featuredExhibitorUser : backgroundExhibitorUser;
    const contactEmail = `demo-contact-${String(seq).padStart(2, "0")}@example.com`;

    const { data: profile, error: profileError } = await db
      .from("exhibitor_profiles")
      .insert({
        brand_name: def.name,
        company_name: def.name,
        default_contact_name: `担当 太郎${seq}`,
        default_contact_email: contactEmail,
        default_contact_phone: "00-0000-0000",
        created_by_user_id: ownerUser.id,
      })
      .select("id")
      .single();
    if (profileError) throw profileError;

    await db.from("exhibitor_memberships").upsert(
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
    if (participationError) throw participationError;

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

    const dueDate = futureDate(20);
    const { error: invoiceError } = await db.from("exhibitor_invoices").insert({
      event_participation_id: participation.id,
      organizer_organization_id: orgId,
      amount_yen: 30000,
      due_date: dueDate,
      invoice_ack_status: def.paid ? "confirmed" : "unconfirmed",
      invoice_ack_at: def.paid ? new Date().toISOString() : null,
      invoice_ack_by_user_id: def.paid ? ownerUser.id : null,
      payment_status: def.paid ? "paid" : "unpaid",
      paid_at: def.paid ? new Date().toISOString() : null,
      organizer_internal_memo: "デモ用サンプル請求書",
      created_by_user_id: organizerUser.id,
    });
    if (invoiceError) throw invoiceError;

    participations.push({ ...def, seq, profileId: profile.id, participationId: participation.id, ownerUserId: ownerUser.id });
    seq += 1;
  }

  console.log("[7/8] ベースラインの資料（旧資料）を作成し、確認状況の初期値を設定...");
  const { data: announcement, error: announcementError } = await db
    .from("announcements")
    .insert({ event_id: eventId, created_by_user_id: organizerUser.id, ack_required: true })
    .select("id")
    .single();
  if (announcementError) throw announcementError;

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
  if (versionError) throw versionError;

  await db.from("announcements").update({ current_version_id: version.id }).eq("id", announcement.id);

  await db.from("announcement_audiences").insert({
    announcement_version_id: version.id,
    audience_type: "all",
    group_tags: [],
    event_participation_ids: [],
  });

  for (const p of participations) {
    // 通知配信は「送信済み」として履歴のみ残す（deliverの再送対象=pendingにはしない）
    await db.from("notification_deliveries").insert({
      event_participation_id: p.participationId,
      channel: "email",
      template_type: "announcement_publish",
      related_entity_type: "announcement_version",
      related_entity_id: version.id,
      idempotency_key: `demo-seed:${p.participationId}:${version.id}`,
      status: "sent",
      provider_message_id: "demo-seed-not-actually-sent",
    });
    if (p.ackBaseline) {
      await db.from("acknowledgements").insert({
        announcement_version_id: version.id,
        event_participation_id: p.participationId,
        acknowledged_by_user_id: p.ownerUserId,
      });
    }
  }

  console.log("[8/8] 完了。サマリ:");
  const { data: finalEvent } = await db.from("events").select("public_form_token").eq("id", eventId).single();
  const featured = participations.find((p) => p.featured);
  console.log({
    organizerOrganizationId: orgId,
    eventId,
    publicFormToken: finalEvent.public_form_token,
    demoOrganizerEmail: DEMO_ORGANIZER_EMAIL,
    featuredExhibitor: { name: featured.name, participationId: featured.participationId },
    counts: {
      submitted: participations.filter((p) => p.submitted).length,
      notSubmitted: participations.filter((p) => !p.submitted).length,
      ackBaseline: participations.filter((p) => p.ackBaseline).length,
      notAckBaseline: participations.filter((p) => !p.ackBaseline).length,
      paid: participations.filter((p) => p.paid).length,
      unpaid: participations.filter((p) => !p.paid).length,
    },
  });
}

async function deleteEventTree(eventId) {
  const { data: participations } = await db.from("event_participations").select("id").eq("event_id", eventId);
  const participationIds = (participations ?? []).map((p) => p.id);

  const { data: announcements } = await db.from("announcements").select("id").eq("event_id", eventId);
  const announcementIds = (announcements ?? []).map((a) => a.id);
  if (announcementIds.length > 0) {
    await db.from("announcements").update({ current_version_id: null }).in("id", announcementIds);
    const { data: versions } = await db.from("announcement_versions").select("id").in("announcement_id", announcementIds);
    const versionIds = (versions ?? []).map((v) => v.id);
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
    await db.from("invoice_change_logs").delete().in(
      "exhibitor_invoice_id",
      (await db.from("exhibitor_invoices").select("id").in("event_participation_id", participationIds)).data?.map((i) => i.id) ?? [],
    );
    await db.from("exhibitor_invoices").delete().in("event_participation_id", participationIds);
    await db.from("revision_requests").delete().in(
      "submission_version_id",
      (await db.from("submission_versions").select("id").in("event_participation_id", participationIds)).data?.map((s) => s.id) ?? [],
    );
    await db.from("submission_versions").delete().in("event_participation_id", participationIds);
  }
  await db.from("event_participations").delete().eq("event_id", eventId);

  const { data: forms } = await db.from("forms").select("id").eq("event_id", eventId);
  const formIds = (forms ?? []).map((f) => f.id);
  if (formIds.length > 0) {
    const { data: sections } = await db.from("form_sections").select("id").in("form_id", formIds);
    const sectionIds = (sections ?? []).map((s) => s.id);
    if (sectionIds.length > 0) await db.from("form_fields").delete().in("form_section_id", sectionIds);
    await db.from("form_sections").delete().in("form_id", formIds);
    await db.from("forms").delete().in("id", formIds);
  }

  await db.from("events").delete().eq("id", eventId);
}

function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

main()
  .then(() => {
    console.log("done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("seed-demo failed:", err);
    process.exit(1);
  });

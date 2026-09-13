// QA用の固定デモセッションを作成・再シードするスクリプト。tenjiport_demo_lp_spec.md 4章参照。
// 実行: node --env-file=.env.local scripts/seed-demo.mjs
//
// 本番の実訪問者は/demo/appへのアクセスごとにランダムなトークンでエフェメラルな
// デモ組織を発行される（訪問者ごとの完全分離、4.3節P2。src/lib/demo/ephemeral.ts参照）。
// このスクリプトは、Playwright録画・PDF素材撮影・E2Eテストなど「毎回同じデータで
// 再現したい」自動化ツール専用に、固定トークン（QA_STABLE_DEMO_TOKEN、
// src/lib/demo/constants.tsと同じ値）のセッションを1つだけ使い回す。
// ロジックを変更する場合は src/lib/demo/{ephemeral,seed}.ts 側も合わせて更新すること。
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です（.env.local を確認）");
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// src/lib/demo/constants.ts の QA_STABLE_DEMO_TOKEN と同じ値。
const QA_STABLE_DEMO_TOKEN = "qa-stable-session";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

async function createDemoUser(email) {
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return data.user;
}

async function ensureQaSession() {
  const { data: existing } = await db.from("demo_sessions").select("*").eq("token", QA_STABLE_DEMO_TOKEN).maybeSingle();
  if (existing) {
    // QA用セッションは期限切れでも作り直さず、そのまま使い回して期限だけ延長する
    // （自動化ツールの認証情報を毎回作り直す必要はないため）。
    await db
      .from("demo_sessions")
      .update({ expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString() })
      .eq("token", QA_STABLE_DEMO_TOKEN);
    return {
      organizationId: existing.organization_id,
      organizerUserId: existing.organizer_user_id,
      backgroundExhibitorUserId: existing.background_exhibitor_user_id,
      featuredExhibitorUserId: existing.featured_exhibitor_user_id,
    };
  }

  console.log("[1/2] QA用authユーザー・組織を新規作成...");
  const organizerUser = await createDemoUser(`demo-${QA_STABLE_DEMO_TOKEN}-organizer@example.com`);
  const backgroundUser = await createDemoUser(`demo-${QA_STABLE_DEMO_TOKEN}-background@example.com`);
  const featuredUser = await createDemoUser(`demo-${QA_STABLE_DEMO_TOKEN}-featured@example.com`);

  const { data: org, error: orgError } = await db
    .from("organizer_organizations")
    .insert({
      name: "テンジポート サンプル展示会（デモ）",
      billing_email: organizerUser.email,
      is_demo: true,
      billing_exempt: true,
    })
    .select("id")
    .single();
  if (orgError) throw orgError;

  await db.from("organizer_memberships").insert({
    organization_id: org.id,
    user_id: organizerUser.id,
    role: "owner",
    status: "active",
  });

  await db.from("demo_sessions").insert({
    token: QA_STABLE_DEMO_TOKEN,
    organization_id: org.id,
    organizer_user_id: organizerUser.id,
    background_exhibitor_user_id: backgroundUser.id,
    featured_exhibitor_user_id: featuredUser.id,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });

  return {
    organizationId: org.id,
    organizerUserId: organizerUser.id,
    backgroundExhibitorUserId: backgroundUser.id,
    featuredExhibitorUserId: featuredUser.id,
  };
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

  const { data: fileAssets } = await db.from("file_assets").select("id, storage_key").eq("event_id", eventId);
  if (fileAssets && fileAssets.length > 0) {
    const storageKeys = fileAssets.map((f) => f.storage_key).filter(Boolean);
    if (storageKeys.length > 0) await db.storage.from("files").remove(storageKeys);
    await db.from("file_assets").delete().eq("event_id", eventId);
  }

  const { error: eventDeleteError } = await db.from("events").delete().eq("id", eventId);
  if (eventDeleteError) throw new Error(`イベント削除に失敗しました（event_id=${eventId}）: ${eventDeleteError.message}`);
}

function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { organizationId: orgId, organizerUserId, backgroundExhibitorUserId, featuredExhibitorUserId } = await ensureQaSession();
  console.log(`  organizationId=${orgId}`);

  console.log("[2/2] イベント配下データを再構築...");

  await db.from("organizer_bank_accounts").upsert({
    organization_id: orgId,
    company_name: "株式会社テンジポート",
    postal_code: "100-0001",
    address: "東京都千代田区サンプル1-2-3（架空）",
    phone_number: "00-0000-0000",
    qualified_invoice_registration_number: "T1234567890123",
    bank_name: "サンプル銀行",
    branch_name: "サンプル支店",
    account_type: "普通",
    account_number: "1234567",
    account_holder_name: "カ）テンジポート",
  });

  const { data: existingEvents } = await db.from("events").select("id").eq("organizer_organization_id", orgId);
  for (const ev of existingEvents ?? []) {
    await deleteEventTree(ev.id);
  }

  // 出展者プロフィールは毎回新規作成するため、前回シード分を先に削除しないと
  // 再実行のたびに同名プロフィールが積み上がってしまう。
  const { data: existingProfiles } = await db
    .from("exhibitor_profiles")
    .select("id")
    .in("created_by_user_id", [backgroundExhibitorUserId, featuredExhibitorUserId]);
  const existingProfileIds = (existingProfiles ?? []).map((p) => p.id);
  if (existingProfileIds.length > 0) {
    await db.from("organizer_exhibitor_codes").delete().eq("organization_id", orgId).in("exhibitor_profile_id", existingProfileIds);
    await db.from("exhibitor_memberships").delete().in("exhibitor_profile_id", existingProfileIds);
    const { error: oldProfileDeleteError } = await db.from("exhibitor_profiles").delete().in("id", existingProfileIds);
    if (oldProfileDeleteError) throw new Error(`前回分の出展者プロフィール削除に失敗しました: ${oldProfileDeleteError.message}`);
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
  if (eventError) throw eventError;
  const eventId = event.id;

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

  const exhibitorDefs = [
    { name: "サンプル物産株式会社", submitted: true, ackBaseline: true, paid: false, noInvoiceYet: true },
    { name: "テンジ工房合同会社", submitted: true, ackBaseline: true, paid: false, noInvoiceYet: true },
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
    const ownerUserId = def.featured ? featuredExhibitorUserId : backgroundExhibitorUserId;
    const contactEmail = `demo-contact-${String(seq).padStart(2, "0")}@example.com`;

    const { data: profile, error: profileError } = await db
      .from("exhibitor_profiles")
      .insert({
        brand_name: def.name,
        company_name: def.name,
        default_contact_name: `担当 太郎${seq}`,
        default_contact_email: contactEmail,
        default_contact_phone: "00-0000-0000",
        created_by_user_id: ownerUserId,
      })
      .select("id")
      .single();
    if (profileError) throw profileError;

    await db.from("exhibitor_memberships").upsert(
      { user_id: ownerUserId, exhibitor_profile_id: profile.id, role: "owner", status: "active" },
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
        resolved_price_yen: def.noInvoiceYet ? 30000 : null,
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
        confirmed_by_user_id: ownerUserId,
      });
      if (submissionError) throw submissionError;
    }

    if (!def.noInvoiceYet) {
      const { error: invoiceError } = await db.from("exhibitor_invoices").insert({
        event_participation_id: participation.id,
        organizer_organization_id: orgId,
        amount_yen: 30000,
        due_date: futureDate(20),
        invoice_ack_status: def.paid ? "confirmed" : "unconfirmed",
        invoice_ack_at: def.paid ? new Date().toISOString() : null,
        invoice_ack_by_user_id: def.paid ? ownerUserId : null,
        payment_status: def.paid ? "paid" : "unpaid",
        paid_at: def.paid ? new Date().toISOString() : null,
        organizer_internal_memo: "デモ用サンプル請求書",
        created_by_user_id: organizerUserId,
      });
      if (invoiceError) throw invoiceError;
    }

    participations.push({ ...def, seq, profileId: profile.id, participationId: participation.id, ownerUserId });
    seq += 1;
  }

  const { data: announcement, error: announcementError } = await db
    .from("announcements")
    .insert({ event_id: eventId, created_by_user_id: organizerUserId, ack_required: true })
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
      published_by_user_id: organizerUserId,
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

  console.log("完了。サマリ:");
  const { data: finalEvent } = await db.from("events").select("public_form_token").eq("id", eventId).single();
  const featured = participations.find((p) => p.featured);
  console.log({
    qaStableDemoToken: QA_STABLE_DEMO_TOKEN,
    organizerOrganizationId: orgId,
    eventId,
    publicFormToken: finalEvent.public_form_token,
    featuredExhibitor: { name: featured.name, participationId: featured.participationId },
    counts: {
      submitted: participations.filter((p) => p.submitted).length,
      notSubmitted: participations.filter((p) => !p.submitted).length,
      ackBaseline: participations.filter((p) => p.ackBaseline).length,
      notAckBaseline: participations.filter((p) => !p.ackBaseline).length,
      paid: participations.filter((p) => p.paid).length,
      unpaid: participations.filter((p) => !p.paid && !p.noInvoiceYet).length,
      noInvoiceYet: participations.filter((p) => p.noInvoiceYet).length,
    },
  });
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

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { deleteEventTree, seedDemoEventData } from "@/lib/demo/seed";

// 訪問者ごとの完全分離（tenjiport_demo_lp_spec.md 4.3節P2）。
// 訪問者ごとに専用の組織・出展者アカウント（authユーザー）を発行し、demo_sessionsで
// ブラウザのCookie（トークン）と対応付ける。同時に複数の訪問者がいても、互いの操作
// （絞り込み・資料公開・入金確認など）が他の訪問者の画面に影響しない。

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2時間。アクセスのたびにスライド延長する。

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function createDemoUser(db: SupabaseClient, email: string) {
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return data.user;
}

export type DemoSessionRecord = {
  token: string;
  organizationId: string;
  organizerUserId: string;
  backgroundExhibitorUserId: string;
  featuredExhibitorUserId: string;
  expiresAt: string;
};

/**
 * 新しいエフェメラルなデモ組織・authユーザー3件（主催者・背景用出展者・注目出展者）を
 * 発行し、初期データを投入する。preferredTokenを指定しない場合はランダムなトークンを
 * 発行する（実訪問者用）。自動化スクリプト（Playwright録画・PDF素材撮影等）は
 * QA_STABLE_DEMO_TOKENなど固定トークンを渡し、実行のたびにゴミが積み上がるのを防ぐ。
 */
export async function createEphemeralDemoSession(preferredToken?: string): Promise<DemoSessionRecord> {
  const db = createServiceRoleClient();
  const token = preferredToken ?? randomToken();

  const organizerUser = await createDemoUser(db, `demo-${token}-organizer@example.com`);
  const backgroundUser = await createDemoUser(db, `demo-${token}-background@example.com`);
  const featuredUser = await createDemoUser(db, `demo-${token}-featured@example.com`);

  const { data: org, error: orgError } = await db
    .from("organizer_organizations")
    .insert({
      name: "テンジポート サンプル展示会（デモ）",
      billing_email: organizerUser.email!,
      is_demo: true,
      billing_exempt: true,
    })
    .select("id")
    .single();
  if (orgError || !org) throw orgError ?? new Error("デモ組織の作成に失敗しました。");
  const organizationId = org.id as string;

  const { error: membershipError } = await db.from("organizer_memberships").insert({
    organization_id: organizationId,
    user_id: organizerUser.id,
    role: "owner",
    status: "active",
  });
  if (membershipError) throw membershipError;

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const { error: sessionError } = await db.from("demo_sessions").insert({
    token,
    organization_id: organizationId,
    organizer_user_id: organizerUser.id,
    background_exhibitor_user_id: backgroundUser.id,
    featured_exhibitor_user_id: featuredUser.id,
    expires_at: expiresAt,
  });
  if (sessionError) throw sessionError;

  await seedDemoEventData(db, {
    organizationId,
    organizerUserId: organizerUser.id,
    backgroundExhibitorUserId: backgroundUser.id,
    featuredExhibitorUserId: featuredUser.id,
  });

  // 新規セッション発行のたびに、期限切れの他セッションを少しずつ片付ける
  // （Cronの実行頻度に依存しない自然な掃除。1回あたりを軽くするため件数を絞る）。
  cleanupExpiredDemoSessions(5).catch((err) => console.warn("expired demo session cleanup failed:", err));

  return {
    token,
    organizationId,
    organizerUserId: organizerUser.id,
    backgroundExhibitorUserId: backgroundUser.id,
    featuredExhibitorUserId: featuredUser.id,
    expiresAt,
  };
}

/**
 * Cookieのトークンからセッションを探し、有効ならスライド延長して返す。
 * 見つからない・期限切れの場合は（期限切れなら先に破棄したうえで）新規発行する。
 */
export async function getOrCreateDemoSession(cookieToken: string | undefined): Promise<DemoSessionRecord> {
  if (cookieToken) {
    const db = createServiceRoleClient();
    const { data: existing } = await db.from("demo_sessions").select("*").eq("token", cookieToken).maybeSingle();
    if (existing) {
      if (new Date(existing.expires_at as string) > new Date()) {
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
        await db.from("demo_sessions").update({ expires_at: expiresAt }).eq("token", cookieToken);
        return {
          token: existing.token as string,
          organizationId: existing.organization_id as string,
          organizerUserId: existing.organizer_user_id as string,
          backgroundExhibitorUserId: existing.background_exhibitor_user_id as string,
          featuredExhibitorUserId: existing.featured_exhibitor_user_id as string,
          expiresAt,
        };
      }
      await deleteEphemeralDemoSession(existing.token as string);
    }
  }
  return createEphemeralDemoSession();
}

/** 指定した組織のセッション情報（背景/注目出展者のuser_id等）を取得する。「最初に戻す」用。 */
export async function getDemoSessionByOrganization(organizationId: string): Promise<DemoSessionRecord | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from("demo_sessions").select("*").eq("organization_id", organizationId).maybeSingle();
  if (!data) return null;
  return {
    token: data.token as string,
    organizationId: data.organization_id as string,
    organizerUserId: data.organizer_user_id as string,
    backgroundExhibitorUserId: data.background_exhibitor_user_id as string,
    featuredExhibitorUserId: data.featured_exhibitor_user_id as string,
    expiresAt: data.expires_at as string,
  };
}

/** エフェメラルなデモ組織を丸ごと破棄する（組織・出展者・3つのauthユーザーまで含む）。 */
export async function deleteEphemeralDemoSession(token: string): Promise<void> {
  const db = createServiceRoleClient();
  const { data: session } = await db.from("demo_sessions").select("*").eq("token", token).maybeSingle();
  if (!session) return;

  const organizationId = session.organization_id as string;
  const userIds = [
    session.organizer_user_id as string,
    session.background_exhibitor_user_id as string,
    session.featured_exhibitor_user_id as string,
  ];

  const { data: events } = await db.from("events").select("id").eq("organizer_organization_id", organizationId);
  for (const ev of events ?? []) {
    await deleteEventTree(db, ev.id as string);
  }

  // organizer_exhibitor_codes（請求書番号の取引先コード）・audit_logsは
  // exhibitor_profiles / organizer_organizations 双方への外部キーを持つため、
  // プロフィール・組織を削除する前にこの組織分をまとめて消しておく必要がある
  // （実際にこれらを消さずに削除しようとして失敗した経験から追加）。
  await db.from("organizer_exhibitor_codes").delete().eq("organization_id", organizationId);
  await db.from("audit_logs").delete().eq("organization_id", organizationId);
  await db.from("organizer_invitations").delete().eq("organization_id", organizationId);

  // billing_exempt組織なので通常は存在しないはずだが、念のため依存関係の順で消しておく。
  const { data: contracts } = await db.from("service_contracts").select("id").eq("organizer_organization_id", organizationId);
  const contractIds = (contracts ?? []).map((c: { id: string }) => c.id);
  if (contractIds.length > 0) {
    await db.from("usage_ledger").delete().in("service_contract_id", contractIds);
    await db.from("service_invoices").delete().in("service_contract_id", contractIds);
    await db.from("service_contracts").delete().in("id", contractIds);
  }

  const { data: profiles } = await db.from("exhibitor_profiles").select("id").in("created_by_user_id", userIds);
  const profileIds = (profiles ?? []).map((p: { id: string }) => p.id);
  if (profileIds.length > 0) {
    await db.from("exhibitor_memberships").delete().in("exhibitor_profile_id", profileIds);
    const { error: profileDeleteError } = await db.from("exhibitor_profiles").delete().in("id", profileIds);
    if (profileDeleteError) {
      throw new Error(`出展者プロフィール削除に失敗しました（token=${token}）: ${profileDeleteError.message}`);
    }
  }

  await db.from("organizer_memberships").delete().eq("organization_id", organizationId);
  await db.from("organizer_bank_accounts").delete().eq("organization_id", organizationId);
  await db.from("demo_sessions").delete().eq("token", token);

  const { error: orgDeleteError } = await db.from("organizer_organizations").delete().eq("id", organizationId);
  if (orgDeleteError) {
    throw new Error(`デモ組織削除に失敗しました（token=${token}, org=${organizationId}）: ${orgDeleteError.message}`);
  }

  for (const userId of userIds) {
    const { error: userDeleteError } = await db.auth.admin.deleteUser(userId);
    if (userDeleteError) console.warn(`demo auth user削除に失敗（続行, user=${userId}）: ${userDeleteError.message}`);
  }
}

/** 期限切れのデモセッションをまとめて破棄する。深夜Cron・新規セッション発行時の両方から呼ぶ。 */
export async function cleanupExpiredDemoSessions(limit = 20): Promise<number> {
  const db = createServiceRoleClient();
  const { data: expired } = await db
    .from("demo_sessions")
    .select("token")
    .lt("expires_at", new Date().toISOString())
    .limit(limit);
  for (const row of expired ?? []) {
    await deleteEphemeralDemoSession(row.token as string);
  }
  return expired?.length ?? 0;
}

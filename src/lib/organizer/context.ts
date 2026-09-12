import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_ORG_COOKIE = "active_organization_id";

export type OrganizerContext = {
  userId: string;
  email: string | null;
  organizationId: string;
  organizationName: string;
  role: "owner" | "admin" | "staff";
};

export type ActiveMembership = {
  organizationId: string;
  organizationName: string;
  role: "owner" | "admin" | "staff";
};

/**
 * ログイン中のユーザーが所属する、有効な（status='active'）組織所属の一覧を
 * created_at昇順（＝参加が古い順）で返す。getOrganizerContext・組織切替UI・
 * 切替アクションの検証で共有する単一のソース。
 */
export const getMyActiveMemberships = cache(async (): Promise<ActiveMembership[]> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: memberships } = await supabase
    .from("organizer_memberships")
    .select("role, organizer_organizations(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  return (memberships ?? [])
    .map((m) => {
      const org = Array.isArray(m.organizer_organizations) ? m.organizer_organizations[0] : m.organizer_organizations;
      if (!org) return null;
      return {
        organizationId: org.id,
        organizationName: org.name,
        role: m.role as ActiveMembership["role"],
      };
    })
    .filter((m): m is ActiveMembership => m !== null);
});

/**
 * Data Access Layer: ログイン中の主催者ユーザーと、そのアクティブな組織所属を取得する。
 * RLS（is_organizer_member）がDB側の最終防衛線となるため、ここでの判定はUI制御・利便性のため。
 * 未ログイン、または組織未所属の場合は null を返す（呼び出し側でリダイレクト等を判断する）。
 *
 * 複数組織に所属しうる（招待機能）ため、active_organization_id Cookieで選択中の組織を
 * 覚えておく。Cookie未設定、または既に無効（除名済み等）な組織を指している場合は、
 * 最も古い所属にフォールバックする。
 */
export const getOrganizerContext = cache(async (): Promise<OrganizerContext | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const memberships = await getMyActiveMemberships();
  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const selectedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const selected = memberships.find((m) => m.organizationId === selectedOrgId) ?? memberships[0];

  return {
    userId: user.id,
    email: user.email ?? null,
    organizationId: selected.organizationId,
    organizationName: selected.organizationName,
    role: selected.role,
  };
});

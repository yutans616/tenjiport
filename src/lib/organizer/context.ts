import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type OrganizerContext = {
  userId: string;
  email: string | null;
  organizationId: string;
  organizationName: string;
  role: "owner" | "admin" | "staff";
};

/**
 * Data Access Layer: ログイン中の主催者ユーザーと、そのアクティブな組織所属を取得する。
 * RLS（is_organizer_member）がDB側の最終防衛線となるため、ここでの判定はUI制御・利便性のため。
 * 未ログイン、または組織未所属の場合は null を返す（呼び出し側でリダイレクト等を判断する）。
 */
export const getOrganizerContext = cache(async (): Promise<OrganizerContext | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // 複数組織に所属しうるようになったため（招待機能）、最も古い所属を主として扱う。
  // 組織切り替えUIは現時点では未対応。
  const { data: membership } = await supabase
    .from("organizer_memberships")
    .select("role, organizer_organizations(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership || !membership.organizer_organizations) return null;

  const org = Array.isArray(membership.organizer_organizations)
    ? membership.organizer_organizations[0]
    : membership.organizer_organizations;

  if (!org) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    organizationId: org.id,
    organizationName: org.name,
    role: membership.role as OrganizerContext["role"],
  };
});

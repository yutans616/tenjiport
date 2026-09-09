"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext } from "@/lib/organizer/context";
import { createResendClient } from "@/lib/resend";

async function requireTeamManager() {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");
  if (context.role !== "owner" && context.role !== "admin") {
    throw new Error("この操作を行う権限がありません。");
  }
  return context;
}

export async function inviteMemberAction(formData: FormData) {
  const context = await requireTeamManager();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "staff");
  if (!email) throw new Error("メールアドレスを入力してください。");
  if (role !== "admin" && role !== "staff") throw new Error("不正なロールです。");

  const supabase = await createClient();
  const { data: invitation, error: invitationError } = await supabase
    .from("organizer_invitations")
    .insert({ organization_id: context.organizationId, email, role, invited_by_user_id: context.userId })
    .select("token")
    .single();
  if (invitationError || !invitation) {
    throw new Error(`招待の作成に失敗しました: ${invitationError?.message}`);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const serviceClient = createServiceRoleClient();

  // 既存ユーザーか新規ユーザーかで発行するリンク種別を切り替える
  // （招待メールリンクはSupabase標準ではなくResendで自前送信するため、AdminAPIでトークンのみ取得する）。
  let existingUserId: string | null = null;
  let page = 1;
  while (existingUserId === null) {
    const { data: usersPage, error: listError } = await serviceClient.auth.admin.listUsers({ page, perPage: 200 });
    if (listError || !usersPage) break;
    const found = usersPage.users.find((u) => u.email?.toLowerCase() === email);
    if (found) {
      existingUserId = found.id;
      break;
    }
    if (usersPage.users.length < 200) break;
    page += 1;
  }

  const isNewUser = !existingUserId;
  const nextPath = isNewUser
    ? `/invite/accept?token=${invitation.token}&needs_password=1`
    : `/invite/accept?token=${invitation.token}`;

  const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink(
    isNewUser
      ? { type: "invite", email, options: { redirectTo: `${appUrl}${nextPath}` } }
      : { type: "magiclink", email, options: { redirectTo: `${appUrl}${nextPath}` } },
  );
  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(`招待リンクの発行に失敗しました: ${linkError?.message ?? "unknown error"}`);
  }

  const verificationType = linkData.properties.verification_type ?? (isNewUser ? "invite" : "magiclink");
  const confirmUrl = `${appUrl}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=${verificationType}&next=${encodeURIComponent(nextPath)}`;

  const roleLabel = role === "admin" ? "管理者" : "スタッフ";
  const resend = createResendClient();
  const { error: sendError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: email,
    subject: `${context.organizationName}への招待`,
    html: `
      <p>${context.organizationName} から、TenjiPortの「${roleLabel}」として招待されました。</p>
      <p>下記リンクから参加手続きを行ってください。</p>
      <p><a href="${confirmUrl}">${confirmUrl}</a></p>
      <p>このリンクは7日間有効です。</p>
    `,
  });
  if (sendError) {
    throw new Error(`招待メールの送信に失敗しました: ${sendError.message}`);
  }

  revalidatePath("/team");
  redirect("/team?done=invited");
}

export async function revokeInvitationAction(invitationId: string) {
  const context = await requireTeamManager();

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizer_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("organization_id", context.organizationId);
  if (error) throw new Error(`招待の取り消しに失敗しました: ${error.message}`);

  revalidatePath("/team");
}

export async function updateMemberRoleAction(membershipId: string, newRole: "owner" | "admin" | "staff") {
  await requireTeamManager();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_organizer_member_role", {
    p_membership_id: membershipId,
    p_new_role: newRole,
    p_new_status: "active",
  });
  if (error) throw new Error(`ロールの変更に失敗しました: ${error.message}`);
  revalidatePath("/team");
}

export async function removeMemberAction(membershipId: string, currentRole: "owner" | "admin" | "staff") {
  await requireTeamManager();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_organizer_member_role", {
    p_membership_id: membershipId,
    p_new_role: currentRole,
    p_new_status: "removed",
  });
  if (error) throw new Error(`メンバーの削除に失敗しました: ${error.message}`);
  revalidatePath("/team");
}

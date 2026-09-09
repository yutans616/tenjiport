import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext } from "@/lib/organizer/context";
import { inviteMemberAction, removeMemberAction, revokeInvitationAction, updateMemberRoleAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { SuccessBanner } from "@/components/organizer/success-banner";

const ROLE_LABEL: Record<string, string> = { owner: "オーナー", admin: "管理者", staff: "スタッフ" };

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const { done } = await searchParams;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const canManage = context.role === "owner" || context.role === "admin";
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("organizer_memberships")
    .select("id, role, status, user_id, created_at")
    .eq("organization_id", context.organizationId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const serviceClient = createServiceRoleClient();
  const emailByUserId = new Map<string, string>();
  await Promise.all(
    (members ?? []).map(async (m) => {
      const { data } = await serviceClient.auth.admin.getUserById(m.user_id);
      if (data?.user?.email) emailByUserId.set(m.user_id, data.user.email);
    }),
  );

  let invitations: { id: string; email: string; role: string; created_at: string; expires_at: string }[] = [];
  if (canManage) {
    const { data } = await supabase
      .from("organizer_invitations")
      .select("id, email, role, created_at, expires_at")
      .eq("organization_id", context.organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    invitations = data ?? [];
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <SuccessBanner done={done} />
      <div>
        <h1 className="text-xl font-semibold tracking-tight">チーム管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          イベント設定担当・請求書担当など、複数人でそれぞれのログインを使って作業できます。
        </p>
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">メンバーを招待</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={inviteMemberAction} className="flex flex-col gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="email">メールアドレス</Label>
                <Input id="email" type="email" name="email" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="role">ロール</Label>
                <NativeSelect id="role" name="role" defaultValue="staff">
                  <option value="admin">管理者（課金・チーム管理以外は全操作可）</option>
                  <option value="staff">スタッフ（課金・チーム管理以外は全操作可）</option>
                </NativeSelect>
              </div>
              <Button type="submit" className="self-start">
                招待メールを送信
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">メンバー</h2>
        {(members ?? []).map((m) => (
          <Card key={m.id}>
            <CardContent className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium">{emailByUserId.get(m.user_id) ?? "(不明)"}</p>
                <p className="text-xs text-muted-foreground">
                  {m.user_id === context.userId ? "あなた" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>{ROLE_LABEL[m.role] ?? m.role}</Badge>
                {canManage && m.user_id !== context.userId && m.role !== "owner" && (
                  <>
                    <form action={updateMemberRoleAction.bind(null, m.id, m.role === "admin" ? "staff" : "admin")}>
                      <Button type="submit" variant="outline" size="sm">
                        {m.role === "admin" ? "スタッフにする" : "管理者にする"}
                      </Button>
                    </form>
                    <form action={removeMemberAction.bind(null, m.id, m.role)}>
                      <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                        削除
                      </Button>
                    </form>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {canManage && invitations.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">招待中</h2>
          {invitations.map((inv) => (
            <Card key={inv.id}>
              <CardContent className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABEL[inv.role] ?? inv.role}として招待中（
                    {new Date(inv.expires_at).toLocaleDateString("ja-JP")}まで有効）
                  </p>
                </div>
                <form action={revokeInvitationAction.bind(null, inv.id)}>
                  <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                    取り消す
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        現在のロールは「オーナー／管理者／スタッフ」の3段階で、課金・チーム管理を除きすべて同じ操作が可能です。機能ごとの細かい権限分けは今後の対応予定です。
      </p>
    </div>
  );
}

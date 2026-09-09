import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptInviteForm } from "./AcceptInviteForm";

const ROLE_LABEL: Record<string, string> = { owner: "オーナー", admin: "管理者", staff: "スタッフ" };

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; needs_password?: string }>;
}) {
  const { token, needs_password } = await searchParams;

  if (!token) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">招待リンクが正しくありません。</p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`);
  }

  const { data: invitationRows } = await supabase.rpc("get_pending_invitation_for_token", { p_token: token });
  const invitation = invitationRows?.[0];

  if (!invitation) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-base">招待が見つかりません</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              このリンクは既に使用されたか、無効になっている可能性があります。招待した担当者にご確認ください。
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">組織への招待</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{invitation.organization_name}</strong> から
            <strong className="text-foreground">{ROLE_LABEL[invitation.role] ?? invitation.role}</strong>
            として招待されています（{invitation.email}）。
          </p>
          <AcceptInviteForm token={token} needsPassword={needs_password === "1"} />
        </CardContent>
      </Card>
    </main>
  );
}

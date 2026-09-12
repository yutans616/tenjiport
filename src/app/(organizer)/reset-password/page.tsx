import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // このページは/auth/confirm（type=recovery）を経由した直後のみ到達を想定している。
  // セッションが無い場合はリンク切れ等のため、ログイン画面へ案内する。
  if (!user) {
    redirect("/login?error=confirm_failed");
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2">
          <Image src="/tenjiport_icon.png" alt="" width={32} height={32} className="h-8 w-8" />
          <span className="text-base font-semibold tracking-tight">TenjiPort</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">新しいパスワードを設定</CardTitle>
          </CardHeader>
          <CardContent>
            <ResetPasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

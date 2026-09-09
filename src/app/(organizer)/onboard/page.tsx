import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { createOrganization } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function OnboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/onboard");
  }

  const context = await getOrganizerContext();
  if (context) {
    redirect("/events");
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight">組織を作成</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            最初にイベントを管理する組織（会社・運営チーム）を作成してください。
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">組織情報</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createOrganization} className="flex flex-col gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="name">組織名</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="billing_email">請求先メールアドレス</Label>
                <Input id="billing_email" type="email" name="billing_email" required defaultValue={user.email ?? ""} />
              </div>
              <Button type="submit" className="w-full">
                作成する
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

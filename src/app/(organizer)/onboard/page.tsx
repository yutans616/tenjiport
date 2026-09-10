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

        <form action={createOrganization} className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">組織情報</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="name">組織名</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="billing_email">請求先メールアドレス</Label>
                <Input id="billing_email" type="email" name="billing_email" required defaultValue={user.email ?? ""} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">発行元情報</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">
                出展者に発行する請求書PDFに記載されます。後から設定画面でも変更できます。
              </p>
              <div className="grid gap-1.5">
                <Label htmlFor="company_name">会社名</Label>
                <Input id="company_name" name="company_name" required placeholder="例：株式会社〇〇" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="postal_code">郵便番号</Label>
                <Input id="postal_code" name="postal_code" required placeholder="例：123-4567" className="max-w-40" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="address">住所</Label>
                <Input id="address" name="address" required placeholder="例：東京都〇〇区〇〇1-2-3" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="phone_number">電話番号</Label>
                <Input id="phone_number" name="phone_number" required placeholder="例：03-1234-5678" className="max-w-48" />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full">
            作成する
          </Button>
        </form>
      </div>
    </div>
  );
}

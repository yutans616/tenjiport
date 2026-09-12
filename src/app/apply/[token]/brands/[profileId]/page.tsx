import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateBrandProfileAction } from "../actions";
import { SubmitButton } from "@/components/organizer/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default async function ExhibitorBrandDetailPage({
  params,
}: {
  params: Promise<{ token: string; profileId: string }>;
}) {
  const { token, profileId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/apply/${token}`);

  const { data: event } = await supabase.from("events").select("id, name").eq("public_form_token", token).maybeSingle();
  if (!event) redirect(`/apply/${token}`);

  // RLS（exhibitor members can view own profile）により、このユーザーが
  // メンバーでないプロフィールはそもそも取得できず、その場合はnotFound()になる。
  const { data: profile } = await supabase
    .from("exhibitor_profiles")
    .select(
      "id, brand_name, company_name, address, website, default_contact_name, default_contact_email, default_contact_phone, description",
    )
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) notFound();

  const updateWithIds = updateBrandProfileAction.bind(null, token, profileId);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-1 flex-col gap-6 p-4 py-10">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{event.name}</p>
        <h1 className="text-lg font-semibold tracking-tight">ブランドプロフィール</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateWithIds} className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="brand_name">ブランド名</Label>
              <Input id="brand_name" name="brand_name" required defaultValue={profile.brand_name} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="company_name">会社名</Label>
              <Input id="company_name" name="company_name" required defaultValue={profile.company_name} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="website">WebサイトURL</Label>
              <Input id="website" name="website" type="url" defaultValue={profile.website ?? ""} placeholder="https://" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="address">住所</Label>
              <Input id="address" name="address" defaultValue={profile.address ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="default_contact_name">担当者名</Label>
              <Input id="default_contact_name" name="default_contact_name" defaultValue={profile.default_contact_name ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="default_contact_email">連絡先メールアドレス</Label>
                <Input
                  id="default_contact_email"
                  name="default_contact_email"
                  type="email"
                  defaultValue={profile.default_contact_email ?? ""}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="default_contact_phone">連絡先電話番号</Label>
                <Input id="default_contact_phone" name="default_contact_phone" defaultValue={profile.default_contact_phone ?? ""} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="description">ブランド紹介</Label>
              <Textarea id="description" name="description" rows={4} defaultValue={profile.description ?? ""} />
              <p className="text-xs text-muted-foreground">
                このブランド名・会社名は、次に別のイベントへ応募する際にどのブランドとして続けるかを選ぶ画面に表示されます。
              </p>
            </div>
            <SubmitButton className="self-start" pendingText="保存中...">
              保存する
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      <a href={`/apply/${token}/form`} className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
        出展者情報入力に戻る
      </a>
    </main>
  );
}

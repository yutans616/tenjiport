import { redirect } from "next/navigation";
import { getOrganizerContext } from "@/lib/organizer/context";
import { sendContactMessageAction } from "./actions";
import { SubmitButton } from "@/components/organizer/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SuccessBanner } from "@/components/organizer/success-banner";

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const { done } = await searchParams;
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
      <SuccessBanner done={done} />
      <div>
        <h1 className="text-xl font-semibold tracking-tight">お問い合わせ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          バグ報告・機能のご提案・その他のお問い合わせを受け付けています。内容によっては返信にお時間をいただく場合がございます。
        </p>
      </div>

      <form action={sendContactMessageAction} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">お問い合わせ内容</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">種別</Label>
              <NativeSelect id="category" name="category" defaultValue="other">
                <option value="bug">バグ報告</option>
                <option value="feature">機能提案</option>
                <option value="other">その他のお問い合わせ</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="subject">件名</Label>
              <Input id="subject" name="subject" required maxLength={200} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="message">内容</Label>
              <Textarea id="message" name="message" required rows={8} maxLength={5000} />
            </div>
            <SubmitButton className="self-start" pendingText="送信中...">
              送信する
            </SubmitButton>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

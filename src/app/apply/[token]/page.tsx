import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmailEntryForm } from "./EmailEntryForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ApplyEntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, venue, start_date, end_date, status, spam_guard_config")
    .eq("public_form_token", token)
    .maybeSingle();

  if (!event || event.status !== "open") {
    return (
      <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-lg font-semibold">このURLは現在ご利用いただけません</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          URLが無効か、現在出展者情報の受付を行っていない可能性があります。主催者にお問い合わせください。
        </p>
      </main>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(`/apply/${token}/form`);
  }

  const captchaEnabled = (event.spam_guard_config as { captcha_enabled?: boolean } | null)?.captcha_enabled === true;

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight">{event.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.venue ?? "会場未設定"}
            {event.start_date ? ` ／ ${event.start_date}〜${event.end_date ?? ""}` : ""}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">出展者情報の入力</CardTitle>
            <p className="text-sm text-muted-foreground">
              メールアドレスの確認後、入力を開始できます（パスワードは不要です）。
            </p>
          </CardHeader>
          <CardContent>
            <EmailEntryForm
              token={token}
              captchaEnabled={captchaEnabled}
              turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

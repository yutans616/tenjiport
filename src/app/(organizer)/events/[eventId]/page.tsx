import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { updateEvent } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SuccessBanner } from "@/components/organizer/success-banner";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { eventId } = await params;
  const { done } = await searchParams;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name, status, venue, start_date, end_date, spam_guard_config")
    .eq("id", eventId)
    .eq("organizer_organization_id", context!.organizationId)
    .single();

  if (!event) notFound();

  const updateEventWithId = updateEvent.bind(null, event.id);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
      <SuccessBanner done={done} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">概要</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateEventWithId} className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="name">イベント名</Label>
              <Input id="name" name="name" required defaultValue={event.name} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="venue">会場</Label>
              <Input id="venue" name="venue" defaultValue={event.venue ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="start_date">開始日</Label>
                <Input id="start_date" type="date" name="start_date" defaultValue={event.start_date ?? ""} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="end_date">終了日</Label>
                <Input id="end_date" type="date" name="end_date" defaultValue={event.end_date ?? ""} required />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="status">状態</Label>
              <NativeSelect key={event.status} id="status" name="status" defaultValue={event.status}>
                <option value="draft">下書き</option>
                <option value="open">公開中</option>
                <option value="closed">終了</option>
                <option value="archived">アーカイブ</option>
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                「公開中」にし、かつ「フォーム設定」ページでフォームも公開すると、出展者がフォームURLから入力できるようになります（どちらか一方だけでは入力できません）。
              </p>
            </div>
            {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="captcha_enabled"
                  className="size-4 rounded border-input"
                  defaultChecked={(event.spam_guard_config as { captcha_enabled?: boolean } | null)?.captcha_enabled === true}
                />
                出展者フォームにCAPTCHA（自動入力対策）を表示する
              </label>
            )}
            <Button type="submit" className="self-start">
              保存する
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

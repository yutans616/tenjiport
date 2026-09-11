import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { createAnnouncementDraft } from "../actions";
import { SubmitButton } from "@/components/organizer/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AudienceSelector } from "./AudienceSelector";

export default async function NewAnnouncementPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ participationId?: string }>;
}) {
  const { eventId } = await params;
  const { participationId } = await searchParams;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("organizer_organization_id", context!.organizationId)
    .single();
  if (!event) notFound();

  const { data: participations } = await supabase
    .from("event_participations")
    .select("id, status, exhibitor_profiles(brand_name)")
    .eq("event_id", eventId)
    .not("status", "in", "(cancelled,merged)");

  const createAnnouncementWithId = createAnnouncementDraft.bind(null, eventId);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">資料を作成</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">内容</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAnnouncementWithId} className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="title">タイトル</Label>
              <Input id="title" name="title" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="body">本文</Label>
              <Textarea id="body" name="body" rows={5} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="ack_required" className="size-4 rounded border-input" defaultChecked />
              「確認しました」の明示操作を必須にする
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="requires_submission"
                className="size-4 rounded border-input"
                defaultChecked={Boolean(participationId)}
              />
              出展者からのファイル提出を必須にする（ロゴ・車両証・申請書類など）
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="submission_due_date">提出期限（任意）</Label>
              <Input id="submission_due_date" type="date" name="submission_due_date" className="w-48" />
              <p className="text-xs text-muted-foreground">「出展者からのファイル提出を必須にする」を選んだ場合のみ使用されます。</p>
            </div>

            <AudienceSelector
              participations={(participations ?? []).map((p) => {
                const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
                return { id: p.id, brandName: profile?.brand_name ?? "（未設定）", status: p.status };
              })}
              defaultParticipationId={participationId}
            />

            <SubmitButton className="self-start" pendingText="作成中...">
              下書きを作成
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

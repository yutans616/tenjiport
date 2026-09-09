import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { createAnnouncementDraft } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default async function NewAnnouncementPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
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
    .select("id, exhibitor_profiles(brand_name)")
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

            <div className="grid gap-2">
              <Label>公開対象</Label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="audience_type" value="all" defaultChecked className="size-4" />
                全出展者
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="audience_type" value="individual" className="size-4" />
                個別選択
              </label>
              {participations && participations.length > 0 && (
                <div className="ml-6 flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-lg border p-3">
                  {participations.map((p) => {
                    const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="participation_ids" value={p.id} className="size-4 rounded border-input" />
                        {profile?.brand_name ?? "（未設定）"}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <Button type="submit" className="self-start">
              下書きを作成
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

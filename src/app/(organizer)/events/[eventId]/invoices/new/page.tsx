import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { createInvoice } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/organizer/submit-button";

export default async function NewInvoicePage({
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

  const createInvoiceWithId = createInvoice.bind(null, eventId);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">請求書を作成</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">内容</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createInvoiceWithId} className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="participation_id">対象の出展者</Label>
              <NativeSelect id="participation_id" name="participation_id" required>
                <option value="">選択してください</option>
                {(participations ?? []).map((p) => {
                  const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
                  return (
                    <option key={p.id} value={p.id}>
                      {profile?.brand_name ?? "（未設定）"}
                    </option>
                  );
                })}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="amount_yen">金額（円）</Label>
              <Input id="amount_yen" type="number" name="amount_yen" min={0} step={1} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="due_date">支払期限</Label>
              <Input id="due_date" type="date" name="due_date" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="file">請求書ファイル（PDF等・任意）</Label>
              <Input id="file" type="file" name="file" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="memo">主催者内部メモ（出展者には表示されません）</Label>
              <Input id="memo" name="memo" />
            </div>
            <SubmitButton pendingText="作成中..." className="self-start">
              作成して通知する
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

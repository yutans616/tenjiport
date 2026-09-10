import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { createEvent } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function NewEventPage() {
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  // プラン未選択（契約なし）の組織はまずプランを選んでもらう。
  const supabase = await createClient();
  const { data: contract } = await supabase
    .from("service_contracts")
    .select("id, plan_type, pricing_config_id")
    .eq("organizer_organization_id", context.organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (!contract) redirect("/plan");

  let baseFeeYen: number | null = null;
  if (contract.plan_type === "standard") {
    const { data: pricing } = await supabase
      .from("pricing_configs")
      .select("base_fee_yen")
      .eq("id", contract.pricing_config_id)
      .single();
    baseFeeYen = pricing?.base_fee_yen ?? null;
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">新規イベント作成</h1>

      {baseFeeYen != null && (
        <p className="text-xs text-muted-foreground">
          「作成する」を押すと、基本料金¥{baseFeeYen.toLocaleString("ja-JP")}が登録済みのお支払い方法へ即時課金されます。超過分（含まれる社数を超えた分）はイベント終了日を起点に別途自動課金されます。
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createEvent} className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="name">イベント名</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="venue">会場</Label>
              <Input id="venue" name="venue" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="start_date">開始日</Label>
                <Input id="start_date" type="date" name="start_date" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="end_date">終了日</Label>
                <Input id="end_date" type="date" name="end_date" required />
              </div>
            </div>
            <Button type="submit" className="self-start">
              作成する
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

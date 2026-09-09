import { redirect } from "next/navigation";
import { getOrganizerContext } from "@/lib/organizer/context";
import { createEvent } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function NewEventPage() {
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">新規イベント作成</h1>

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
                <Input id="end_date" type="date" name="end_date" />
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

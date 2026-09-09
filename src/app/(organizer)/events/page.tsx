import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "下書き", variant: "outline" },
  open: { label: "公開中", variant: "default" },
  closed: { label: "終了", variant: "secondary" },
  archived: { label: "アーカイブ", variant: "secondary" },
};

export default async function EventsPage() {
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("id, name, status, venue, start_date, end_date")
    .eq("organizer_organization_id", context.organizationId)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">イベント</h1>
          <p className="text-sm text-muted-foreground">出展者情報を収集するイベントを管理します。</p>
        </div>
        <Button
          render={
            <Link href="/events/new">
              <Plus />
              新規イベント作成
            </Link>
          }
        />
      </div>

      {!events || events.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            まだイベントがありません。「新規イベント作成」から始めてください。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {events.map((event) => {
            const status = STATUS_LABEL[event.status] ?? { label: event.status, variant: "outline" as const };
            return (
              <Link key={event.id} href={`/events/${event.id}`}>
                <Card className="transition-colors hover:border-primary/40 hover:bg-accent/40">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{event.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {event.venue ?? "会場未設定"}
                        {event.start_date ? ` ・ ${event.start_date} 〜 ${event.end_date ?? ""}` : ""}
                      </p>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

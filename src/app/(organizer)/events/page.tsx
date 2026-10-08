import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
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

type EventRow = { id: string; name: string; status: string; venue: string | null; start_date: string | null; end_date: string | null };

function EventCards({ events }: { events: EventRow[] }) {
  return (
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
  );
}

export default async function EventsPage() {
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const supabase = await createClient();
  const [{ data: events }, { data: projects }] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, status, venue, start_date, end_date, project_id")
      .eq("organizer_organization_id", context.organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id, name")
      .eq("organization_id", context.organizationId)
      .order("sort_order", { ascending: true }),
  ]);

  // プロジェクトを使っていない組織は従来どおりの一覧。使っている場合はプロジェクトごとにまとめる。
  const groups =
    (projects ?? []).length === 0
      ? null
      : [
          ...(projects ?? []).map((p) => ({
            key: p.id,
            title: p.name,
            href: `/projects/${p.id}`,
            events: (events ?? []).filter((e) => e.project_id === p.id),
          })),
          { key: "none", title: "未分類", href: "/projects/none", events: (events ?? []).filter((e) => !e.project_id) },
        ].filter((g) => g.events.length > 0 || g.key !== "none");

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
      ) : !groups ? (
        <EventCards events={events} />
      ) : (
        groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {g.title}
                <span className="ml-2 font-normal text-muted-foreground">{g.events.length}件</span>
              </h2>
              <Link href={g.href} className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
                横断ビュー
                <ChevronRight className="size-3.5" />
              </Link>
            </div>
            {g.events.length > 0 ? (
              <EventCards events={g.events} />
            ) : (
              <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                イベントはまだありません。
              </p>
            )}
          </section>
        ))
      )}
    </div>
  );
}

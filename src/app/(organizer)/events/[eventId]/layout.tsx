import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { EventSubNav } from "@/components/organizer/event-sub-nav";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "下書き", variant: "outline" },
  open: { label: "公開中", variant: "default" },
  closed: { label: "終了", variant: "secondary" },
  archived: { label: "アーカイブ", variant: "secondary" },
};

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name, status")
    .eq("id", eventId)
    .eq("organizer_organization_id", context.organizationId)
    .single();

  if (!event) notFound();

  const status = STATUS_LABEL[event.status] ?? { label: event.status, variant: "outline" as const };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/events"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          イベント一覧
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{event.name}</h1>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <EventSubNav eventId={event.id} />
      </div>
      {children}
    </div>
  );
}

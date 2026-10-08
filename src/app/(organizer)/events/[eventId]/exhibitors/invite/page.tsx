import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { loadInviteCandidates } from "@/lib/organizer/inviteCandidates";
import { Card, CardContent } from "@/components/ui/card";
import { inviteExhibitorsAction } from "./actions";
import { InvitePicker } from "./InvitePicker";

export default async function InviteExhibitorsPage({ params }: { params: Promise<{ eventId: string }> }) {
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

  if (context.role !== "owner" && context.role !== "admin") {
    return <p className="text-sm text-muted-foreground">出展者の招待はオーナー・管理者のみ利用できます。</p>;
  }

  const [candidates, { data: projects }, { data: form }] = await Promise.all([
    loadInviteCandidates(supabase, context.organizationId, eventId),
    supabase.from("projects").select("id, name").eq("organization_id", context.organizationId).order("sort_order"),
    supabase.from("forms").select("id").eq("event_id", eventId).eq("status", "published").limit(1).maybeSingle(),
  ]);
  const disabledReason =
    event.status !== "open" || !form
      ? "招待メールのリンクから入力できるよう、先にイベントを「公開中」にし、フォームを公開してください。"
      : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <div>
        <Link href={`/events/${eventId}/exhibitors`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          出展者一覧
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">過去のイベントから出展者を招待</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          同じ組織の過去のイベントに出展した出展者を、このイベントに招待します。招待した出展者は「未提出」として登録され、出展のご案内メールが届きます。リンクを開くと前回の内容が入力済みのフォームが表示され、出展者は内容を確認してブース等を選び提出するだけです。料金は、出展者が提出した時点で発生します（招待だけでは発生しません）。
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          案内メールの文面は「設定」＞「メール文面」の「出展のご案内」で変更できます。
        </p>
      </div>

      {candidates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            招待できる出展者がいません（過去のイベントで提出した出展者のうち、このイベントに未登録の出展者が表示されます）。
          </CardContent>
        </Card>
      ) : (
        <InvitePicker
          candidates={candidates}
          projects={projects ?? []}
          action={inviteExhibitorsAction.bind(null, eventId)}
          disabledReason={disabledReason}
        />
      )}
    </div>
  );
}

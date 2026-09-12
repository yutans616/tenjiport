import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileWarning, MailWarning, Receipt, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { updateEvent } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SuccessBanner } from "@/components/organizer/success-banner";
import { SubmitButton } from "@/components/organizer/submit-button";

// 提出パイプラインの内訳バー用の配色・順序。cancelled/mergedはパイプラインから外れた
// 状態のため、バーには含めず別途注記で件数のみ示す。
// 色は招待/下書き=中立グレー→提出済み=進行中の色→修正依頼中=要対応→確認済み=完了、
// という意味づけで選んでいる（単なる連番の識別色ではなく状態の意味に合わせた配色）。
const PIPELINE_STAGES = [
  { key: "invited", label: "未提出", barClassName: "bg-muted-foreground/25", dotClassName: "bg-muted-foreground/40" },
  { key: "draft", label: "下書き中", barClassName: "bg-[#2a78d6] dark:bg-[#3987e5]", dotClassName: "bg-[#2a78d6] dark:bg-[#3987e5]" },
  { key: "submitted", label: "提出済み", barClassName: "bg-[#1baf7a] dark:bg-[#199e70]", dotClassName: "bg-[#1baf7a] dark:bg-[#199e70]" },
  { key: "revision_requested", label: "修正依頼中", barClassName: "bg-[#ec835a]", dotClassName: "bg-[#ec835a]" },
  { key: "confirmed", label: "確認済み", barClassName: "bg-[#0ca30c]", dotClassName: "bg-[#0ca30c]" },
] as const;

function StatTile({
  href,
  icon: Icon,
  label,
  value,
  alert,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <Link href={href}>
      <Card
        className={`h-full transition-colors hover:border-primary/40 hover:bg-accent/40 ${
          alert && value > 0 ? "border-[#ec835a]/40" : ""
        }`}
      >
        <CardContent className="flex items-center gap-3 py-4">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
              alert && value > 0 ? "bg-[#ec835a]/15 text-[#ec835a]" : "bg-muted text-muted-foreground"
            }`}
          >
            <Icon className="size-4.5" />
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

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

  // 1. 提出状況の内訳（出展者数・パイプライン）。
  const { data: participations } = await supabase
    .from("event_participations")
    .select("id, status")
    .eq("event_id", eventId);
  const allParticipations = participations ?? [];
  const activeParticipations = allParticipations.filter((p) => p.status !== "cancelled" && p.status !== "merged");
  const activeParticipationIds = activeParticipations.map((p) => p.id);
  const statusCounts = new Map<string, number>();
  for (const p of activeParticipations) {
    statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1);
  }
  const cancelledCount = allParticipations.filter((p) => p.status === "cancelled").length;
  const mergedCount = allParticipations.filter((p) => p.status === "merged").length;
  const activeTotal = activeParticipations.length;

  // 2. 未確認資料件数（確認必須として公開済みの資料のうち、未確認の宛先の延べ数）。
  const { data: publishedVersions } = await supabase
    .from("announcement_versions")
    .select("id, announcement_id, announcements!announcement_versions_announcement_id_fkey(event_id, ack_required)")
    .eq("status", "published");
  const versionsForEvent = (publishedVersions ?? [])
    .map((v) => {
      const a = Array.isArray(v.announcements) ? v.announcements[0] : v.announcements;
      return { id: v.id, ackRequired: a?.ack_required ?? false, eventId: a?.event_id };
    })
    .filter((v) => v.eventId === eventId && v.ackRequired);
  const versionIds = versionsForEvent.map((v) => v.id);

  let unconfirmedCount = 0;
  if (versionIds.length > 0) {
    const activeIdSet = new Set(activeParticipationIds);
    const { data: audiences } = await supabase
      .from("announcement_audiences")
      .select("announcement_version_id, audience_type, event_participation_ids")
      .in("announcement_version_id", versionIds);
    const { data: acks } = await supabase
      .from("acknowledgements")
      .select("announcement_version_id, event_participation_id")
      .in("announcement_version_id", versionIds);
    const ackedByVersion = new Map<string, Set<string>>();
    for (const a of acks ?? []) {
      if (!ackedByVersion.has(a.announcement_version_id)) ackedByVersion.set(a.announcement_version_id, new Set());
      ackedByVersion.get(a.announcement_version_id)!.add(a.event_participation_id);
    }
    for (const audience of audiences ?? []) {
      const recipients =
        audience.audience_type === "all"
          ? activeParticipationIds
          : (audience.event_participation_ids ?? []).filter((id: string) => activeIdSet.has(id));
      const acked = ackedByVersion.get(audience.announcement_version_id) ?? new Set();
      unconfirmedCount += recipients.filter((id: string) => !acked.has(id)).length;
    }
  }

  // 3. 未入金件数。
  let unpaidCount = 0;
  if (activeParticipationIds.length > 0) {
    const { count } = await supabase
      .from("exhibitor_invoices")
      .select("id", { count: "exact", head: true })
      .in("event_participation_id", activeParticipationIds)
      .eq("payment_status", "unpaid");
    unpaidCount = count ?? 0;
  }

  // 4. 通知送信失敗件数。
  let failedNotificationCount = 0;
  if (activeParticipationIds.length > 0) {
    const { count } = await supabase
      .from("notification_deliveries")
      .select("id", { count: "exact", head: true })
      .in("event_participation_id", activeParticipationIds)
      .eq("status", "failed");
    failedNotificationCount = count ?? 0;
  }

  const updateEventWithId = updateEvent.bind(null, event.id);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8">
      <SuccessBanner done={done} />

      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{event.name}</h1>
          <p className="text-sm text-muted-foreground">ダッシュボード</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile href={`/events/${eventId}/exhibitors`} icon={Users} label="出展者数" value={activeTotal} />
          <StatTile
            href={`/events/${eventId}/announcements`}
            icon={FileWarning}
            label="未確認の資料"
            value={unconfirmedCount}
            alert
          />
          <StatTile href={`/events/${eventId}/invoices`} icon={Receipt} label="未入金" value={unpaidCount} alert />
          <StatTile
            href={`/events/${eventId}/announcements`}
            icon={MailWarning}
            label="通知の送信失敗"
            value={failedNotificationCount}
            alert
          />
        </div>

        {activeTotal > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">提出状況の内訳</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                {PIPELINE_STAGES.map((stage) => {
                  const count = statusCounts.get(stage.key) ?? 0;
                  if (count === 0) return null;
                  const widthPercent = (count / activeTotal) * 100;
                  return (
                    <div
                      key={stage.key}
                      className={`h-full ${stage.barClassName} mr-[2px] last:mr-0`}
                      style={{ width: `${widthPercent}%` }}
                      title={`${stage.label}: ${count}件`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {PIPELINE_STAGES.map((stage) => {
                  const count = statusCounts.get(stage.key) ?? 0;
                  if (count === 0) return null;
                  return (
                    <div key={stage.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={`size-2 shrink-0 rounded-full ${stage.dotClassName}`} />
                      {stage.label} {count}
                    </div>
                  );
                })}
              </div>
              {(cancelledCount > 0 || mergedCount > 0) && (
                <p className="text-xs text-muted-foreground">
                  {cancelledCount > 0 && `キャンセル ${cancelledCount}件`}
                  {cancelledCount > 0 && mergedCount > 0 && "・"}
                  {mergedCount > 0 && `統合済み ${mergedCount}件`}
                  （内訳には含まれません）
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">イベント設定</h2>
        <Card className="max-w-lg">
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
              <SubmitButton className="self-start" pendingText="保存中...">
                保存する
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

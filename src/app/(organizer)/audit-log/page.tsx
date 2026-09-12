import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext } from "@/lib/organizer/context";
import { Card, CardContent } from "@/components/ui/card";

const PAGE_SIZE = 50;

// エンティティ名（ENTITY_LABEL）とあわせて「{エンティティ}を{アクション}」の形で
// 表示するため、エンティティ名を繰り返さない動詞・短い名詞句にする
// （例："契約を開始"、詳細は下のdescribeEntityが「（通常プラン）」等を補う）。
const ACTION_LABEL: Record<string, string> = {
  create: "作成",
  update: "更新",
  request_revision: "修正依頼",
  confirm_submission: "確認",
  cancel_revision_request: "修正依頼の取り消し",
  publish: "公開",
  update_payment_status: "入金状況の更新",
  start_standard_plan: "開始",
  change_to_standard_plan: "変更",
  start_annual_plan: "開始",
  change_to_annual_plan: "変更",
  generate_service_invoice: "生成",
  finalize_event_service_invoice: "確定",
  add_usage_correction: "課金対象からの除外（訂正）",
  record_payment_method_setup: "支払い方法の登録",
  cancel_event_participation: "キャンセル",
  merge_duplicate: "重複登録の統合",
  refund_service_invoice: "返金（運営者による操作）",
  mark_service_invoice_paid: "入金確認（運営者による操作）",
  update_organizer_organization_profile: "名称・請求先メールの変更",
};

const ENTITY_LABEL: Record<string, string> = {
  organizer_organization: "組織",
  submission_version: "提出内容",
  announcement_version: "資料",
  exhibitor_invoice: "出展者請求書",
  service_contract: "契約",
  service_invoice: "利用料請求",
  usage_ledger: "利用実績",
  event_participation: "出展者参加",
  event: "イベント",
};

// after_json/before_jsonの生スナップショットから、一覧で分かりやすい補足情報を
// できる範囲で抽出する（追加のクエリを増やさず、既存の記録だけで表示を厚くするため）。
function describeEntity(entityType: string, json: Record<string, unknown> | null): string | null {
  if (!json) return null;
  switch (entityType) {
    case "event":
    case "organizer_organization":
      return typeof json.name === "string" ? json.name : null;
    case "exhibitor_invoice":
      return typeof json.amount_yen === "number" ? `¥${json.amount_yen.toLocaleString("ja-JP")}` : null;
    case "announcement_version":
      return typeof json.title === "string" ? json.title : null;
    case "service_contract":
      return typeof json.plan_type === "string" ? (json.plan_type === "standard" ? "通常プラン" : "年間プラン") : null;
    case "service_invoice":
      return typeof json.total_amount_yen === "number" ? `¥${json.total_amount_yen.toLocaleString("ja-JP")}` : null;
    case "usage_ledger":
      return typeof json.reason === "string" ? json.reason : null;
    case "event_participation":
      return typeof json.cancelled_reason === "string" ? json.cancelled_reason : null;
    default:
      return null;
  }
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  if (context.role !== "owner") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
        <h1 className="text-xl font-semibold tracking-tight">監査ログ</h1>
        <p className="text-sm text-muted-foreground">この画面を閲覧できるのはオーナーのみです。</p>
      </div>
    );
  }

  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const { data: logs, count } = await supabase
    .from("audit_logs")
    .select("id, actor_user_id, action_type, entity_type, entity_id, before_json, after_json, occurred_at", {
      count: "exact",
    })
    .eq("organization_id", context.organizationId)
    .order("occurred_at", { ascending: false })
    .range(from, to);

  const actorIds = Array.from(new Set((logs ?? []).map((l) => l.actor_user_id).filter((id): id is string => !!id)));
  const serviceClient = createServiceRoleClient();
  const emailByUserId = new Map<string, string>();
  await Promise.all(
    actorIds.map(async (id) => {
      const { data } = await serviceClient.auth.admin.getUserById(id);
      if (data?.user?.email) emailByUserId.set(id, data.user.email);
    }),
  );

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">監査ログ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          この組織で行われた主要な操作の変更履歴です（オーナーのみ閲覧可能）。
        </p>
      </div>

      {(!logs || logs.length === 0) && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">記録がありません。</CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {(logs ?? []).map((log) => {
          const afterJson = (log.after_json as Record<string, unknown> | null) ?? null;
          const beforeJson = (log.before_json as Record<string, unknown> | null) ?? null;
          const actionLabel = ACTION_LABEL[log.action_type] ?? log.action_type;
          const entityLabel = ENTITY_LABEL[log.entity_type] ?? log.entity_type;
          const detail = describeEntity(log.entity_type, afterJson ?? beforeJson);
          const actorEmail = log.actor_user_id ? (emailByUserId.get(log.actor_user_id) ?? "（不明なユーザー）") : "システム";

          return (
            <Card key={log.id}>
              <CardContent className="flex flex-col gap-1.5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm">
                    <span className="font-medium">{entityLabel}</span>を<span className="font-medium">{actionLabel}</span>
                    {detail && <span className="text-muted-foreground">（{detail}）</span>}
                  </p>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {new Date(log.occurred_at).toLocaleString("ja-JP")}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{actorEmail}</p>
                {(beforeJson || afterJson) && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none">詳細を表示</summary>
                    <div className="mt-2 flex flex-col gap-2">
                      {beforeJson && (
                        <div>
                          <p className="font-medium">変更前</p>
                          <pre className="overflow-x-auto rounded bg-muted p-2">{JSON.stringify(beforeJson, null, 2)}</pre>
                        </div>
                      )}
                      {afterJson && (
                        <div>
                          <p className="font-medium">変更後</p>
                          <pre className="overflow-x-auto rounded bg-muted p-2">{JSON.stringify(afterJson, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <a
            href={page > 1 ? `/audit-log?page=${page - 1}` : undefined}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-40" : "underline-offset-4 hover:underline"}
          >
            前へ
          </a>
          <span>
            {page} / {totalPages} ページ
          </span>
          <a
            href={page < totalPages ? `/audit-log?page=${page + 1}` : undefined}
            aria-disabled={page >= totalPages}
            className={page >= totalPages ? "pointer-events-none opacity-40" : "underline-offset-4 hover:underline"}
          >
            次へ
          </a>
        </div>
      )}
    </div>
  );
}

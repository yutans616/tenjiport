import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function yen(n: number) {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

function formatJst(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }) : "-";
}

function relative(iso: string | null, now: number): string {
  if (!iso) return "記録なし";
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 0)}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

const PLAN_LABEL: Record<string, string> = { standard: "通常", annual: "年間" };

// デモ組織（営業LPの操作デモで訪問者ごとに自動発行される一時的な組織）は一覧・集計から除く。
export default async function AdminOrganizationsPage() {
  const admin = createServiceRoleClient();
  const now = new Date().getTime();

  const { data: allOrgs } = await admin
    .from("organizer_organizations")
    .select("id, name, billing_email, status, billing_exempt, is_demo, created_at")
    .order("created_at", { ascending: false });
  const orgs = (allOrgs ?? []).filter((o) => !o.is_demo);
  const demoCount = (allOrgs ?? []).length - orgs.length;
  const orgIds = orgs.map((o) => o.id);

  const [{ data: contracts }, { data: invoices }, { data: memberships }, { data: authUsers }] = await Promise.all([
    admin.from("service_contracts").select("organizer_organization_id, plan_type, status").eq("status", "active"),
    admin.from("service_invoices").select("organizer_organization_id, total_amount_yen, refunded_amount_yen, status, charged_at"),
    admin
      .from("organizer_memberships")
      .select("organization_id, user_id, last_active_at")
      .eq("status", "active")
      .in("organization_id", orgIds),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const activeContractByOrg = new Map((contracts ?? []).map((c) => [c.organizer_organization_id, c]));
  const userById = new Map((authUsers?.users ?? []).map((u) => [u.id, u]));

  const netByOrg = new Map<string, number>();
  const uncollectibleByOrg = new Map<string, number>();
  for (const inv of invoices ?? []) {
    const net = inv.total_amount_yen - inv.refunded_amount_yen;
    if (inv.charged_at) {
      netByOrg.set(inv.organizer_organization_id, (netByOrg.get(inv.organizer_organization_id) ?? 0) + net);
    }
    if (inv.status === "uncollectible") {
      uncollectibleByOrg.set(inv.organizer_organization_id, (uncollectibleByOrg.get(inv.organizer_organization_id) ?? 0) + net);
    }
  }

  // 組織ごとに、主催者画面を最後に開いた日時（とそのメンバー）と、最後にログインした日時を求める。
  const usageByOrg = new Map<string, { lastActiveAt: string | null; lastActiveEmail: string | null; lastSignInAt: string | null; members: number }>();
  for (const m of memberships ?? []) {
    const user = userById.get(m.user_id);
    const entry = usageByOrg.get(m.organization_id) ?? { lastActiveAt: null, lastActiveEmail: null, lastSignInAt: null, members: 0 };
    entry.members++;
    if (m.last_active_at && (!entry.lastActiveAt || m.last_active_at > entry.lastActiveAt)) {
      entry.lastActiveAt = m.last_active_at;
      entry.lastActiveEmail = user?.email ?? null;
    }
    const signIn = user?.last_sign_in_at ?? null;
    if (signIn && (!entry.lastSignInAt || signIn > entry.lastSignInAt)) entry.lastSignInAt = signIn;
    usageByOrg.set(m.organization_id, entry);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">組織一覧（{orgs.length}件）</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          「最終利用」は主催者画面を最後に開いた日時（10分単位で記録）、「最終ログイン」はログインし直した日時です。
          {demoCount > 0 && `営業LPの操作デモで自動発行されたデモ組織（現在${demoCount}件）は含みません。`}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {orgs.map((org) => {
          const contract = activeContractByOrg.get(org.id);
          const net = netByOrg.get(org.id) ?? 0;
          const uncollectible = uncollectibleByOrg.get(org.id) ?? 0;
          const usage = usageByOrg.get(org.id);
          return (
            <Link key={org.id} href={`/admin/organizations/${org.id}`}>
              <Card className="transition-colors hover:border-primary/40 hover:bg-accent/40">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{org.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {org.billing_email} ・ メンバー{usage?.members ?? 0}名
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      最終利用：
                      <span className="text-foreground">
                        {formatJst(usage?.lastActiveAt ?? null)}（{relative(usage?.lastActiveAt ?? null, now)}）
                      </span>
                      {usage?.lastActiveEmail && ` ${usage.lastActiveEmail}`}
                      {" ・ "}最終ログイン：{formatJst(usage?.lastSignInAt ?? null)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {org.billing_exempt ? (
                      <Badge variant="secondary">課金対象外</Badge>
                    ) : (
                      <Badge variant={contract ? "default" : "outline"}>
                        {contract ? PLAN_LABEL[contract.plan_type] ?? contract.plan_type : "契約なし"}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">累計 {yen(net)}</span>
                    {uncollectible > 0 && <Badge variant="destructive">未回収 {yen(uncollectible)}</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function yen(n: number) {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

const PLAN_LABEL: Record<string, string> = { standard: "通常", annual: "年間" };

export default async function AdminOrganizationsPage() {
  const admin = createServiceRoleClient();

  const { data: orgs } = await admin
    .from("organizer_organizations")
    .select("id, name, billing_email, status, created_at")
    .order("created_at", { ascending: false });

  const { data: contracts } = await admin
    .from("service_contracts")
    .select("organizer_organization_id, plan_type, status")
    .eq("status", "active");
  const activeContractByOrg = new Map((contracts ?? []).map((c) => [c.organizer_organization_id, c]));

  const { data: invoices } = await admin
    .from("service_invoices")
    .select("organizer_organization_id, total_amount_yen, refunded_amount_yen, status, charged_at");

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

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">組織一覧（{orgs?.length ?? 0}件）</h1>

      <div className="flex flex-col gap-2">
        {(orgs ?? []).map((org) => {
          const contract = activeContractByOrg.get(org.id);
          const net = netByOrg.get(org.id) ?? 0;
          const uncollectible = uncollectibleByOrg.get(org.id) ?? 0;
          return (
            <Link key={org.id} href={`/admin/organizations/${org.id}`}>
              <Card className="transition-colors hover:border-primary/40 hover:bg-accent/40">
                <CardContent className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-medium">{org.name}</p>
                    <p className="text-xs text-muted-foreground">{org.billing_email}</p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Badge variant={contract ? "default" : "outline"}>
                      {contract ? PLAN_LABEL[contract.plan_type] ?? contract.plan_type : "契約なし"}
                    </Badge>
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

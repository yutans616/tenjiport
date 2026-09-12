import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { BrandListClient, type BrandRow } from "./BrandListClient";

export default async function ExhibitorBrandsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/apply/${token}`);

  const { data: event } = await supabase.from("events").select("id, name").eq("public_form_token", token).maybeSingle();
  if (!event) redirect(`/apply/${token}`);

  const { data: memberships } = await supabase
    .from("exhibitor_memberships")
    .select("exhibitor_profile_id, exhibitor_profiles(id, brand_name, company_name, created_at)")
    .eq("user_id", user.id)
    .eq("status", "active");

  const profiles = (memberships ?? [])
    .map((m) => (Array.isArray(m.exhibitor_profiles) ? m.exhibitor_profiles[0] : m.exhibitor_profiles))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const profileIds = profiles.map((p) => p.id);

  let eventNamesByProfile = new Map<string, string[]>();
  if (profileIds.length > 0) {
    const { data: participations } = await supabase
      .from("event_participations")
      .select("exhibitor_profile_id, events(name)")
      .in("exhibitor_profile_id", profileIds);
    const map = new Map<string, string[]>();
    for (const p of participations ?? []) {
      const ev = Array.isArray(p.events) ? p.events[0] : p.events;
      if (!ev?.name) continue;
      const list = map.get(p.exhibitor_profile_id) ?? [];
      list.push(ev.name);
      map.set(p.exhibitor_profile_id, list);
    }
    eventNamesByProfile = map;
  }

  const rows: BrandRow[] = profiles.map((p) => ({
    id: p.id,
    brandName: p.brand_name,
    companyName: p.company_name,
    createdAt: p.created_at,
    eventNames: eventNamesByProfile.get(p.id) ?? [],
  }));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-1 flex-col gap-6 p-4 py-10">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{event.name}</p>
        <h1 className="text-lg font-semibold tracking-tight">ブランド管理</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          これまでに応募・登録したブランドの情報を確認・編集できます。
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">ブランドがありません。</CardContent>
        </Card>
      ) : (
        <BrandListClient token={token} rows={rows} />
      )}
    </main>
  );
}

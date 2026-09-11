import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { dismissDuplicate, mergeDuplicate } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DuplicatesPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("organizer_organization_id", context!.organizationId)
    .single();
  if (!event) notFound();

  const { data: flags } = await supabase
    .from("duplicate_flags")
    .select("id, match_reason, participation_id_a, participation_id_b")
    .eq("event_id", eventId)
    .eq("status", "flagged")
    .order("created_at", { ascending: false });

  const participationIds = Array.from(
    new Set((flags ?? []).flatMap((f) => [f.participation_id_a, f.participation_id_b])),
  );

  const { data: participations } = participationIds.length
    ? await supabase
        .from("event_participations")
        .select("id, exhibitor_profiles(brand_name, company_name, default_contact_email)")
        .in("id", participationIds)
    : { data: [] };

  const profileById = new Map(
    (participations ?? []).map((p) => {
      const profile = Array.isArray(p.exhibitor_profiles) ? p.exhibitor_profiles[0] : p.exhibitor_profiles;
      return [p.id, profile];
    }),
  );

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-sm font-semibold text-muted-foreground">重複登録レビュー</h2>

      {!flags || flags.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            重複の可能性がある登録はありません。
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {flags.map((flag) => {
            const a = profileById.get(flag.participation_id_a);
            const b = profileById.get(flag.participation_id_b);
            return (
              <Card key={flag.id}>
                <CardContent className="flex flex-col gap-4">
                  <Badge variant="outline" className="w-fit font-normal">
                    検知理由: メールアドレス一致
                  </Badge>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="rounded-lg border p-3">
                      <p className="font-medium">{a?.brand_name}</p>
                      <p className="text-xs text-muted-foreground">{a?.company_name}</p>
                      <p className="text-xs text-muted-foreground">{a?.default_contact_email}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="font-medium">{b?.brand_name}</p>
                      <p className="text-xs text-muted-foreground">{b?.company_name}</p>
                      <p className="text-xs text-muted-foreground">{b?.default_contact_email}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    統合すると、無効化された側の課金対象は自動的に除外されます（重複登録として課金訂正されます）。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <form
                      action={mergeDuplicate.bind(
                        null,
                        eventId,
                        flag.id,
                        flag.participation_id_a,
                        flag.participation_id_b,
                      )}
                    >
                      <Button type="submit" size="sm">
                        左に統合する（右を無効化）
                      </Button>
                    </form>
                    <form
                      action={mergeDuplicate.bind(
                        null,
                        eventId,
                        flag.id,
                        flag.participation_id_b,
                        flag.participation_id_a,
                      )}
                    >
                      <Button type="submit" variant="outline" size="sm">
                        右に統合する（左を無効化）
                      </Button>
                    </form>
                    <form action={dismissDuplicate.bind(null, eventId, flag.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        別物として扱う
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

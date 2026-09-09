import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MyAnnouncementRow } from "@/lib/notifications/types";

export default async function ExhibitorAnnouncementsPage({
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

  const { data: announcements, error } = await supabase.rpc("get_my_announcements", { p_event_id: event.id });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-1 flex-col gap-6 p-4 py-10">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{event.name}</p>
        <h1 className="text-lg font-semibold tracking-tight">資料一覧</h1>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!announcements || announcements.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">まだ資料がありません。</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {(announcements as MyAnnouncementRow[]).map((a) => (
            <Link key={a.announcement_version_id} href={`/apply/${token}/announcements/${a.announcement_version_id}`}>
              <Card className="transition-colors hover:border-primary/40 hover:bg-accent/40">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.published_at ? new Date(a.published_at).toLocaleString("ja-JP") : ""}
                    </p>
                  </div>
                  {a.acknowledged_at ? (
                    <Badge variant="secondary">確認済み</Badge>
                  ) : (
                    <Badge variant="default">未確認</Badge>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

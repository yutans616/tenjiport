import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/organizer/submit-button";
import { createProject, deleteProject, renameProject } from "./actions";

export default async function ProjectsPage() {
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");
  const canManage = context.role === "owner" || context.role === "admin";

  const supabase = await createClient();
  const [{ data: projects }, { data: events }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, sort_order")
      .eq("organization_id", context.organizationId)
      .order("sort_order", { ascending: true }),
    supabase.from("events").select("id, project_id").eq("organizer_organization_id", context.organizationId),
  ]);
  const countByProject = new Map<string | null, number>();
  for (const e of events ?? []) countByProject.set(e.project_id, (countByProject.get(e.project_id) ?? 0) + 1);

  const scopes = [
    { href: "/projects/all", name: "組織全体", count: (events ?? []).length, description: "すべてのプロジェクトのイベントを横断" },
    ...(projects ?? []).map((p) => ({ href: `/projects/${p.id}`, name: p.name, count: countByProject.get(p.id) ?? 0, description: null })),
    ...((countByProject.get(null) ?? 0) > 0 && (projects ?? []).length > 0
      ? [{ href: "/projects/none", name: "未分類", count: countByProject.get(null) ?? 0, description: "プロジェクト未設定のイベント" }]
      : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">プロジェクト</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          サービス・事業ごとにイベントをまとめ、イベントをまたいで出展者や請求・入金の状況を確認できます。契約・課金・発行元情報・振込口座・メンバーは組織で共通です。
        </p>
      </div>

      <div className="grid gap-2">
        {scopes.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="transition-colors hover:border-primary/40 hover:bg-accent/40">
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    イベント{s.count}件{s.description ? ` ・ ${s.description}` : ""}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">プロジェクトの管理</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {(projects ?? []).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2">
                <form action={renameProject.bind(null, p.id)} className="flex flex-1 gap-2">
                  <Input name="name" defaultValue={p.name} required maxLength={100} className="flex-1" aria-label="プロジェクト名" />
                  <SubmitButton variant="outline" pendingText="保存中...">
                    名前を保存
                  </SubmitButton>
                </form>
                <form action={deleteProject.bind(null, p.id)}>
                  <SubmitButton variant="ghost" className="text-muted-foreground hover:text-destructive" pendingText="削除中...">
                    削除
                  </SubmitButton>
                </form>
              </div>
            ))}
            <form action={createProject} className="flex gap-2">
              <Input name="name" required maxLength={100} placeholder="例：Eight、Bill One" className="flex-1" aria-label="新しいプロジェクト名" />
              <SubmitButton pendingText="追加中...">追加</SubmitButton>
            </form>
            <p className="text-xs text-muted-foreground">
              プロジェクトを削除しても、所属していたイベントは削除されず「未分類」に戻ります。イベントの所属は、各イベントの概要ページで変更できます。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

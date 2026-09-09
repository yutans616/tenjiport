import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TEMPLATES: { key: string; title: string; description: string }[] = [
  { key: "all", title: "出展者一覧（全項目）", description: "入力フォームの全項目をそのまま出力します。" },
  { key: "power", title: "電源・備品一覧", description: "電源使用の有無・機器名・消費電力・希望備品のみを出力します。" },
  { key: "vehicle", title: "車両一覧", description: "車種・ナンバー・台数・搬入出希望時間のみを出力します。" },
  { key: "staff", title: "スタッフ一覧", description: "スタッフ氏名・参加日・パス希望枚数のみを出力します。" },
];

export default async function ExportsPage({
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

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-sm font-semibold text-muted-foreground">データ出力</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {TEMPLATES.map((t) => (
          <Card key={t.key}>
            <CardHeader>
              <CardTitle className="text-base">{t.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{t.description}</p>
              <Button
                variant="outline"
                render={
                  <Link href={`/events/${eventId}/export?template=${t.key}`}>
                    <Download />
                    CSVでダウンロード
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ブランド紹介CSV＋ロゴZIP</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              ブランド基本情報のCSVと、登録済みロゴ画像をまとめたZIPをダウンロードします。
            </p>
            <Button
              variant="outline"
              render={
                <Link href={`/events/${eventId}/export/brand-kit`}>
                  <Download />
                  ZIPでダウンロード
                </Link>
              }
            />
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        非公開メモ・請求書ファイルは出力に含まれません。権限は出力時にも適用されます。
      </p>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import {
  DEFAULT_EMAIL_TEMPLATES,
  DEFAULT_SIGNATURE,
  EMAIL_TEMPLATE_LABEL,
  EMAIL_TEMPLATE_TYPES,
  EMAIL_VARIABLES,
  SAMPLE_VARIABLES,
  renderNotificationEmail,
  type EmailTemplateOverrides,
} from "@/lib/notifications/emailTemplates";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/organizer/submit-button";
import { SuccessBanner } from "@/components/organizer/success-banner";
import { resetEmailTemplate, saveEmailTemplate } from "./actions";

export default async function EmailTemplatesPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");
  if (context.role !== "owner" && context.role !== "admin") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
        <h1 className="text-xl font-semibold tracking-tight">メール文面</h1>
        <p className="text-sm text-muted-foreground">メール文面を閲覧・変更できるのはオーナーまたは管理者のみです。</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("organization_email_templates")
    .select("template_type, subject, body")
    .eq("organization_id", context.organizationId);
  const overrides: EmailTemplateOverrides = Object.fromEntries(
    (rows ?? []).map((r) => [r.template_type, { subject: r.subject, body: r.body }]),
  );
  const sampleVars = { ...SAMPLE_VARIABLES, 主催者名: context.organizationName };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <SuccessBanner done={done} />
      <div>
        <Link href="/settings" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          設定
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">メール文面</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          出展者へ自動で送る通知メールの件名・本文と、全メール共通の署名を変更できます。
          {"{{イベント名}}"}のような差し込み項目は、送信時に実際の値に置き換わります。確認用のリンクと、資料メールの場合は資料の本文が、本文の後に自動で付きます。
        </p>
      </div>

      {EMAIL_TEMPLATE_TYPES.map((type) => {
        const custom = overrides[type];
        const isCustomized = !!custom;
        const preview = renderNotificationEmail({
          templateType: type,
          overrides,
          vars: sampleVars,
          link: "https://tenjiport.com/…（出展者ごとの確認用リンク）",
          announcementBody: type.startsWith("announcement") ? "（資料ごとに入力した本文がここに入ります）" : null,
        });
        return (
          <Card key={type} id={type} className="scroll-mt-6">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{EMAIL_TEMPLATE_LABEL[type]}</CardTitle>
              <Badge variant={isCustomized ? "default" : "outline"}>{isCustomized ? "変更済み" : "標準の文面"}</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <form action={saveEmailTemplate.bind(null, type)} className="flex flex-col gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${type}-subject`}>件名</Label>
                  <Input
                    id={`${type}-subject`}
                    name="subject"
                    maxLength={200}
                    defaultValue={custom?.subject ?? DEFAULT_EMAIL_TEMPLATES[type].subject}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${type}-body`}>本文</Label>
                  <Textarea
                    id={`${type}-body`}
                    name="body"
                    rows={7}
                    maxLength={5000}
                    defaultValue={custom?.body ?? DEFAULT_EMAIL_TEMPLATES[type].body}
                  />
                  <p className="text-xs text-muted-foreground">
                    使える差し込み項目：{EMAIL_VARIABLES[type].map((v) => `{{${v}}}`).join("、")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <SubmitButton pendingText="保存中...">保存する</SubmitButton>
                </div>
              </form>
              {isCustomized && (
                <form action={resetEmailTemplate.bind(null, type)}>
                  <SubmitButton variant="ghost" size="sm" className="text-muted-foreground" pendingText="処理中...">
                    標準の文面に戻す
                  </SubmitButton>
                </form>
              )}
              <details className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <summary className="cursor-pointer text-muted-foreground">送信イメージ（保存済みの内容・サンプルの値で表示）</summary>
                <p className="mt-2 font-medium">件名：{preview.subject}</p>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{preview.text}</p>
              </details>
            </CardContent>
          </Card>
        );
      })}

      <Card id="signature" className="scroll-mt-6">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">署名（全メール共通）</CardTitle>
          <Badge variant={overrides.signature ? "default" : "outline"}>{overrides.signature ? "変更済み" : "標準（組織名のみ）"}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form action={saveEmailTemplate.bind(null, "signature")} className="flex flex-col gap-3">
            <Textarea
              name="body"
              rows={5}
              maxLength={5000}
              aria-label="署名"
              defaultValue={overrides.signature?.body ?? DEFAULT_SIGNATURE}
              placeholder={"例：\nサンプル展示会 運営事務局\nTEL: 03-0000-0000\nMail: info@example.com"}
            />
            <p className="text-xs text-muted-foreground">問い合わせ先の電話番号・メールアドレスを入れておくと、出展者からの連絡先が明確になります。</p>
            <SubmitButton className="self-start" pendingText="保存中...">
              保存する
            </SubmitButton>
          </form>
          {overrides.signature && (
            <form action={resetEmailTemplate.bind(null, "signature")}>
              <SubmitButton variant="ghost" size="sm" className="text-muted-foreground" pendingText="処理中...">
                標準に戻す
              </SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

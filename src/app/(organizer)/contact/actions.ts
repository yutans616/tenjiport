"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { createResendClient } from "@/lib/resend";

const CATEGORY_LABELS: Record<string, string> = {
  bug: "バグ報告",
  feature: "機能提案",
  other: "お問い合わせ",
};

export async function sendContactMessageAction(formData: FormData) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const category = String(formData.get("category") ?? "other");
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || !message) {
    throw new Error("件名・内容は必須です。");
  }
  const categoryLabel = CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other;

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizer_organizations")
    .select("name")
    .eq("id", context.organizationId)
    .single();

  const resend = createResendClient();
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: "contact@tenjiport.com",
    replyTo: context.email ?? undefined,
    subject: `【TenjiPort${categoryLabel}】${subject}`,
    html: `
      <p>種別：${categoryLabel}</p>
      <p>組織：${org?.name ?? "（不明）"}</p>
      <p>送信者：${context.email ?? "（不明）"}</p>
      <hr />
      <p style="white-space: pre-wrap;">${message.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</p>
    `,
  });
  if (error) throw new Error(`送信に失敗しました: ${error.message}`);

  redirect("/contact?done=contact_sent");
}

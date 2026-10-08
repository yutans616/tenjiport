"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { DEFAULT_EMAIL_TEMPLATES, DEFAULT_SIGNATURE, EMAIL_TEMPLATE_TYPES, type EmailTemplateType } from "@/lib/notifications/emailTemplates";

type TemplateKey = EmailTemplateType | "signature";

async function requireManager() {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");
  if (context!.role !== "owner" && context!.role !== "admin") {
    throw new Error("メール文面を変更できるのはオーナー・管理者のみです。");
  }
  return { context: context!, supabase: await createClient() };
}

function assertTemplateKey(key: string): asserts key is TemplateKey {
  if (key !== "signature" && !EMAIL_TEMPLATE_TYPES.includes(key as EmailTemplateType)) {
    throw new Error("不正なメールの種類です。");
  }
}

// 標準文面と同じ内容で保存された場合は行を作らない（標準文面の改善がそのまま反映されるように）。
export async function saveEmailTemplate(templateKey: string, formData: FormData) {
  assertTemplateKey(templateKey);
  const { context, supabase } = await requireManager();

  const subject = templateKey === "signature" ? null : String(formData.get("subject") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim() || null;
  if (subject && subject.length > 200) throw new Error("件名は200文字以内で入力してください。");
  if (body && body.length > 5000) throw new Error("本文は5000文字以内で入力してください。");

  const isDefault =
    templateKey === "signature"
      ? !body || body === DEFAULT_SIGNATURE
      : (!subject || subject === DEFAULT_EMAIL_TEMPLATES[templateKey].subject) &&
        (!body || body === DEFAULT_EMAIL_TEMPLATES[templateKey].body);

  if (isDefault) {
    await supabase
      .from("organization_email_templates")
      .delete()
      .eq("organization_id", context.organizationId)
      .eq("template_type", templateKey);
  } else {
    const { error } = await supabase.from("organization_email_templates").upsert(
      {
        organization_id: context.organizationId,
        template_type: templateKey,
        subject,
        body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,template_type" },
    );
    if (error) throw new Error(`保存に失敗しました: ${error.message}`);
  }

  revalidatePath("/settings/email-templates");
  redirect(`/settings/email-templates?done=saved#${templateKey}`);
}

export async function resetEmailTemplate(templateKey: string) {
  assertTemplateKey(templateKey);
  const { context, supabase } = await requireManager();
  const { error } = await supabase
    .from("organization_email_templates")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("template_type", templateKey);
  if (error) throw new Error(`標準に戻せませんでした: ${error.message}`);

  revalidatePath("/settings/email-templates");
  redirect(`/settings/email-templates?done=saved#${templateKey}`);
}

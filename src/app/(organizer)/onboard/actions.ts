"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createOrganization(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const billingEmail = String(formData.get("billing_email") ?? "").trim();

  if (!name || !billingEmail) {
    throw new Error("組織名と請求先メールアドレスは必須です。");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
    return;
  }

  const { error } = await supabase.rpc("create_organizer_organization", {
    org_name: name,
    org_billing_email: billingEmail,
  });

  if (error) {
    throw new Error(`組織の作成に失敗しました: ${error.message}`);
  }

  redirect("/events");
}

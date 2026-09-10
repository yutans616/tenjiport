"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createOrganization(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const billingEmail = String(formData.get("billing_email") ?? "").trim();
  const companyName = String(formData.get("company_name") ?? "").trim();
  const postalCode = String(formData.get("postal_code") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phoneNumber = String(formData.get("phone_number") ?? "").trim();

  if (!name || !billingEmail || !companyName || !postalCode || !address || !phoneNumber) {
    throw new Error("組織名・請求先メールアドレス・会社名・郵便番号・住所・電話番号は必須です。");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
    return;
  }

  const { data: newOrg, error } = await supabase.rpc("create_organizer_organization", {
    org_name: name,
    org_billing_email: billingEmail,
  });

  if (error || !newOrg) {
    throw new Error(`組織の作成に失敗しました: ${error?.message}`);
  }

  const { error: bankAccountError } = await supabase.from("organizer_bank_accounts").insert({
    organization_id: newOrg.id,
    company_name: companyName,
    postal_code: postalCode,
    address: address,
    phone_number: phoneNumber,
  });

  if (bankAccountError) {
    throw new Error(`発行元情報の保存に失敗しました: ${bankAccountError.message}`);
  }

  redirect("/events");
}

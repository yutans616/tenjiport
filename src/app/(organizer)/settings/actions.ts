"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";

export async function updateOrganizationProfileAction(formData: FormData) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");
  if (context.role !== "owner" && context.role !== "admin") {
    throw new Error("この操作を行う権限がありません。");
  }

  const name = String(formData.get("name") ?? "").trim();
  const billingEmail = String(formData.get("billing_email") ?? "").trim();
  if (!name || !billingEmail) {
    throw new Error("組織名・請求先メールアドレスは必須です。");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_organizer_organization_profile", {
    p_org_id: context.organizationId,
    p_name: name,
    p_billing_email: billingEmail,
  });
  if (error) throw new Error(`保存に失敗しました: ${error.message}`);

  revalidatePath("/settings");
  redirect("/settings?done=saved");
}

export async function updateBankAccountAction(formData: FormData) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");
  if (context.role !== "owner" && context.role !== "admin") {
    throw new Error("この操作を行う権限がありません。");
  }

  const bankName = String(formData.get("bank_name") ?? "").trim() || null;
  const branchName = String(formData.get("branch_name") ?? "").trim() || null;
  const accountType = String(formData.get("account_type") ?? "").trim() || null;
  const accountNumber = String(formData.get("account_number") ?? "").trim() || null;
  const accountHolderName = String(formData.get("account_holder_name") ?? "").trim() || null;
  const qualifiedInvoiceRegistrationNumber = String(formData.get("qualified_invoice_registration_number") ?? "").trim() || null;
  const companyName = String(formData.get("company_name") ?? "").trim() || null;
  const postalCode = String(formData.get("postal_code") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const phoneNumber = String(formData.get("phone_number") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from("organizer_bank_accounts").upsert({
    organization_id: context.organizationId,
    bank_name: bankName,
    branch_name: branchName,
    account_type: accountType,
    account_number: accountNumber,
    account_holder_name: accountHolderName,
    qualified_invoice_registration_number: qualifiedInvoiceRegistrationNumber,
    company_name: companyName,
    postal_code: postalCode,
    address: address,
    phone_number: phoneNumber,
  });
  if (error) throw new Error(`保存に失敗しました: ${error.message}`);

  revalidatePath("/settings");
  redirect("/settings?done=saved");
}

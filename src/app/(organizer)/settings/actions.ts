"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";

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

  const supabase = await createClient();
  const { error } = await supabase.from("organizer_bank_accounts").upsert({
    organization_id: context.organizationId,
    bank_name: bankName,
    branch_name: branchName,
    account_type: accountType,
    account_number: accountNumber,
    account_holder_name: accountHolderName,
  });
  if (error) throw new Error(`保存に失敗しました: ${error.message}`);

  revalidatePath("/settings");
  redirect("/settings?done=saved");
}

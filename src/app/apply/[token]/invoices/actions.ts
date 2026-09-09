"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function confirmInvoiceAction(token: string, invoiceId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_invoice", { p_invoice_id: invoiceId });
  if (error) throw new Error(`確認の記録に失敗しました: ${error.message}`);

  revalidatePath(`/apply/${token}/invoices`);
  revalidatePath(`/apply/${token}/invoices/${invoiceId}`);
}

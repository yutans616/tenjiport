"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext } from "@/lib/organizer/context";
import { sanitizeStorageFilename } from "@/lib/storage/sanitizeFilename";
import { processPendingNotifications } from "@/lib/notifications/processPendingNotifications";

async function requireOrganizerEvent(eventId: string) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, organizer_organization_id")
    .eq("id", eventId)
    .eq("organizer_organization_id", context!.organizationId)
    .single();
  if (!event) throw new Error("イベントが見つかりません。");
  return { context: context!, supabase, event };
}

export async function createInvoice(eventId: string, formData: FormData) {
  const { supabase, context } = await requireOrganizerEvent(eventId);

  const participationId = String(formData.get("participation_id") ?? "");
  const amountYen = Number(formData.get("amount_yen"));
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const memo = String(formData.get("memo") ?? "").trim() || null;
  const file = formData.get("file");

  if (!participationId) throw new Error("対象の出展者を選択してください。");
  if (!Number.isFinite(amountYen) || amountYen < 0) throw new Error("金額を正しく入力してください。");

  let invoiceFileId: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 20 * 1024 * 1024) {
      throw new Error(`ファイルサイズは20MB以下にしてください（このファイル: ${(file.size / 1024 / 1024).toFixed(1)}MB）。`);
    }
    const storageKey = `${context.organizationId}/${eventId}/invoices/${randomUUID()}-${sanitizeStorageFilename(file.name)}`;
    const serviceClient = createServiceRoleClient();
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await serviceClient.storage
      .from("files")
      .upload(storageKey, Buffer.from(arrayBuffer), { contentType: file.type || "application/pdf" });
    if (uploadError) throw new Error(`アップロードに失敗しました: ${uploadError.message}`);

    const { data: fileAsset, error: fileAssetError } = await serviceClient
      .from("file_assets")
      .insert({
        organizer_organization_id: context.organizationId,
        event_id: eventId,
        uploader_user_id: context.userId,
        kind: "invoice_pdf",
        storage_key: storageKey,
        filename: file.name,
        content_type: file.type || "application/pdf",
        size_bytes: file.size,
      })
      .select("id")
      .single();
    if (fileAssetError || !fileAsset) throw new Error(`ファイルの登録に失敗しました: ${fileAssetError?.message}`);
    invoiceFileId = fileAsset.id;
  }

  const { data: invoice, error } = await supabase.rpc("create_exhibitor_invoice", {
    p_event_participation_id: participationId,
    p_invoice_file_id: invoiceFileId,
    p_amount_yen: Math.round(amountYen),
    p_due_date: dueDate,
    p_organizer_internal_memo: memo,
  });
  if (error) throw new Error(`請求書の作成に失敗しました: ${error.message}`);

  // 請求書の発行＝通知の期待に応えるため、キューに積むだけでなくその場で送信まで行う。
  await processPendingNotifications(50);

  revalidatePath(`/events/${eventId}/invoices`);
  redirect(`/events/${eventId}/invoices/${invoice.id}`);
}

export async function resendInvoiceReminderAction(eventId: string, invoiceId: string) {
  const { supabase } = await requireOrganizerEvent(eventId);

  const { error } = await supabase.rpc("resend_invoice_reminder", { p_invoice_id: invoiceId });
  if (error) throw new Error(`再請求に失敗しました: ${error.message}`);

  await processPendingNotifications(50);
  revalidatePath(`/events/${eventId}/invoices/${invoiceId}`);
  redirect(`/events/${eventId}/invoices/${invoiceId}?done=invoice_resent`);
}

export async function updateInvoiceDetails(eventId: string, invoiceId: string, formData: FormData) {
  const { supabase } = await requireOrganizerEvent(eventId);

  const amountYen = Number(formData.get("amount_yen"));
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const memo = String(formData.get("memo") ?? "").trim() || null;
  if (!Number.isFinite(amountYen) || amountYen < 0) throw new Error("金額を正しく入力してください。");

  const { error } = await supabase.rpc("update_invoice_details", {
    p_invoice_id: invoiceId,
    p_amount_yen: Math.round(amountYen),
    p_due_date: dueDate,
    p_organizer_internal_memo: memo,
  });
  if (error) throw new Error(`更新に失敗しました: ${error.message}`);

  revalidatePath(`/events/${eventId}/invoices/${invoiceId}`);
}

export async function markInvoicePaid(eventId: string, invoiceId: string, formData: FormData) {
  const { supabase } = await requireOrganizerEvent(eventId);
  const paidAt = String(formData.get("paid_at") ?? "") || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  const { error } = await supabase.rpc("update_invoice_payment_status", {
    p_invoice_id: invoiceId,
    p_payment_status: "paid",
    p_paid_at: paidAt ? new Date(paidAt).toISOString() : null,
    p_note: note,
  });
  if (error) throw new Error(`更新に失敗しました: ${error.message}`);

  revalidatePath(`/events/${eventId}/invoices/${invoiceId}`);
}

export async function markInvoiceUnpaid(eventId: string, invoiceId: string, formData: FormData) {
  const { supabase } = await requireOrganizerEvent(eventId);
  const note = String(formData.get("note") ?? "").trim() || null;

  const { error } = await supabase.rpc("update_invoice_payment_status", {
    p_invoice_id: invoiceId,
    p_payment_status: "unpaid",
    p_note: note,
  });
  if (error) throw new Error(`更新に失敗しました: ${error.message}`);

  revalidatePath(`/events/${eventId}/invoices/${invoiceId}`);
}

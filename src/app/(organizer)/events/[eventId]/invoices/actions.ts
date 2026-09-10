"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext, type OrganizerContext } from "@/lib/organizer/context";
import { sanitizeStorageFilename } from "@/lib/storage/sanitizeFilename";
import { processPendingNotifications } from "@/lib/notifications/processPendingNotifications";
import { generateInvoicePdf } from "@/lib/pdf/generateInvoicePdf";
import { resolveInvoiceLineItems } from "@/lib/pdf/resolveInvoiceLineItems";

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

// 請求書PDFを自動生成し、file_assetsに登録してattach_invoice_pdf経由で紐付ける。
// 生成に失敗しても請求書自体は既に作成済みのため、処理は継続する（コンソールにのみ記録）。
async function generateAndAttachInvoicePdf(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  context: OrganizerContext;
  eventId: string;
  invoiceId: string;
  invoiceNumber: string;
  participationId: string;
  amountYen: number;
  dueDate: string | null;
}) {
  const { supabase, context, eventId, invoiceId, invoiceNumber, participationId, amountYen, dueDate } = params;

  try {
    const { data: participation } = await supabase
      .from("event_participations")
      .select("exhibitor_profiles(company_name)")
      .eq("id", participationId)
      .single();
    const profile = participation
      ? Array.isArray(participation.exhibitor_profiles)
        ? participation.exhibitor_profiles[0]
        : participation.exhibitor_profiles
      : null;

    const { data: bankAccount } = await supabase
      .from("organizer_bank_accounts")
      .select(
        "bank_name, branch_name, account_type, account_number, account_holder_name, qualified_invoice_registration_number, company_name, postal_code, address, phone_number",
      )
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    const lineItems = await resolveInvoiceLineItems(supabase, participationId, amountYen);

    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber,
      issueDate: new Date(),
      dueDate,
      organizerName: context.organizationName,
      organizerCompanyName: bankAccount?.company_name ?? null,
      organizerPostalCode: bankAccount?.postal_code ?? null,
      organizerAddress: bankAccount?.address ?? null,
      organizerPhoneNumber: bankAccount?.phone_number ?? null,
      registrationNumber: bankAccount?.qualified_invoice_registration_number ?? null,
      bankDetails: bankAccount
        ? {
            bankName: bankAccount.bank_name,
            branchName: bankAccount.branch_name,
            accountType: bankAccount.account_type,
            accountNumber: bankAccount.account_number,
            accountHolderName: bankAccount.account_holder_name,
          }
        : null,
      exhibitorCompanyName: profile?.company_name ?? "（未設定）",
      lineItems,
      amountYen,
    });

    const serviceClient = createServiceRoleClient();
    const filename = `請求書_${invoiceNumber}.pdf`;
    const storageKey = `${context.organizationId}/${eventId}/invoices/${randomUUID()}-${sanitizeStorageFilename(filename)}`;
    const { error: uploadError } = await serviceClient.storage
      .from("files")
      .upload(storageKey, pdfBuffer, { contentType: "application/pdf" });
    if (uploadError) {
      console.error(`invoice pdf upload failed for ${invoiceId}: ${uploadError.message}`);
      return;
    }

    const { data: fileAsset, error: fileAssetError } = await serviceClient
      .from("file_assets")
      .insert({
        organizer_organization_id: context.organizationId,
        event_id: eventId,
        uploader_user_id: context.userId,
        kind: "invoice_pdf",
        storage_key: storageKey,
        filename,
        content_type: "application/pdf",
        size_bytes: pdfBuffer.length,
      })
      .select("id")
      .single();
    if (fileAssetError || !fileAsset) {
      console.error(`invoice pdf file_assets insert failed for ${invoiceId}: ${fileAssetError?.message}`);
      return;
    }

    const { error: attachError } = await supabase.rpc("attach_invoice_pdf", {
      p_invoice_id: invoiceId,
      p_file_asset_id: fileAsset.id,
    });
    if (attachError) {
      console.error(`attach_invoice_pdf failed for ${invoiceId}: ${attachError.message}`);
    }
  } catch (err) {
    console.error(`invoice pdf generation failed for ${invoiceId}:`, err);
  }
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
  let manualFileUploaded = false;
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
    manualFileUploaded = true;
  }

  const { data: invoice, error } = await supabase.rpc("create_exhibitor_invoice", {
    p_event_participation_id: participationId,
    p_invoice_file_id: invoiceFileId,
    p_amount_yen: Math.round(amountYen),
    p_due_date: dueDate,
    p_organizer_internal_memo: memo,
  });
  if (error) throw new Error(`請求書の作成に失敗しました: ${error.message}`);

  // ファイルを手動アップロードしなかった場合は、請求書PDFを自動生成して添付する。
  if (!manualFileUploaded && invoice.invoice_number) {
    await generateAndAttachInvoicePdf({
      supabase,
      context,
      eventId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      participationId,
      amountYen: invoice.amount_yen,
      dueDate: invoice.due_date,
    });
  }

  // 請求書の発行＝通知の期待に応えるため、キューに積むだけでなくその場で送信まで行う。
  await processPendingNotifications(50);

  revalidatePath(`/events/${eventId}/invoices`);
  redirect(`/events/${eventId}/invoices/${invoice.id}`);
}

export async function createInvoicesBulkAction(eventId: string, formData: FormData) {
  const { supabase, context } = await requireOrganizerEvent(eventId);
  if (context.role !== "owner" && context.role !== "admin") {
    throw new Error("この操作を行う権限がありません。");
  }

  const participationIds = formData.getAll("participation_ids").map(String);
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const memo = String(formData.get("memo") ?? "").trim() || null;

  if (participationIds.length === 0) {
    throw new Error("対象を1件以上選んでください。");
  }
  if (!dueDate) {
    throw new Error("支払期限を入力してください。");
  }

  const { data: results, error } = await supabase.rpc("create_exhibitor_invoices_bulk", {
    p_event_participation_ids: participationIds,
    p_due_date: dueDate,
    p_organizer_internal_memo: memo,
  });
  if (error) throw new Error(`一括発行に失敗しました: ${error.message}`);

  type BulkResultRow = { event_participation_id: string; invoice_id: string | null; amount_yen: number | null; result_status: string };
  const createdRows = ((results ?? []) as BulkResultRow[]).filter((r) => r.result_status === "created");

  // 新規作成分のinvoice_numberはRPCの戻り値に含まれないため、まとめて取得する。
  if (createdRows.length > 0) {
    const { data: invoiceNumbers } = await supabase
      .from("exhibitor_invoices")
      .select("id, invoice_number")
      .in(
        "id",
        createdRows.map((r) => r.invoice_id).filter((id): id is string => !!id),
      );
    const numberByInvoiceId = new Map((invoiceNumbers ?? []).map((r) => [r.id, r.invoice_number]));

    for (const row of createdRows) {
      const invoiceNumber = row.invoice_id ? numberByInvoiceId.get(row.invoice_id) : null;
      if (!row.invoice_id || !invoiceNumber || row.amount_yen == null) continue;
      await generateAndAttachInvoicePdf({
        supabase,
        context,
        eventId,
        invoiceId: row.invoice_id,
        invoiceNumber,
        participationId: row.event_participation_id,
        amountYen: row.amount_yen,
        dueDate,
      });
    }
  }

  const createdCount = createdRows.length;

  // 発行＝通知の期待に応えるため、キューに積むだけでなくその場で送信まで行う。
  await processPendingNotifications(50);

  revalidatePath(`/events/${eventId}/invoices`);
  redirect(`/events/${eventId}/invoices?done=bulk_invoices_created&count=${createdCount}`);
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

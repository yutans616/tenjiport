"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext, type OrganizerContext } from "@/lib/organizer/context";
import { sanitizeStorageFilename } from "@/lib/storage/sanitizeFilename";
import { checkEventStorageQuota } from "@/lib/storage/eventStorageQuota";
import { processPendingNotifications } from "@/lib/notifications/processPendingNotifications";
import { generateInvoicePdf } from "@/lib/pdf/generateInvoicePdf";
import {
  ADJUST_KEY,
  MANUAL_KEY,
  lineItemFormValue,
  loadBillingStates,
  parseLineItems,
  sumLineItems,
  type BillingLineItem,
} from "@/lib/billing/exhibitorBilling";

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

function autoPdfFilename(invoiceNumber: string) {
  return `請求書_${invoiceNumber}.pdf`;
}

// 請求書PDFを自動生成し、file_assetsに登録して請求書に紐付ける（replace時は差し替え）。
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
  issueDate: Date;
  lineItems: BillingLineItem[] | null;
  replace?: boolean;
}) {
  const { supabase, context, eventId, invoiceId, invoiceNumber, participationId, amountYen, dueDate, issueDate, replace } = params;

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

    const lineItems =
      params.lineItems && params.lineItems.length > 0
        ? params.lineItems.map((i) => ({ label: i.label, priceYen: i.price_yen, quantity: i.quantity }))
        : [{ label: "出展料", priceYen: amountYen, quantity: 1 }];

    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber,
      issueDate,
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
    const filename = autoPdfFilename(invoiceNumber);
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

    const { error: attachError } = await supabase.rpc(replace ? "replace_invoice_pdf" : "attach_invoice_pdf", {
      p_invoice_id: invoiceId,
      p_file_asset_id: fileAsset.id,
    });
    if (attachError) {
      console.error(`invoice pdf attach failed for ${invoiceId}: ${attachError.message}`);
    }
  } catch (err) {
    console.error(`invoice pdf generation failed for ${invoiceId}:`, err);
  }
}

function invoiceErrorMessage(message: string) {
  return message.includes("invoice_state_changed")
    ? "この出展者には画面を開いた後に別の請求書が発行されました。画面を再読み込みして内容を確認してください。"
    : message;
}

// 個別作成。「品目から作成」はフォームの選択内容のうち未請求の品目から選び、金額は品目の合計
// （サーバー側で再計算する）。「金額を入力して作成」は品目名と金額を手入力する。
export async function createInvoice(eventId: string, formData: FormData) {
  const { supabase, context } = await requireOrganizerEvent(eventId);

  const participationId = String(formData.get("participation_id") ?? "");
  const mode = formData.get("mode") === "manual" ? "manual" : "items";
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const memo = String(formData.get("memo") ?? "").trim() || null;
  const file = formData.get("file");

  if (!participationId) throw new Error("対象の出展者を選択してください。");
  const { data: participation } = await supabase
    .from("event_participations")
    .select("id, resolved_price_yen")
    .eq("id", participationId)
    .eq("event_id", eventId)
    .single();
  if (!participation) throw new Error("出展者が見つかりません。");

  let lineItems: BillingLineItem[];
  let amountYen: number;
  let expectedInvoicedTotal: number | null = null;
  if (mode === "items") {
    const selectedKeys = new Set(formData.getAll("item_keys").map(String));
    const { states } = await loadBillingStates(supabase, eventId, [participation]);
    const state = states.get(participation.id)!;
    lineItems = state.unbilledItems.filter((i) => selectedKeys.has(lineItemFormValue(i)));
    if (lineItems.length === 0) throw new Error("請求する品目を1つ以上選んでください。");
    amountYen = sumLineItems(lineItems);
    expectedInvoicedTotal = state.invoicedTotal;
  } else {
    amountYen = Number(formData.get("amount_yen"));
    const label = String(formData.get("manual_label") ?? "").trim() || "出展料";
    if (!Number.isFinite(amountYen) || amountYen < 0) throw new Error("金額を正しく入力してください。");
    amountYen = Math.round(amountYen);
    lineItems = [{ field_key: MANUAL_KEY, label, price_yen: amountYen, quantity: 1 }];
  }

  let invoiceFileId: string | null = null;
  let manualFileUploaded = false;
  if (file instanceof File && file.size > 0) {
    if (file.size > 20 * 1024 * 1024) {
      throw new Error(`ファイルサイズは20MB以下にしてください（このファイル: ${(file.size / 1024 / 1024).toFixed(1)}MB）。`);
    }
    const quota = await checkEventStorageQuota(eventId, file.size);
    if (!quota.ok) throw new Error(quota.error);

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
    p_amount_yen: amountYen,
    p_due_date: dueDate,
    p_organizer_internal_memo: memo,
    p_line_items: lineItems,
    p_expected_invoiced_total: expectedInvoicedTotal,
  });
  if (error) throw new Error(`請求書の作成に失敗しました: ${invoiceErrorMessage(error.message)}`);

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
      issueDate: new Date(invoice.created_at),
      lineItems,
    });
  }

  // 請求書の発行＝通知の期待に応えるため、キューに積むだけでなくその場で送信まで行う。
  await processPendingNotifications(50);

  revalidatePath(`/events/${eventId}/invoices`);
  redirect(`/events/${eventId}/invoices/${invoice.id}`);
}

// 一括発行。選んだ出展者ごとに、選んだ項目（ブース・オプション品等）の未請求の品目だけを
// 1枚の請求書にまとめて発行する。既に請求書がある出展者にも、未請求分があれば追加で発行する。
export async function createInvoicesBulkAction(eventId: string, formData: FormData) {
  const { supabase, context } = await requireOrganizerEvent(eventId);
  if (context.role !== "owner" && context.role !== "admin") {
    throw new Error("この操作を行う権限がありません。");
  }

  const participationIds = formData.getAll("participation_ids").map(String);
  const fieldKeys = new Set(formData.getAll("field_keys").map(String));
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const memo = String(formData.get("memo") ?? "").trim() || null;

  if (participationIds.length === 0) throw new Error("対象を1件以上選んでください。");
  if (fieldKeys.size === 0) throw new Error("請求する項目を1つ以上選んでください。");
  if (!dueDate) throw new Error("支払期限を入力してください。");

  const { data: participations } = await supabase
    .from("event_participations")
    .select("id, resolved_price_yen")
    .eq("event_id", eventId)
    .in("id", participationIds)
    .not("status", "in", "(cancelled,merged)");
  const { states } = await loadBillingStates(supabase, eventId, participations ?? []);

  let createdCount = 0;
  let skippedCount = participationIds.length - (participations ?? []).length;
  for (const p of participations ?? []) {
    const state = states.get(p.id)!;
    const lineItems = state.unbilledItems.filter((i) => fieldKeys.has(i.field_key));
    if (state.hasUnitemizedInvoice || lineItems.length === 0) {
      skippedCount++;
      continue;
    }

    const { data: invoice, error } = await supabase.rpc("create_exhibitor_invoice", {
      p_event_participation_id: p.id,
      p_invoice_file_id: null,
      p_amount_yen: sumLineItems(lineItems),
      p_due_date: dueDate,
      p_organizer_internal_memo: memo,
      p_line_items: lineItems,
      p_expected_invoiced_total: state.invoicedTotal,
    });
    if (error || !invoice) {
      console.error(`bulk invoice creation failed for ${p.id}: ${error?.message}`);
      skippedCount++;
      continue;
    }
    createdCount++;

    if (invoice.invoice_number) {
      await generateAndAttachInvoicePdf({
        supabase,
        context,
        eventId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        participationId: p.id,
        amountYen: invoice.amount_yen,
        dueDate: invoice.due_date,
        issueDate: new Date(invoice.created_at),
        lineItems,
      });
    }
  }

  // 発行＝通知の期待に応えるため、キューに積むだけでなくその場で送信まで行う。
  await processPendingNotifications(Math.max(50, createdCount));

  revalidatePath(`/events/${eventId}/invoices`);
  redirect(`/events/${eventId}/invoices?done=bulk_invoices_created&count=${createdCount}&skipped=${skippedCount}`);
}

export async function resendInvoiceReminderAction(eventId: string, invoiceId: string) {
  const { supabase } = await requireOrganizerEvent(eventId);

  const { error } = await supabase.rpc("resend_invoice_reminder", { p_invoice_id: invoiceId });
  if (error) throw new Error(`再請求に失敗しました: ${error.message}`);

  await processPendingNotifications(50);
  revalidatePath(`/events/${eventId}/invoices/${invoiceId}`);
  redirect(`/events/${eventId}/invoices/${invoiceId}?done=invoice_resent`);
}

export async function remindUnpaidInvoicesBulkAction(eventId: string) {
  const { supabase, context } = await requireOrganizerEvent(eventId);
  if (context.role !== "owner" && context.role !== "admin") {
    throw new Error("この操作を行う権限がありません。");
  }

  const { data: participations } = await supabase
    .from("event_participations")
    .select("id")
    .eq("event_id", eventId)
    .neq("status", "cancelled");
  const { data: unpaidInvoices } = await supabase
    .from("exhibitor_invoices")
    .select("id")
    .in("event_participation_id", (participations ?? []).map((p) => p.id))
    .eq("payment_status", "unpaid");

  let remindedCount = 0;
  for (const invoice of unpaidInvoices ?? []) {
    const { error } = await supabase.rpc("resend_invoice_reminder", { p_invoice_id: invoice.id });
    if (error) {
      console.error(`bulk invoice reminder failed for ${invoice.id}: ${error.message}`);
      continue;
    }
    remindedCount++;
  }

  await processPendingNotifications(Math.max(50, remindedCount));
  revalidatePath(`/events/${eventId}/invoices`);
  redirect(`/events/${eventId}/invoices?payment=unpaid&done=bulk_reminded&count=${remindedCount}`);
}

// 金額を訂正した場合、品目の記録がある請求書は差額を調整行として品目に加え（品目自体は
// 請求済みのまま扱う）、自動生成したPDFは新しい金額・支払期限で作り直して差し替える。
// 主催者がアップロードしたPDFは差し替えない。
export async function updateInvoiceDetails(eventId: string, invoiceId: string, formData: FormData) {
  const { supabase, context } = await requireOrganizerEvent(eventId);

  const amountYen = Number(formData.get("amount_yen"));
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const memo = String(formData.get("memo") ?? "").trim() || null;
  if (!Number.isFinite(amountYen) || amountYen < 0) throw new Error("金額を正しく入力してください。");
  const newAmount = Math.round(amountYen);

  const { data: invoice } = await supabase
    .from("exhibitor_invoices")
    .select("id, invoice_number, event_participation_id, amount_yen, due_date, line_items_json, invoice_file_id, created_at, file_assets(filename)")
    .eq("id", invoiceId)
    .single();
  if (!invoice) throw new Error("請求書が見つかりません。");

  const amountChanged = invoice.amount_yen !== newAmount;
  const items = parseLineItems(invoice.line_items_json);
  let newItems: BillingLineItem[] | null = null;
  if (amountChanged && items) {
    const base = items.filter((i) => i.field_key !== ADJUST_KEY);
    if (base.length === 1 && base[0].field_key === MANUAL_KEY) {
      newItems = [{ ...base[0], price_yen: newAmount }];
    } else {
      const diff = newAmount - sumLineItems(base);
      newItems =
        diff === 0
          ? base
          : [...base, { field_key: ADJUST_KEY, label: diff < 0 ? "値引き・調整" : "調整", price_yen: diff, quantity: 1 }];
    }
  }

  const { error } = await supabase.rpc("update_invoice_details", {
    p_invoice_id: invoiceId,
    p_amount_yen: newAmount,
    p_due_date: dueDate,
    p_organizer_internal_memo: memo,
    p_line_items: newItems,
  });
  if (error) throw new Error(`更新に失敗しました: ${error.message}`);

  const file = Array.isArray(invoice.file_assets) ? invoice.file_assets[0] : invoice.file_assets;
  const isAutoPdf = !invoice.invoice_file_id || (invoice.invoice_number && file?.filename === autoPdfFilename(invoice.invoice_number));
  if ((amountChanged || invoice.due_date !== dueDate) && isAutoPdf && invoice.invoice_number) {
    await generateAndAttachInvoicePdf({
      supabase,
      context,
      eventId,
      invoiceId,
      invoiceNumber: invoice.invoice_number,
      participationId: invoice.event_participation_id,
      amountYen: newAmount,
      dueDate,
      issueDate: new Date(invoice.created_at),
      lineItems: newItems ?? items,
      replace: !!invoice.invoice_file_id,
    });
  }

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

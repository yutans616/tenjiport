import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { generateServiceInvoicePdf } from "@/lib/pdf/generateServiceInvoicePdf";
import { TENJIPORT_SELLER_INFO } from "@/lib/pdf/tenjiportSellerInfo";
import { sanitizeStorageFilename } from "@/lib/storage/sanitizeFilename";

const CHARGE_KIND_LABEL: Record<string, string> = { base_fee: "TenjiPort利用料（基本料金）", overage: "TenjiPort利用料（超過分）" };

// 課金成功時に、適格請求書としての記載要件を満たすPDFを自動生成しfile_assetsに登録・紐付ける。
// 請求書番号もここで初めて採番する（課金が成功した行だけが本物の請求書番号を消費する）。
// 生成に失敗しても課金自体は既に成功しているため、処理は継続する（コンソールにのみ記録）。
export async function generateAndAttachServiceInvoicePdf(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  invoiceId: string,
) {
  try {
    const { data: invoice } = await serviceClient
      .from("service_invoices")
      .select("id, organizer_organization_id, event_id, charge_kind, total_amount_yen, invoice_file_id, organizer_organizations(name)")
      .eq("id", invoiceId)
      .single();
    if (!invoice || invoice.invoice_file_id) return;

    const org = Array.isArray(invoice.organizer_organizations) ? invoice.organizer_organizations[0] : invoice.organizer_organizations;

    const { data: invoiceNumber, error: numberError } = await serviceClient.rpc("assign_service_invoice_number", {
      p_service_invoice_id: invoiceId,
    });
    if (numberError || !invoiceNumber) {
      console.error(`service invoice pdf: failed to assign number for ${invoiceId}:`, numberError?.message);
      return;
    }

    const pdfBuffer = await generateServiceInvoicePdf({
      invoiceNumber,
      issueDate: new Date(),
      organizerName: org?.name ?? "（不明な組織）",
      sellerCompanyName: TENJIPORT_SELLER_INFO.companyName,
      sellerPostalCode: TENJIPORT_SELLER_INFO.postalCode,
      sellerAddress: TENJIPORT_SELLER_INFO.address,
      sellerPhoneNumber: TENJIPORT_SELLER_INFO.phoneNumber,
      registrationNumber: TENJIPORT_SELLER_INFO.registrationNumber,
      lineItemLabel: CHARGE_KIND_LABEL[invoice.charge_kind ?? ""] ?? "TenjiPort利用料",
      amountYen: invoice.total_amount_yen,
    });

    const filename = `請求書_${invoiceNumber}.pdf`;
    const storageKey = `${invoice.organizer_organization_id}/service-invoices/${randomUUID()}-${sanitizeStorageFilename(filename)}`;
    const { error: uploadError } = await serviceClient.storage
      .from("files")
      .upload(storageKey, pdfBuffer, { contentType: "application/pdf" });
    if (uploadError) {
      console.error(`service invoice pdf upload failed for ${invoiceId}: ${uploadError.message}`);
      return;
    }

    const { data: fileAsset, error: fileAssetError } = await serviceClient
      .from("file_assets")
      .insert({
        organizer_organization_id: invoice.organizer_organization_id,
        event_id: invoice.event_id,
        kind: "invoice_pdf",
        storage_key: storageKey,
        filename,
        content_type: "application/pdf",
        size_bytes: pdfBuffer.length,
      })
      .select("id")
      .single();
    if (fileAssetError || !fileAsset) {
      console.error(`service invoice pdf file_assets insert failed for ${invoiceId}: ${fileAssetError?.message}`);
      return;
    }

    const { error: attachError } = await serviceClient.rpc("attach_service_invoice_pdf", {
      p_service_invoice_id: invoiceId,
      p_file_asset_id: fileAsset.id,
    });
    if (attachError) {
      console.error(`attach_service_invoice_pdf failed for ${invoiceId}: ${attachError.message}`);
    }
  } catch (err) {
    console.error(`service invoice pdf generation failed for ${invoiceId}:`, err);
  }
}

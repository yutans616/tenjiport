import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createResendClient } from "@/lib/resend";
import { createExhibitorAccessLink } from "./exhibitorAccessLink";

const TEMPLATE_SUBJECT: Record<string, string> = {
  announcement_publish: "資料が公開されました",
  announcement_resend: "【再送】ご確認をお願いします",
  invoice_publish: "請求書が届いています",
  revision_request: "入力内容の修正をお願いします",
};

export type ProcessResult = { deliveryId: string; ok: boolean; detail: string };

/**
 * status='pending' の notification_deliveries を最大p_limit件処理する。
 * Resend未設定の場合は、無限リトライにならないよう理由付きでfailedにする。
 * 本番ではVercel Cron等から定期実行する想定（/api/notifications/process 経由）。
 */
export async function processPendingNotifications(limit = 20): Promise<ProcessResult[]> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const serviceClient = createServiceRoleClient();

  const { data: batch, error: batchError } = await serviceClient.rpc("get_pending_notification_batch", {
    p_limit: limit,
  });
  if (batchError) {
    throw new Error(batchError.message);
  }

  const results: ProcessResult[] = [];

  if (!resendApiKey || !fromEmail) {
    for (const item of batch ?? []) {
      await serviceClient.rpc("mark_notification_failed", {
        p_delivery_id: item.delivery_id,
        p_error_message: "RESEND_API_KEY または RESEND_FROM_EMAIL が未設定です",
      });
      results.push({ deliveryId: item.delivery_id, ok: false, detail: "resend not configured" });
    }
    return results;
  }

  const resend = createResendClient();

  for (const item of batch ?? []) {
    try {
      if (!item.recipient_email) throw new Error("recipient email not found");
      if (!item.public_form_token) throw new Error("event not found for this delivery");

      const nextPath =
        item.related_entity_type === "exhibitor_invoice"
          ? `/apply/${item.public_form_token}/invoices/${item.related_entity_id}`
          : item.related_entity_type === "revision_request"
            ? `/apply/${item.public_form_token}/form`
            : `/apply/${item.public_form_token}/announcements/${item.related_entity_id}`;
      const link = await createExhibitorAccessLink(item.recipient_email, nextPath);
      const subject = TEMPLATE_SUBJECT[item.template_type] ?? "お知らせ";

      const { data: sendResult, error: sendError } = await resend.emails.send({
        from: fromEmail,
        to: item.recipient_email,
        subject: item.announcement_title ? `${subject}: ${item.announcement_title}` : subject,
        html: `
          ${item.announcement_title ? `<p>${item.announcement_title}</p>` : ""}
          ${item.announcement_body ? `<p>${item.announcement_body}</p>` : ""}
          <p>下記リンクから内容をご確認ください。</p>
          <p><a href="${link}">${link}</a></p>
          <p>このリンクは一定時間で無効になります。</p>
        `,
      });

      if (sendError) throw new Error(sendError.message);

      await serviceClient.rpc("mark_notification_sent", {
        p_delivery_id: item.delivery_id,
        p_provider_message_id: sendResult?.id ?? null,
      });
      results.push({ deliveryId: item.delivery_id, ok: true, detail: "sent" });
    } catch (err) {
      await serviceClient.rpc("mark_notification_failed", {
        p_delivery_id: item.delivery_id,
        p_error_message: String(err instanceof Error ? err.message : err),
      });
      results.push({ deliveryId: item.delivery_id, ok: false, detail: String(err) });
    }
  }

  return results;
}

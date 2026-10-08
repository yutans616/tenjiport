import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createResendClient } from "@/lib/resend";
import { createExhibitorAccessLink } from "./exhibitorAccessLink";
import {
  EMAIL_TEMPLATE_TYPES,
  renderNotificationEmail,
  type EmailTemplateOverrides,
  type EmailTemplateType,
} from "./emailTemplates";

export type ProcessResult = { deliveryId: string; ok: boolean; detail: string };

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

function formatYen(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

async function loadOverrides(db: ServiceClient, organizationId: string): Promise<EmailTemplateOverrides> {
  const { data } = await db
    .from("organization_email_templates")
    .select("template_type, subject, body")
    .eq("organization_id", organizationId);
  return Object.fromEntries((data ?? []).map((r) => [r.template_type, { subject: r.subject, body: r.body }]));
}

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
  const overridesByOrg = new Map<string, EmailTemplateOverrides>();

  for (const item of batch ?? []) {
    try {
      if (!item.recipient_email) throw new Error("recipient email not found");
      if (!item.public_form_token) throw new Error("event not found for this delivery");
      const templateType = item.template_type as EmailTemplateType;
      if (!EMAIL_TEMPLATE_TYPES.includes(templateType)) throw new Error(`unknown template type: ${item.template_type}`);

      const { data: participation } = await serviceClient
        .from("event_participations")
        .select("exhibitor_profiles(brand_name), events(name, venue, start_date, end_date, organizer_organization_id, organizer_organizations(name))")
        .eq("id", item.event_participation_id)
        .single();
      const profile = Array.isArray(participation?.exhibitor_profiles) ? participation.exhibitor_profiles[0] : participation?.exhibitor_profiles;
      const event = Array.isArray(participation?.events) ? participation.events[0] : participation?.events;
      const org = Array.isArray(event?.organizer_organizations) ? event.organizer_organizations[0] : event?.organizer_organizations;

      const vars: Record<string, string> = {
        イベント名: event?.name ?? "",
        ブランド名: profile?.brand_name && profile.brand_name !== "未設定" ? profile.brand_name : "出展者",
        主催者名: org?.name ?? "",
      };
      let announcementBody: string | null = null;
      if (item.related_entity_type === "announcement_version") {
        vars["資料タイトル"] = item.announcement_title ?? "";
        announcementBody = item.announcement_body ?? null;
      } else if (item.related_entity_type === "exhibitor_invoice") {
        const { data: invoice } = await serviceClient
          .from("exhibitor_invoices")
          .select("amount_yen, due_date")
          .eq("id", item.related_entity_id)
          .maybeSingle();
        vars["請求金額"] = invoice ? formatYen(invoice.amount_yen) : "";
        vars["支払期限"] = invoice?.due_date ?? "（記載なし）";
      } else if (item.related_entity_type === "revision_request") {
        const { data: revision } = await serviceClient.from("revision_requests").select("comment").eq("id", item.related_entity_id).maybeSingle();
        vars["修正依頼内容"] = revision?.comment ?? "";
      } else if (item.related_entity_type === "event_participation") {
        vars["開催期間"] = event?.start_date ? `${event.start_date}〜${event.end_date ?? ""}` : (event?.end_date ?? "未定");
        vars["会場"] = event?.venue ?? "未定";
      }

      const organizationId = event?.organizer_organization_id as string | undefined;
      if (organizationId && !overridesByOrg.has(organizationId)) {
        overridesByOrg.set(organizationId, await loadOverrides(serviceClient, organizationId));
      }

      const nextPath =
        item.related_entity_type === "exhibitor_invoice"
          ? `/apply/${item.public_form_token}/invoices/${item.related_entity_id}`
          : item.related_entity_type === "revision_request" || item.related_entity_type === "event_participation"
            ? `/apply/${item.public_form_token}/form`
            : `/apply/${item.public_form_token}/announcements/${item.related_entity_id}`;
      const link = await createExhibitorAccessLink(item.recipient_email, nextPath);

      const rendered = renderNotificationEmail({
        templateType,
        overrides: organizationId ? overridesByOrg.get(organizationId)! : {},
        vars,
        link,
        announcementBody,
      });

      // デモ組織（tenjiport_demo_lp_spec.md 4.3節）向けの通知は実送信しない。
      // 操作デモは「通知プレビューを表示し、実送信しない」仕様のため、Resendを
      // 呼ばずに送信済み扱いにする（デモ画面側の状態遷移は通常どおり進める）。
      if (item.is_demo) {
        await serviceClient.rpc("mark_notification_sent", {
          p_delivery_id: item.delivery_id,
          p_provider_message_id: "demo-preview-not-sent",
        });
        await saveSentContent(serviceClient, item.delivery_id, rendered.subject, rendered.text);
        results.push({ deliveryId: item.delivery_id, ok: true, detail: "demo: skipped real send" });
        continue;
      }

      const { data: sendResult, error: sendError } = await resend.emails.send({
        from: fromEmail,
        to: item.recipient_email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (sendError) throw new Error(sendError.message);

      await serviceClient.rpc("mark_notification_sent", {
        p_delivery_id: item.delivery_id,
        p_provider_message_id: sendResult?.id ?? null,
      });
      await saveSentContent(serviceClient, item.delivery_id, rendered.subject, rendered.text);
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

// 送信済みの文面を主催者が後から確認できるよう残す（確認用リンクは時間で失効するワンタイムの
// ものなので、本文から伏せて保存する）。
async function saveSentContent(db: ServiceClient, deliveryId: string, subject: string, text: string) {
  const masked = text.replace(/https?:\/\/\S*\/auth\/confirm\?\S+/g, "（出展者ごとの確認用リンク）");
  const { error } = await db.from("notification_deliveries").update({ sent_subject: subject, sent_body: masked }).eq("id", deliveryId);
  if (error) console.error(`saving sent content failed for ${deliveryId}: ${error.message}`);
}

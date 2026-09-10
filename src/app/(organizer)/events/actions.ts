"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext } from "@/lib/organizer/context";
import { attemptCharge, type ServiceInvoiceRow } from "@/lib/billing/runEventBilling";

// イベント作成時の基本料金課金に失敗した場合のロールバック。events・service_invoicesとも
// 一般ユーザー（RLS）にはDELETE権限が無い（eventsはRLS上そもそも削除ポリシーが無く、
// service_invoicesはSELECTのみ）ため、service roleで行う。また、service_invoicesが
// events.idを参照しているため、先に請求行を削除してからでないとevents削除が
// 外部キー制約違反で失敗する。
async function rollbackEventCreation(eventId: string) {
  const serviceClient = createServiceRoleClient();
  await serviceClient.from("service_invoices").delete().eq("event_id", eventId);
  await serviceClient.from("events").delete().eq("id", eventId);
}

function parseFormFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim() || null;
  const startDate = String(formData.get("start_date") ?? "").trim() || null;
  const endDate = String(formData.get("end_date") ?? "").trim() || null;

  if (!name) {
    throw new Error("イベント名は必須です。");
  }
  if (!endDate) {
    throw new Error("終了日は必須です。");
  }

  return { name, venue, start_date: startDate, end_date: endDate };
}

export async function createEvent(formData: FormData) {
  const context = await getOrganizerContext();
  if (!context) {
    redirect("/login");
    return;
  }

  const supabase = await createClient();

  // プラン未選択（契約なし）の組織はイベントを作成できない（/plan へ誘導する）。
  const { data: contract } = await supabase
    .from("service_contracts")
    .select("id, plan_type")
    .eq("organizer_organization_id", context.organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (!contract) {
    redirect("/plan");
    return;
  }

  const fields = parseFormFields(formData);

  const { data: event, error } = await supabase
    .from("events")
    .insert({ ...fields, organizer_organization_id: context.organizationId })
    .select()
    .single();

  if (error || !event) {
    throw new Error(`イベントの作成に失敗しました: ${error?.message}`);
  }

  // 通常プランはイベント作成時に基本料金を即時課金する（成功しなければ作成をロールバックする）。
  // ここでの失敗はthrowせず/planへリダイレクトする——Server Actionの未処理エラーは
  // 「This page couldn't load」という不親切なクラッシュ画面になってしまうため、
  // カード未登録・決済失敗のどちらも/plan側で分かりやすく案内する。
  if (contract.plan_type === "standard") {
    const { data: invoice, error: invoiceError } = await supabase.rpc("charge_event_base_fee", {
      p_event_id: event.id,
    });
    if (invoiceError || !invoice) {
      await rollbackEventCreation(event.id);
      redirect("/plan?billingError=confirm_failed");
      return;
    }

    const result = await attemptCharge(invoice as ServiceInvoiceRow, event.name, false);
    const succeeded =
      result.outcome === "skipped_zero_amount" ||
      (result.outcome === "charge_attempted" && result.paymentIntentStatus === "succeeded");
    if (!succeeded) {
      await rollbackEventCreation(event.id);
      // no_payment_method は/plan側の「お支払い方法の登録が必須です」バナーが既に
      // 理由を説明しているため、専用メッセージはcharge_failedの場合のみ表示する。
      redirect(result.outcome === "no_payment_method" ? "/plan" : "/plan?billingError=charge_failed");
      return;
    }
  }

  await supabase.from("audit_logs").insert({
    actor_user_id: context.userId,
    organization_id: context.organizationId,
    action_type: "create",
    entity_type: "event",
    entity_id: event.id,
    after_json: event,
  });

  revalidatePath("/events");
  redirect(`/events/${event.id}`);
}

export async function updateEvent(eventId: string, formData: FormData) {
  const context = await getOrganizerContext();
  if (!context) {
    redirect("/login");
    return;
  }

  const fields = parseFormFields(formData);
  const status = String(formData.get("status") ?? "draft");
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("events")
    .select()
    .eq("id", eventId)
    .single();

  const { data: after, error } = await supabase
    .from("events")
    .update({ ...fields, status })
    .eq("id", eventId)
    .select()
    .single();

  if (error || !after) {
    throw new Error(`イベントの更新に失敗しました: ${error?.message}`);
  }

  await supabase.from("audit_logs").insert({
    actor_user_id: context.userId,
    organization_id: context.organizationId,
    action_type: "update",
    entity_type: "event",
    entity_id: eventId,
    before_json: before ?? null,
    after_json: after,
  });

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?done=saved`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { attemptCharge, type ServiceInvoiceRow } from "@/lib/billing/runEventBilling";

export async function startStandardPlanAction() {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { data: pricing } = await supabase
    .from("pricing_configs")
    .select("id")
    .eq("is_test", false)
    .order("effective_from", { ascending: false })
    .limit(1)
    .single();
  if (!pricing) throw new Error("価格設定が見つかりません。");

  const { error } = await supabase.rpc("start_standard_plan", {
    p_org_id: context.organizationId,
    p_pricing_config_id: pricing.id,
  });
  if (error) throw new Error(`プランの開始に失敗しました: ${error.message}`);

  revalidatePath("/plan");
}

// 年間プランは大型案件向けの個別提供のため、自組織にannual_plan_offer_config_idが
// 設定されている場合のみ許可する（UIでもボタンを隠すが、ここでも二重に検証する）。
async function requireAnnualPlanOffer(organizationId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: org } = await supabase
    .from("organizer_organizations")
    .select("annual_plan_offer_config_id")
    .eq("id", organizationId)
    .single();
  if (!org?.annual_plan_offer_config_id) {
    throw new Error("年間プランは現在ご案内対象外です。担当者までお問い合わせください。");
  }
  return org.annual_plan_offer_config_id as string;
}

export async function startAnnualPlanAction() {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const annualPlanConfigId = await requireAnnualPlanOffer(context.organizationId, supabase);

  const { error } = await supabase.rpc("start_annual_plan", {
    p_org_id: context.organizationId,
    p_annual_plan_config_id: annualPlanConfigId,
  });
  if (error) throw new Error(`プランの開始に失敗しました: ${error.message}`);

  revalidatePath("/plan");
}

export async function changeToAnnualPlanAction() {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const annualPlanConfigId = await requireAnnualPlanOffer(context.organizationId, supabase);

  const { error } = await supabase.rpc("change_to_annual_plan", {
    p_org_id: context.organizationId,
    p_annual_plan_config_id: annualPlanConfigId,
  });
  if (error) throw new Error(`プラン変更に失敗しました: ${error.message}`);

  revalidatePath("/plan");
}

export async function changeToStandardPlanAction() {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { data: pricing } = await supabase
    .from("pricing_configs")
    .select("id")
    .eq("is_test", false)
    .order("effective_from", { ascending: false })
    .limit(1)
    .single();
  if (!pricing) throw new Error("価格設定が見つかりません。");

  const { error } = await supabase.rpc("change_to_standard_plan", {
    p_org_id: context.organizationId,
    p_pricing_config_id: pricing.id,
  });
  if (error) throw new Error(`プラン変更に失敗しました: ${error.message}`);

  revalidatePath("/plan");
}

// 自動リトライを使い切った（uncollectible）、または前回失敗（failed）の請求を、
// カード情報更新後などに次回の自動リトライ（最大3日後）を待たずその場で再試行する。
// 顧客本人が操作中の即時課金のためoffSession=falseで呼ぶ。
export async function retryServiceInvoiceAction(invoiceId: string) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("service_invoices")
    .select("id, organizer_organization_id, event_id, total_amount_yen, status, retry_count, stripe_payment_intent_id, events(name)")
    .eq("id", invoiceId)
    .eq("organizer_organization_id", context.organizationId)
    .single();
  if (!invoice) throw new Error("請求が見つかりません。");
  if (invoice.status !== "failed" && invoice.status !== "uncollectible") {
    throw new Error("この請求は再試行の対象ではありません。");
  }

  const event = Array.isArray(invoice.events) ? invoice.events[0] : invoice.events;
  await attemptCharge(invoice as ServiceInvoiceRow, event?.name ?? "（不明なイベント）", false);

  revalidatePath("/plan");
}

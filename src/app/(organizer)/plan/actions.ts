"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";

export async function startStandardPlanAction() {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { data: pricing } = await supabase
    .from("pricing_configs")
    .select("id")
    .eq("is_test", true)
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

export async function startAnnualPlanAction() {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { data: annualConfig } = await supabase
    .from("annual_plan_configs")
    .select("id")
    .eq("is_test", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .single();
  if (!annualConfig) throw new Error("年間プランの設定が見つかりません。");

  const { error } = await supabase.rpc("start_annual_plan", {
    p_org_id: context.organizationId,
    p_annual_plan_config_id: annualConfig.id,
  });
  if (error) throw new Error(`プランの開始に失敗しました: ${error.message}`);

  revalidatePath("/plan");
}

export async function changeToAnnualPlanAction() {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { data: annualConfig } = await supabase
    .from("annual_plan_configs")
    .select("id")
    .eq("is_test", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .single();
  if (!annualConfig) throw new Error("年間プランの設定が見つかりません。");

  const { error } = await supabase.rpc("change_to_annual_plan", {
    p_org_id: context.organizationId,
    p_annual_plan_config_id: annualConfig.id,
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
    .eq("is_test", true)
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

// 本番ではVercel Cron等で月次実行する想定。ローカル開発では手動トリガー用のボタンとして残す。
export async function generateInvoiceNowAction(serviceContractId: string) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);
  const periodEnd = new Date();

  const { error } = await supabase.rpc("generate_service_invoice", {
    p_service_contract_id: serviceContractId,
    p_billing_period_start: periodStart.toISOString(),
    p_billing_period_end: periodEnd.toISOString(),
  });
  if (error) throw new Error(`請求の確定に失敗しました: ${error.message}`);

  revalidatePath("/plan");
}

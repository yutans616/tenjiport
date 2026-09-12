"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrganizerContext } from "@/lib/organizer/context";
import { attemptCharge, type ServiceInvoiceRow } from "@/lib/billing/runEventBilling";

type BillingMethod = "invoice" | "card";

// 年間プランをクレカ払いで開始・切替する際に契約と同時に即時課金する。失敗時は
// rollbackAnnualPlanContractで契約自体を取り消す（イベント作成時の基本料金課金と
// 同じ考え方：課金できなかった契約を残さない）。
async function chargeNewAnnualContract(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  contractId: string,
): Promise<boolean> {
  const { data: invoice, error: invoiceError } = await supabase.rpc("charge_annual_plan_fee", {
    p_service_contract_id: contractId,
  });
  if (invoiceError || !invoice) return false;

  const result = await attemptCharge(invoice as ServiceInvoiceRow, "年間プラン契約", false);
  const succeeded =
    result.outcome === "skipped_zero_amount" ||
    (result.outcome === "charge_attempted" && result.paymentIntentStatus === "succeeded");
  if (!succeeded) return false;

  // 表示用のpayment_method_status（この時点でカードは実際に課金に使えたことが
  // 確認済みのため、新しい契約行にも'valid'を反映する。record_payment_method_setupは
  // カード登録時と同じ既存RPCの再利用で、新しいコードを増やさない）。
  const { data: org } = await supabase
    .from("organizer_organizations")
    .select("payment_provider_customer_id, stripe_default_payment_method_id")
    .eq("id", organizationId)
    .single();
  if (org?.payment_provider_customer_id && org?.stripe_default_payment_method_id) {
    await supabase.rpc("record_payment_method_setup", {
      p_org_id: organizationId,
      p_stripe_customer_id: org.payment_provider_customer_id,
      p_stripe_payment_method_id: org.stripe_default_payment_method_id,
    });
  }
  return true;
}

// 課金失敗時、契約自体を取り消す（events/actions.tsのrollbackEventCreationと同じ理由：
// 一般ユーザーのRLSにはservice_contracts/service_invoicesへのDELETE権限が無いため
// service roleで行う。invoiceが先、contractが後（外部キー制約の順序）。
async function rollbackAnnualPlanContract(contractId: string) {
  const serviceClient = createServiceRoleClient();
  await serviceClient.from("service_invoices").delete().eq("service_contract_id", contractId);
  await serviceClient.from("service_contracts").delete().eq("id", contractId);
}

async function requireCardOnFile(organizationId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: org } = await supabase
    .from("organizer_organizations")
    .select("payment_provider_customer_id, stripe_default_payment_method_id")
    .eq("id", organizationId)
    .single();
  if (!org?.payment_provider_customer_id || !org?.stripe_default_payment_method_id) {
    throw new Error("先にカードを登録してください。");
  }
}

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

export async function startAnnualPlanAction(billingMethod: BillingMethod) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const annualPlanConfigId = await requireAnnualPlanOffer(context.organizationId, supabase);
  if (billingMethod === "card") {
    await requireCardOnFile(context.organizationId, supabase);
  }

  const { data: contract, error } = await supabase.rpc("start_annual_plan", {
    p_org_id: context.organizationId,
    p_annual_plan_config_id: annualPlanConfigId,
    p_billing_method: billingMethod,
  });
  if (error || !contract) throw new Error(`プランの開始に失敗しました: ${error?.message}`);

  if (billingMethod === "card") {
    const succeeded = await chargeNewAnnualContract(supabase, context.organizationId, contract.id);
    if (!succeeded) {
      await rollbackAnnualPlanContract(contract.id);
      redirect("/plan?billingError=annual_charge_failed");
    }
  }

  revalidatePath("/plan");
}

export async function changeToAnnualPlanAction(billingMethod: BillingMethod) {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const annualPlanConfigId = await requireAnnualPlanOffer(context.organizationId, supabase);
  if (billingMethod === "card") {
    await requireCardOnFile(context.organizationId, supabase);
  }

  const { data: contract, error } = await supabase.rpc("change_to_annual_plan", {
    p_org_id: context.organizationId,
    p_annual_plan_config_id: annualPlanConfigId,
    p_billing_method: billingMethod,
  });
  if (error || !contract) throw new Error(`プラン変更に失敗しました: ${error?.message}`);

  if (billingMethod === "card") {
    const succeeded = await chargeNewAnnualContract(supabase, context.organizationId, contract.id);
    if (!succeeded) {
      await rollbackAnnualPlanContract(contract.id);
      redirect("/plan?billingError=annual_charge_failed");
    }
  }

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
    .select(
      "id, organizer_organization_id, event_id, charge_kind, total_amount_yen, status, retry_count, stripe_payment_intent_id, events(name)",
    )
    .eq("id", invoiceId)
    .eq("organizer_organization_id", context.organizationId)
    .single();
  if (!invoice) throw new Error("請求が見つかりません。");
  if (invoice.status !== "failed" && invoice.status !== "uncollectible") {
    throw new Error("この請求は再試行の対象ではありません。");
  }

  const event = Array.isArray(invoice.events) ? invoice.events[0] : invoice.events;
  const displayName = event?.name ?? (invoice.charge_kind === "annual_fee" ? "年間プラン契約" : "（不明なイベント）");
  await attemptCharge(invoice as ServiceInvoiceRow, displayName, false);

  revalidatePath("/plan");
}

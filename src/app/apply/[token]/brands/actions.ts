"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateBrandProfileAction(token: string, profileId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/apply/${token}`);

  const brandName = String(formData.get("brand_name") ?? "").trim();
  const companyName = String(formData.get("company_name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const website = String(formData.get("website") ?? "").trim() || null;
  const contactName = String(formData.get("default_contact_name") ?? "").trim() || null;
  const contactEmail = String(formData.get("default_contact_email") ?? "").trim() || null;
  const contactPhone = String(formData.get("default_contact_phone") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!brandName) throw new Error("ブランド名は必須です。");
  if (!companyName) throw new Error("会社名は必須です。");

  const { error } = await supabase.rpc("update_exhibitor_profile", {
    p_exhibitor_profile_id: profileId,
    p_brand_name: brandName,
    p_company_name: companyName,
    p_address: address,
    p_website: website,
    p_default_contact_name: contactName,
    p_default_contact_email: contactEmail,
    p_default_contact_phone: contactPhone,
    p_description: description,
  });
  if (error) throw new Error(`保存に失敗しました: ${error.message}`);

  revalidatePath(`/apply/${token}/brands/${profileId}`);
  revalidatePath(`/apply/${token}/brands`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";

async function requireProjectManager() {
  const context = await getOrganizerContext();
  if (!context) redirect("/login");
  if (context!.role !== "owner" && context!.role !== "admin") {
    throw new Error("プロジェクトの管理はオーナー・管理者のみ行えます。");
  }
  return { context: context!, supabase: await createClient() };
}

function parseName(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("プロジェクト名を入力してください。");
  if (name.length > 100) throw new Error("プロジェクト名は100文字以内で入力してください。");
  return name;
}

export async function createProject(formData: FormData) {
  const { context, supabase } = await requireProjectManager();
  const name = parseName(formData);

  const { data: last } = await supabase
    .from("projects")
    .select("sort_order")
    .eq("organization_id", context.organizationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("projects")
    .insert({ organization_id: context.organizationId, name, sort_order: (last?.sort_order ?? -1) + 1 });
  if (error) throw new Error(`プロジェクトの作成に失敗しました: ${error.message}`);

  revalidatePath("/projects");
  revalidatePath("/events");
}

export async function renameProject(projectId: string, formData: FormData) {
  const { context, supabase } = await requireProjectManager();
  const name = parseName(formData);
  const { error } = await supabase
    .from("projects")
    .update({ name })
    .eq("id", projectId)
    .eq("organization_id", context.organizationId);
  if (error) throw new Error(`プロジェクト名の変更に失敗しました: ${error.message}`);

  revalidatePath("/projects");
  revalidatePath("/events");
}

// 所属イベントは削除されず「未分類」に戻る（events.project_idはon delete set null）。
export async function deleteProject(projectId: string) {
  const { context, supabase } = await requireProjectManager();
  const { error } = await supabase.from("projects").delete().eq("id", projectId).eq("organization_id", context.organizationId);
  if (error) throw new Error(`プロジェクトの削除に失敗しました: ${error.message}`);

  revalidatePath("/projects");
  revalidatePath("/events");
}

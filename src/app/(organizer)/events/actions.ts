"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";

function parseFormFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim() || null;
  const startDate = String(formData.get("start_date") ?? "").trim() || null;
  const endDate = String(formData.get("end_date") ?? "").trim() || null;

  if (!name) {
    throw new Error("イベント名は必須です。");
  }

  return { name, venue, start_date: startDate, end_date: endDate };
}

export async function createEvent(formData: FormData) {
  const context = await getOrganizerContext();
  if (!context) {
    redirect("/login");
    return;
  }

  const fields = parseFormFields(formData);
  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from("events")
    .insert({ ...fields, organizer_organization_id: context.organizationId })
    .select()
    .single();

  if (error || !event) {
    throw new Error(`イベントの作成に失敗しました: ${error?.message}`);
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

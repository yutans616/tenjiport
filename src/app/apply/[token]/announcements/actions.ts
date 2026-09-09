"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function acknowledgeAnnouncement(token: string, announcementVersionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_announcement", {
    p_announcement_version_id: announcementVersionId,
  });
  if (error) throw new Error(`確認の記録に失敗しました: ${error.message}`);

  revalidatePath(`/apply/${token}/announcements`);
  revalidatePath(`/apply/${token}/announcements/${announcementVersionId}`);
}

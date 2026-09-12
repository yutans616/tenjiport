"use server";

import { createClient } from "@/lib/supabase/server";

export type UpdatePasswordResult = { ok: true } | { ok: false; error: string };

// /auth/confirm（type=recovery）で確立されたリカバリーセッションを前提に、
// そのセッションのユーザー自身のパスワードを更新する。現在のパスワードは不要
// （メール内リンクを開けたこと自体が本人確認になっているため）。
export async function updatePassword(formData: FormData): Promise<UpdatePasswordResult> {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");

  if (password.length < 6) {
    return { ok: false, error: "パスワードは6文字以上で入力してください。" };
  }
  if (password !== passwordConfirm) {
    return { ok: false, error: "パスワードが一致しません。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "セッションが確認できませんでした。リンクの有効期限が切れている可能性があります。" };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, error: `パスワードの更新に失敗しました: ${error.message}` };
  }

  return { ok: true };
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteMemberAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export function InviteMemberForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const result = await inviteMemberAction(formData);

    setIsLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="email">メールアドレス</Label>
        <Input id="email" type="email" name="email" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="role">ロール</Label>
        <NativeSelect id="role" name="role" defaultValue="staff">
          <option value="admin">管理者（課金・チーム管理以外は全操作可）</option>
          <option value="staff">スタッフ（課金・チーム管理以外は全操作可）</option>
        </NativeSelect>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-700 dark:text-green-500">招待メールを送信しました。</p>}

      <Button type="submit" disabled={isLoading} className="self-start">
        {isLoading ? "送信中..." : "招待メールを送信"}
      </Button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { acceptInvitationAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AcceptInviteForm({ token, needsPassword }: { token: string; needsPassword: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (needsPassword) {
        if (password.length < 6) {
          setError("6文字以上のパスワードを設定してください。");
          return;
        }
        const supabase = createClient();
        const { error: pwError } = await supabase.auth.updateUser({ password });
        if (pwError) {
          setError(pwError.message);
          return;
        }
      }

      const result = await acceptInvitationAction(token);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push("/events");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleAccept} className="flex flex-col gap-4">
      {needsPassword && (
        <div className="grid gap-1.5">
          <Label htmlFor="password">パスワードを設定</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">次回以降、このメールアドレスとパスワードでログインできます。</p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? "処理中..." : "組織に参加する"}
      </Button>
    </form>
  );
}

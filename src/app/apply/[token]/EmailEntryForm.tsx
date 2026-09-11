"use client";

import { useState } from "react";
import { requestExhibitorOtp } from "./actions";
import { TurnstileWidget } from "./TurnstileWidget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailEntryForm({
  token,
  captchaEnabled,
  turnstileSiteKey,
}: {
  token: string;
  captchaEnabled: boolean;
  turnstileSiteKey: string | null;
}) {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showCaptcha = captchaEnabled && !!turnstileSiteKey;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    const result = await requestExhibitorOtp(token, email, honeypot, turnstileToken);

    setIsLoading(false);
    if (!result.ok) {
      setErrorMessage(result.error);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <p className="rounded-lg border bg-muted/40 p-4 text-sm text-green-700 dark:text-green-500">
        確認メールを送信しました。メール内のリンクを開くと入力画面に進みます。
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="email">メールアドレス</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      {/* ハニーポット：人間には見えない。Botが自動入力しやすいクラス名/属性をあえて付ける */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          ご担当者名（空欄のままにしてください）
          <input
            type="text"
            name="company_website"
            autoComplete="off"
            tabIndex={-1}
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      {showCaptcha && <TurnstileWidget siteKey={turnstileSiteKey!} onToken={setTurnstileToken} />}

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      <Button type="submit" disabled={isLoading || (showCaptcha && !turnstileToken)} className="w-full">
        {isLoading ? "送信中..." : "確認メールを送信"}
      </Button>
    </form>
  );
}

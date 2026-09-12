"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { sendPasswordResetEmail } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/onboard";
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    searchParams.get("error") === "confirm_failed"
      ? "メール確認リンクが無効です。もう一度お試しいただくか、再登録してください。"
      : null,
  );
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      if (mode === "forgot") {
        const result = await sendPasswordResetEmail(email);
        if (!result.ok) {
          setErrorMessage(result.error);
          return;
        }
        setInfoMessage("パスワード再設定用のメールを送信しました（該当するアカウントが存在する場合）。メール内のリンクを開いてください。");
        return;
      }

      const supabase = createClient();
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setErrorMessage(error.message);
          return;
        }
        router.push(next);
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        // メールテンプレート側で /auth/confirm?...&next=... を組み立てるため、行き先のみを渡す。
        options: { emailRedirectTo: `${window.location.origin}/onboard` },
      });
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      if (data.session) {
        router.push("/onboard");
        router.refresh();
        return;
      }
      setInfoMessage("確認メールを送信しました。メール内のリンクを開いてから、ログインしてください。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2">
          <Image src="/tenjiport_icon.png" alt="" width={32} height={32} className="h-8 w-8" />
          <span className="text-base font-semibold tracking-tight">TenjiPort</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {mode === "signin" ? "主催者ログイン" : mode === "signup" ? "主催者アカウントを作成" : "パスワードの再設定"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="email">メールアドレス</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {mode !== "forgot" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="password">パスワード</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}

              {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
              {infoMessage && <p className="text-sm text-green-700 dark:text-green-500">{infoMessage}</p>}

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading
                  ? "処理中..."
                  : mode === "signin"
                    ? "ログイン"
                    : mode === "signup"
                      ? "新規登録"
                      : "再設定メールを送信"}
              </Button>
            </form>

            {mode === "signin" && (
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setErrorMessage(null);
                  setInfoMessage(null);
                }}
                className="mt-3 text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline w-full"
              >
                パスワードをお忘れですか？
              </button>
            )}
          </CardContent>
        </Card>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : mode === "forgot" ? "signin" : "signup");
            setErrorMessage(null);
            setInfoMessage(null);
          }}
          className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {mode === "signin"
            ? "アカウントをお持ちでない方はこちら"
            : mode === "signup"
              ? "既にアカウントをお持ちの方はこちら"
              : "ログイン画面に戻る"}
        </button>
      </div>
    </div>
  );
}

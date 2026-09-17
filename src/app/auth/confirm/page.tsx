import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/organizer/submit-button";
import { confirmEmailAction } from "./actions";

// メール確認リンクの着地点。以前はGETで即座にverifyOtpしていたが、Gmail等の
// メールクライアントによるリンク事前スキャン（安全性チェックのための自動アクセス）が
// ワンタイムトークンを本人のクリック前に消費してしまい、実際にリンクを開いた本人が
// 「リンクが無効です」エラーになる不具合が確認された。GETでは何も消費せず、
// 本人の明示的なクリック（下のボタン＝Server Action呼び出し）があって初めて
// verifyOtpを行うことで、自動スキャンによる誤消費を防ぐ。
export default async function AuthConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;

  if (!token_hash || !type) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-base">リンクが正しくありません</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">URLをご確認のうえ、もう一度お試しください。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">ログインを完了する</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">下のボタンを押すとログインが完了します。</p>
          <form action={confirmEmailAction}>
            <input type="hidden" name="token_hash" value={token_hash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="next" value={next ?? ""} />
            <SubmitButton pendingText="確認中..." className="w-full">
              ログインを完了する
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

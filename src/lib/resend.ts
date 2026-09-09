import { Resend } from "resend";

// トランザクションメール専用クライアント（提出確認・資料公開通知・請求書案内等）。
// 未承諾の営業メール送信には使わない（Resend利用規約、ブリーフ15章の注意点）。
export function createResendClient() {
  return new Resend(process.env.RESEND_API_KEY!);
}

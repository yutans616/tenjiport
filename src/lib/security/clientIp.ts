import { headers } from "next/headers";

// レート制限のキーとして使う簡易な送信元識別子。
// Vercel/多くのプロキシは x-forwarded-for の先頭がクライアントIP。ローカル開発では取得できないことが多い。
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

// Cloudflare Turnstileのトークンをサーバーサイドで検証する。
// TURNSTILE_SECRET_KEY未設定＝機能を有効化していない状態とみなし、検証をスキップする
// （トグルUI自体を表示しない設計と対で、キー未設定時に既存フローを壊さないため）。
export async function verifyTurnstile(token: string, remoteIp?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

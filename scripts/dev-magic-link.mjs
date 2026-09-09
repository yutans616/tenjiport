#!/usr/bin/env node
// 開発用：カスタムSMTP未設定でもメール確認フローを手元で試せるようにする。
// Supabase Admin API（service_role）でマジックリンクの検証トークンだけを発行し、
// 実際のメール送信は行わない。生成したURLをブラウザで直接開けば、
// アプリの /auth/confirm ルートを通って通常のメールリンクと同じようにログインできる。
//
// 【重要】このスクリプトは開発専用。service_role keyを使うため、
// API route等アプリ本体には絶対に組み込まないこと。
//
// 使い方:
//   node scripts/dev-magic-link.mjs <email> [next-path]
// 例:
//   node scripts/dev-magic-link.mjs exhibitor-test@example.invalid /apply/<token>/form

const [, , email, nextPath = "/onboard"] = process.argv;

if (!email) {
  console.error("使い方: node scripts/dev-magic-link.mjs <email> [next-path]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です（.env.localを読み込んで実行してください）");
  process.exit(1);
}

const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "magiclink",
    email,
    options: { redirect_to: appUrl },
  }),
});

const json = await res.json();

if (!res.ok || !json.hashed_token) {
  console.error("リンクの発行に失敗しました:", JSON.stringify(json));
  process.exit(1);
}

const confirmUrl = `${appUrl}/auth/confirm?token_hash=${json.hashed_token}&type=${json.verification_type}&next=${encodeURIComponent(nextPath)}`;

console.log("このURLをブラウザで開いてください（1回限り・すぐに期限切れになります）:");
console.log(confirmUrl);

import { createBrowserClient } from "@supabase/ssr";

// ブラウザ（Client Component）から利用する Supabase クライアント。
// 匿名キーのみを扱う。サービスロールキーは絶対にここへ持ち込まない。
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

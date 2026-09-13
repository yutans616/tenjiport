// デモ環境（実環境シード方式）で使う固定値。tenjiport_demo_lp_spec.md 4章参照。
// 初期投入は scripts/seed-demo.mjs（CLI、初回ブートストラップ用）。
// アプリ内の「最初に戻す」・深夜リセットは src/lib/demo/seed.ts（同ロジックのTS移植）を使う。
// 両者を変更する場合は必ず両方に反映すること。
export const DEMO_ORGANIZER_EMAIL = "demo-organizer@example.com";
export const DEMO_BACKGROUND_EXHIBITOR_EMAIL = "demo-background-exhibitor@example.com";
export const DEMO_FEATURED_EXHIBITOR_EMAIL = "demo-featured-exhibitor@example.com";

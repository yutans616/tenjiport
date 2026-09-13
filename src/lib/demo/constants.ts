// デモ環境（訪問者ごとに完全分離、tenjiport_demo_lp_spec.md 4.3節P2）で使う固定値。
// 訪問者ごとのデモ用authアカウントはトークンから動的に生成するため固定メールアドレスは
// 持たない（src/lib/demo/ephemeral.ts参照）。

// ブラウザにセットするCookie名。値はdemo_sessionsテーブルの主キー（token）。
export const DEMO_SESSION_COOKIE = "demo_token";

// 自動化スクリプト（Playwright録画・PDF資料用スクリーンショット・E2Eテスト）専用の
// 固定トークン。実行のたびに新しいエフェメラル組織・authユーザーが積み上がるのを防ぎ、
// 同一セッションを使い回して再現性のある素材を作れるようにする。実際の訪問者には
// 割り当てない（ランダムなトークンを使う）。
export const QA_STABLE_DEMO_TOKEN = "qa-stable-session";

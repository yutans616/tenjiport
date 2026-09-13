"use client";

// 計測ヘルパー（tenjiport_demo_lp_spec.md 8章）。GA4のgtag.jsを直接使う
// （src/app/demo/GoogleAnalytics.tsxが読み込む）。gtag未読み込み・分析ブロック時は
// 例外を投げず無視する（デモ・資料・予約導線は常に動く）。
// 会社名・メールアドレス等の自由入力は絶対に渡さないこと。
type DemoTrackEvent =
  | "demo_lp_view"
  | "demo_start_click"
  | "document_view_click"
  | "document_download_click"
  | "booking_open_click"
  | "signup_click";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(event: DemoTrackEvent, props: Record<string, string> = {}) {
  try {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", event, props);
  } catch {
    // 分析ブロック等で失敗しても導線に影響させない
  }
}

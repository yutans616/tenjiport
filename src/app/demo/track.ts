"use client";

// 計測ヘルパー（tenjiport_demo_lp_spec.md 8章）。GA4のgtag.js（src/app/demo/
// GoogleAnalytics.tsxが読み込む）に加えて、/api/demo/trackへも同じイベントを送り
// 自社DB（demo_analytics_events）に記録する。GA4未設定・分析ブロック時でも
// 管理画面（/admin）のKPI表示は自社DB分だけで機能する。
// いずれの送信先にも、会社名・メールアドレス等の自由入力は絶対に渡さないこと。
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
    if (typeof window.gtag === "function") {
      window.gtag("event", event, props);
    }
  } catch {
    // 分析ブロック等で失敗しても導線に影響させない
  }

  try {
    fetch("/api/demo/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, props }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 同上
  }
}

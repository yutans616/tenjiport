"use client";

// 最小限の計測ヘルパー（tenjiport_demo_lp_spec.md 8章）。
// 分析ツール未選定のP0時点では、GA4/GTM導入時にwindow.dataLayerへpushする一般的な
// 形にだけ揃えておき、未導入でも例外を投げない（デモ・資料・予約導線は常に動く）。
// 会社名・メールアドレス等の自由入力は絶対に渡さないこと。
type DemoTrackEvent =
  | "demo_lp_view"
  | "demo_start_click"
  | "document_view_click"
  | "document_download_click"
  | "booking_open_click"
  | "signup_click";

export function track(event: DemoTrackEvent, props: Record<string, string> = {}) {
  try {
    const w = window as unknown as { dataLayer?: unknown[] };
    if (!Array.isArray(w.dataLayer)) return;
    w.dataLayer.push({ event, ...props });
  } catch {
    // 分析ブロック等で失敗しても導線に影響させない
  }
}

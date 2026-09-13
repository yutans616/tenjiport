import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// /demo LPの計測イベントを自社DBにも記録する（tenjiport_demo_lp_spec.md 8章）。
// GA4（src/app/demo/GoogleAnalytics.tsx）と並行して呼ばれ、管理画面（/admin）の
// KPI表示に使う。event_type・propsのキーとも許可リスト方式で、自由入力
// （会社名・メールアドレス等）を受け付けない。
const ALLOWED_EVENTS = new Set([
  "demo_lp_view",
  "demo_start_click",
  "document_view_click",
  "document_download_click",
  "booking_open_click",
  "signup_click",
]);

const ALLOWED_PROP_KEYS = new Set(["cta_location", "mode", "campaign", "variant", "device_category"]);

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { event, props } = body as { event?: unknown; props?: unknown };
  if (typeof event !== "string" || !ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ error: "invalid event" }, { status: 400 });
  }

  const safeProps: Record<string, string> = {};
  if (props && typeof props === "object") {
    for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
      if (ALLOWED_PROP_KEYS.has(key) && typeof value === "string") {
        safeProps[key] = value.slice(0, 100);
      }
    }
  }

  const db = createServiceRoleClient();
  const { error } = await db.from("demo_analytics_events").insert({ event_type: event, props: safeProps });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

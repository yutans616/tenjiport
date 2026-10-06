"use client";

import { useEffect } from "react";
import { setInternalTrafficCookie } from "./internalTraffic";

// always: 運営者ページ用（開いたブラウザを常に計測対象外にする）。
// query: /demo用（?internal=1でセット、?internal=0で解除）。
export function InternalTrafficMarker({ mode }: { mode: "always" | "query" }) {
  useEffect(() => {
    if (mode === "always") {
      setInternalTrafficCookie(true);
      return;
    }
    const param = new URLSearchParams(window.location.search).get("internal");
    if (param === "1") setInternalTrafficCookie(true);
    if (param === "0") setInternalTrafficCookie(false);
  }, [mode]);

  return null;
}

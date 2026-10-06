import { INTERNAL_TRAFFIC_COOKIE } from "@/lib/demo/constants";

// URLの?internal=1/0をCookieより優先する（マーカーのuseEffectより先に計測が走っても
// 初回アクセスから正しく判定できるように）。
export function isInternalTraffic(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get("internal");
    if (param === "1") return true;
    if (param === "0") return false;
    return document.cookie.split("; ").includes(`${INTERNAL_TRAFFIC_COOKIE}=1`);
  } catch {
    return false;
  }
}

export function setInternalTrafficCookie(enabled: boolean) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = enabled
    ? `${INTERNAL_TRAFFIC_COOKIE}=1; path=/; max-age=31536000; samesite=lax${secure}`
    : `${INTERNAL_TRAFFIC_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
}

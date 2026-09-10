import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 では middleware.ts は非推奨となり proxy.ts へ改名された。
// ここではセッションCookieの更新に加えて、未ログインでの主催者側画面アクセスを
// /login へ誘導する簡易チェックのみ行う。実際の認可判定は各ページ/Server Action側の
// Data Access Layer（RLS + 明示チェック）で必ず再確認する（Proxyだけに依存しない）。
const PUBLIC_ORGANIZER_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtectedOrganizerPath =
    pathname === "/onboard" || pathname.startsWith("/events");

  if (isProtectedOrganizerPath && !PUBLIC_ORGANIZER_PATHS.includes(pathname)) {
    const hasSupabaseCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));

    if (!hasSupabaseCookie) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Server Componentのlayoutは現在のpathnameを直接受け取れないため、ヘッダー経由で渡す
  // （(organizer)/layout.tsx のカード登録必須ゲートが利用する）。
  response.headers.set("x-pathname", pathname);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)",
  ],
};

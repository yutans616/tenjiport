import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/admin/context";

// TenjiPort運営者専用の管理ページ。組織横断でデータを見るため、各ページはservice
// roleクライアントでデータ取得する（RLSは主催者側の閲覧範囲を守るためのものであり、
// 運営者はそれを越えて全組織を見る必要があるため）。認可自体はrequirePlatformAdminが担う。
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="flex h-14 shrink-0 items-center gap-6 border-b bg-background px-6">
        <span className="text-sm font-semibold tracking-tight">TenjiPort 運営者ページ</span>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground hover:underline">
            概要
          </Link>
          <Link href="/admin/organizations" className="hover:text-foreground hover:underline">
            組織一覧
          </Link>
          <Link href="/events" className="hover:text-foreground hover:underline">
            主催者画面に戻る
          </Link>
        </nav>
      </header>
      <div className="flex flex-1 flex-col p-6">{children}</div>
    </div>
  );
}

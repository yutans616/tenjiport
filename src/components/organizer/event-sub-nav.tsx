"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function EventSubNav({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const base = `/events/${eventId}`;

  const items = [
    { href: base, label: "概要" },
    { href: `${base}/form`, label: "フォーム設定" },
    { href: `${base}/exhibitors`, label: "出展者一覧" },
    { href: `${base}/announcements`, label: "資料" },
    { href: `${base}/invoices`, label: "請求書" },
    { href: `${base}/duplicates`, label: "重複レビュー" },
    { href: `${base}/exports`, label: "データ出力" },
  ];

  return (
    <nav className="flex gap-1 border-b">
      {items.map((item) => {
        const isActive = item.href === base ? pathname === base : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import { useTransition } from "react";
import { ChevronsUpDown } from "lucide-react";
import { switchOrganizationAction } from "@/app/(organizer)/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarGroupLabel } from "@/components/ui/sidebar";

type Organization = { id: string; name: string };

// 所属組織が1件のみ（大多数のユーザー）の場合は、既存の見た目のまま
// プレーンな組織名テキストを表示する（切替UIは表示しない）。
export function OrgSwitcher({
  organizations,
  currentOrganizationId,
}: {
  organizations: Organization[];
  currentOrganizationId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const current = organizations.find((o) => o.id === currentOrganizationId);

  if (organizations.length <= 1) {
    return <SidebarGroupLabel>{current?.name ?? ""}</SidebarGroupLabel>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        className="flex h-8 w-full shrink-0 items-center justify-between gap-1 rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-50"
      >
        <span className="truncate">{current?.name ?? ""}</span>
        <ChevronsUpDown className="size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            disabled={org.id === currentOrganizationId || isPending}
            onClick={() => {
              startTransition(() => {
                switchOrganizationAction(org.id);
              });
            }}
          >
            <span className="truncate">{org.name}</span>
            {org.id === currentOrganizationId && (
              <span className="ml-auto text-xs text-muted-foreground">現在</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

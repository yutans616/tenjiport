import Link from "next/link";
import Image from "next/image";
import { CalendarDays, CreditCard, HelpCircle, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { signOut } from "@/app/(organizer)/actions";

export function AppSidebar({
  organizationName,
  userEmail,
}: {
  organizationName: string;
  userEmail: string | null;
}) {
  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-4">
        <Link href="/events" className="flex items-center gap-2 px-1">
          <Image src="/tenjiport_icon.png" alt="" width={28} height={28} className="h-7 w-7" />
          <span className="text-sm font-semibold tracking-tight">TenjiPort</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{organizationName}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link href="/events">
                      <CalendarDays />
                      <span>イベント一覧</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link href="/plan">
                      <CreditCard />
                      <span>プラン・課金</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link href="/help">
                      <HelpCircle />
                      <span>使い方・ヘルプ</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2 px-3 pb-4">
        <p className="truncate px-1 text-xs text-muted-foreground">{userEmail}</p>
        <form action={signOut}>
          <SidebarMenuButton type="submit" className="text-muted-foreground">
            <LogOut />
            <span>ログアウト</span>
          </SidebarMenuButton>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}

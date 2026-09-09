import { getOrganizerContext } from "@/lib/organizer/context";
import { AppSidebar } from "@/components/organizer/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const context = await getOrganizerContext();

  if (!context) {
    return <div className="flex min-h-screen flex-col bg-muted/30">{children}</div>;
  }

  return (
    <SidebarProvider>
      <AppSidebar organizationName={context.organizationName} userEmail={context.email} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium text-muted-foreground">{context.organizationName}</span>
        </header>
        <div className="flex flex-1 flex-col bg-muted/20 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { isPlatformAdminEmail } from "@/lib/admin/context";
import { AppSidebar } from "@/components/organizer/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const context = await getOrganizerContext();

  if (!context) {
    return <div className="flex min-h-screen flex-col bg-muted/30">{children}</div>;
  }

  // 通常プランはカード登録が必須。未登録の間は/plan以外へのアクセスをブロックする
  // （年間プラン・契約なしの組織には影響しない）。運営者アカウント（billing_exempt）は対象外。
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizer_organizations")
    .select("billing_exempt")
    .eq("id", context.organizationId)
    .single();
  const { data: contract } = await supabase
    .from("service_contracts")
    .select("plan_type, payment_method_status")
    .eq("organizer_organization_id", context.organizationId)
    .eq("status", "active")
    .maybeSingle();

  const needsCardRegistration =
    !org?.billing_exempt && contract?.plan_type === "standard" && contract.payment_method_status !== "valid";
  if (needsCardRegistration) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (!pathname.startsWith("/plan")) {
      redirect("/plan");
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar
        organizationName={context.organizationName}
        userEmail={context.email}
        isPlatformAdmin={isPlatformAdminEmail(context.email)}
        isOwner={context.role === "owner"}
      />
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

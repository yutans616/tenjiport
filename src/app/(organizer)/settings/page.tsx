import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrganizerContext } from "@/lib/organizer/context";
import { updateBankAccountAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SuccessBanner } from "@/components/organizer/success-banner";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const { done } = await searchParams;
  const context = await getOrganizerContext();
  if (!context) redirect("/onboard");

  const canManage = context.role === "owner" || context.role === "admin";
  if (!canManage) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
        <h1 className="text-xl font-semibold tracking-tight">設定</h1>
        <p className="text-sm text-muted-foreground">この設定を閲覧・変更できるのはオーナーまたは管理者のみです。</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: bankAccount } = await supabase
    .from("organizer_bank_accounts")
    .select(
      "bank_name, branch_name, account_type, account_number, account_holder_name, qualified_invoice_registration_number, postal_code, address",
    )
    .eq("organization_id", context.organizationId)
    .maybeSingle();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
      <SuccessBanner done={done} />
      <div>
        <h1 className="text-xl font-semibold tracking-tight">設定</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ここで登録した銀行口座は、出展者向けの請求書ページに振込先として表示されます。
        </p>
      </div>

      <form action={updateBankAccountAction} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">発行元情報（請求書PDFに記載）</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="postal_code">郵便番号</Label>
              <Input id="postal_code" name="postal_code" defaultValue={bankAccount?.postal_code ?? ""} placeholder="例：123-4567" className="max-w-40" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="address">住所</Label>
              <Input id="address" name="address" defaultValue={bankAccount?.address ?? ""} placeholder="例：東京都〇〇区〇〇1-2-3" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="qualified_invoice_registration_number">適格請求書発行事業者登録番号（任意）</Label>
              <Input
                id="qualified_invoice_registration_number"
                name="qualified_invoice_registration_number"
                defaultValue={bankAccount?.qualified_invoice_registration_number ?? ""}
                placeholder="例：T1234567890123"
              />
              <p className="text-xs text-muted-foreground">
                自動発行される請求書PDFに記載されます。未設定の場合は登録番号欄なしで発行されます。
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">銀行口座</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="bank_name">銀行名</Label>
              <Input id="bank_name" name="bank_name" defaultValue={bankAccount?.bank_name ?? ""} placeholder="例：〇〇銀行" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="branch_name">支店名</Label>
              <Input id="branch_name" name="branch_name" defaultValue={bankAccount?.branch_name ?? ""} placeholder="例：〇〇支店" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="account_type">口座種別</Label>
              <NativeSelect id="account_type" name="account_type" defaultValue={bankAccount?.account_type ?? "普通"}>
                <option value="普通">普通</option>
                <option value="当座">当座</option>
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="account_number">口座番号</Label>
              <Input id="account_number" name="account_number" defaultValue={bankAccount?.account_number ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="account_holder_name">口座名義（カナ）</Label>
              <Input
                id="account_holder_name"
                name="account_holder_name"
                defaultValue={bankAccount?.account_holder_name ?? ""}
                placeholder="例：カ）ブラックイッシュギア"
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="self-start">
          保存する
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">この情報を閲覧・変更できるのはオーナーと管理者のみです。</p>
    </div>
  );
}

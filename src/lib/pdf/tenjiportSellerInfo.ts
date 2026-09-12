// TenjiPort運営会社（売り手）の情報。/legal/tokushohoの記載と一致させること。
// service_invoices（TenjiPort→主催者の利用料請求）は常にこの1社が売り手となるため、
// exhibitor_invoicesのような組織ごとの登録番号テーブルは持たず、定数として保持する。
export const TENJIPORT_SELLER_INFO = {
  companyName: "株式会社BlackishGear",
  postalCode: "350-0806",
  address: "埼玉県川越市天沼新田221-10-B105",
  phoneNumber: "070-9297-0866",
  // 適格請求書発行事業者登録番号（T+13桁）。未登録の間はnullのままとし、PDF上では該当行を省略する。
  registrationNumber: "T9030001149734" as string | null,
};

// 年間プラン「請求書払い」の振込先。管理者組織（BlackishGear）が自社のexhibitor_invoice用に
// 登録済みの口座（organizer_bank_accounts）と同一の実口座のため、値をそのまま転記した定数として保持する
// （TENJIPORT_SELLER_INFOと同じ理由：TenjiPortの利用料請求は常にこの1社・1口座のみが対象のため）。
export const TENJIPORT_BANK_DETAILS = {
  bankName: "三井住友銀行",
  branchName: "川越支店",
  accountType: "普通",
  accountNumber: "7812762",
  accountHolderName: "カ）ブラキッシュギア",
};

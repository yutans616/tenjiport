// 営業LP（/demo）の設定値。tenjiport_demo_lp_spec.md 7章参照。
// 未確定の項目はnull/falseにしておき、揃い次第ここだけ差し替える。
export const demoConfig = {
  demoAppPath: "/demo/app",
  demoExhibitorPath: "/demo/exhibitor",

  // 主催者マジックリンク不具合（docs/handoff.md）が残る間はセルフサービス訴求をしない。
  signupEnabled: false,
  signupUrl: "/login",

  // 営業PDF・操作動画は未準備（tenjiport_demo_lp_spec.md 11章）。
  documentViewUrl: null as string | null,
  documentDownloadUrl: null as string | null,

  // TimeRex等の契約が未確定のため、予約はメール相談のフォールバックのみ（5.1節P0）。
  bookingProvider: "TimeRex" as const,
  bookingUrl: null as string | null,
  bookingEmbedEnabled: false,

  contactEmail: "info@blackishgear.com",

  // 価格は確定・本番投入済み（docs/open-decisions.md）。
  pricingApproved: true,
  annualPriceApproved: true,
  standardFeeYen: 9800,
  standardIncludedCompanies: 30,
  overageFeeYenPerCompany: 300,
  annualPriceYen: 298000,
  annualEventCap: 6,
  annualParticipantCapPerEvent: 300,
  taxLabel: "税込",

  videoUrl: null as string | null,
  videoPoster: null as string | null,

  analyticsEnabled: false,
} as const;

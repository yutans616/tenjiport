// 営業LP（/demo）の設定値。tenjiport_demo_lp_spec.md 7章参照。
// 未確定の項目はnull/falseにしておき、揃い次第ここだけ差し替える。
export const demoConfig = {
  demoAppPath: "/demo/app",
  demoExhibitorPath: "/demo/exhibitor",

  // 主催者マジックリンク不具合（docs/handoff.md）が残る間はセルフサービス訴求をしない。
  signupEnabled: false,
  signupUrl: "/login",

  // 営業PDF（scripts/build-service-guide-pdf.mjs、全11ページ）。
  documentViewUrl: "/demo/tenjiport-service-guide.pdf" as string | null,
  documentDownloadUrl: "/demo/tenjiport-service-guide.pdf" as string | null,

  // TimeRex公式埋め込みウィジェット（5.1節P1）。契約者の予約ページURL。
  bookingProvider: "TimeRex" as const,
  bookingUrl: "https://timerex.net/s/yutans616_d8ea/d14a6b7e" as string | null,
  bookingEmbedEnabled: true,

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

  // Playwrightで実UI・実データを操作して録画（scripts/record-demo-video.mjs）。
  // ffmpeg未導入のためwebm出力。字幕は同スクリプトが実タイムスタンプから生成したvtt。
  videoUrl: "/demo/demo-walkthrough.webm",
  videoCaptionsUrl: "/demo/demo-walkthrough.ja.vtt",
  videoPoster: "/demo/demo-walkthrough-poster.png",

  // GA4のMeasurement ID（G-から始まる値）。未設定の間はgtag.jsを読み込まず、
  // track()は静かに何もしない。値はNEXT_PUBLIC_*のため秘匿情報ではない。
  gaMeasurementId: (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || null) as string | null,
  get analyticsEnabled(): boolean {
    return Boolean(this.gaMeasurementId);
  },
};

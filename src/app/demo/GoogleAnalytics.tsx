import Script from "next/script";

// GA4（gtag.js）を/demo配下（公開LP）にのみ読み込む。実アプリの主催者・出展者画面には
// 組み込まない（tenjiport_demo_lp_spec.md 8章は公開LPの計測仕様であり、実顧客の
// プロダクト利用ログを外部分析基盤に送る話ではないため）。
export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}', { allow_google_signals: false });
          window.gtag = gtag;
        `}
      </Script>
    </>
  );
}

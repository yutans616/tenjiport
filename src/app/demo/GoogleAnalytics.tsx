import Script from "next/script";
import { INTERNAL_TRAFFIC_COOKIE } from "@/lib/demo/constants";

// GA4（gtag.js）を/demo配下（公開LP）にのみ読み込む。実アプリの主催者・出展者画面には
// 組み込まない（tenjiport_demo_lp_spec.md 8章は公開LPの計測仕様であり、実顧客の
// プロダクト利用ログを外部分析基盤に送る話ではないため）。
export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          (function () {
            var q = new URLSearchParams(location.search).get('internal');
            var internal = q === '1' || (q !== '0' && document.cookie.split('; ').indexOf('${INTERNAL_TRAFFIC_COOKIE}=1') !== -1);
            if (internal) window['ga-disable-${measurementId}'] = true;
          })();
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

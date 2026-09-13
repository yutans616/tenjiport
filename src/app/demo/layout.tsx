import { demoConfig } from "./config";
import { GoogleAnalytics } from "./GoogleAnalytics";

// このレイアウトはpage.tsx（/demo本体）のみに適用される。/demo/app・/demo/exhibitorは
// Route Handler（route.ts）でHTMLを描画しないため、GA4はここには読み込まれない。
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {demoConfig.gaMeasurementId ? <GoogleAnalytics measurementId={demoConfig.gaMeasurementId} /> : null}
      {children}
    </>
  );
}

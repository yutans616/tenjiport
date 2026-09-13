"use client";

import { useState } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { track } from "./track";

declare global {
  interface Window {
    TimerexCalendar?: () => void;
  }
}

// TimeRex公式の埋め込みウィジェット（tenjiport_demo_lp_spec.md 5.1節 P1）。
// 「空き日時を確認する」を押すまで外部スクリプトを読み込まない（初期表示を重くしない）。
// 読み込みに失敗しても、常に予約URLへの別タブリンクを残す。
export function TimeRexBooking({ bookingUrl }: { bookingUrl: string }) {
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex w-full flex-col items-start gap-2 sm:items-end">
      {!loading ? (
        <Button
          className="bg-[#0068C8] text-white hover:bg-[#0068C8]/90"
          onClick={() => {
            track("booking_open_click", { mode: "embed" });
            setLoading(true);
          }}
        >
          空き日時を確認する
        </Button>
      ) : (
        <div className="w-full max-w-md">
          {!loaded && !failed && <p className="mb-2 text-sm text-[#102C50]/60">読み込んでいます…</p>}
          {failed && (
            <p className="mb-2 text-sm text-destructive">
              予約カレンダーの読み込みに失敗しました。下記リンクから別タブでお試しください。
            </p>
          )}
          <div id="timerex_calendar" data-url={bookingUrl} />
          <Script
            src="https://asset.timerex.net/js/embed.js"
            strategy="afterInteractive"
            onLoad={() => {
              window.TimerexCalendar?.();
              setLoaded(true);
            }}
            onError={() => setFailed(true)}
          />
        </div>
      )}
      <a
        href={bookingUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track("booking_open_click", { mode: "new_tab" })}
        className="text-xs text-[#0068C8] underline-offset-4 hover:underline"
      >
        予約画面を別のタブで開く
      </a>
    </div>
  );
}

"use client";

import { OrganizerErrorFallback } from "@/components/organizer/error-fallback";

// このイベント配下（出展者一覧・請求書・お知らせ等）で起きたエラーをここで受け止める。
// 親のイベント用レイアウト（タイトル・サブナビ）は残ったまま、中身だけがこのUIに差し替わる。
export default function EventError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <OrganizerErrorFallback error={error} retry={retry} backHref="/events" backLabel="イベント一覧に戻る" />;
}

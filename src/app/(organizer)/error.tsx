"use client";

import { OrganizerErrorFallback } from "@/components/organizer/error-fallback";

export default function OrganizerError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <OrganizerErrorFallback error={error} retry={retry} backHref="/events" backLabel="イベント一覧に戻る" />;
}

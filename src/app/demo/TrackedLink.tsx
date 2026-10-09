"use client";

import Link from "next/link";
import { track } from "./track";

export function TrackedLink({
  href,
  event,
  eventProps,
  external,
  className,
  children,
}: {
  href: string;
  event: Parameters<typeof track>[0];
  eventProps?: Record<string, string>;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const handleClick = () => track(event, eventProps);

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={handleClick}>
        {children}
      </a>
    );
  }

  // 先読みしない。/demo/app はアクセスされるとデモ組織を発行するため、表示されただけで
  // 先読みされると、LPの閲覧のたびにデモ組織が作られてしまう。
  return (
    <Link href={href} prefetch={false} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}

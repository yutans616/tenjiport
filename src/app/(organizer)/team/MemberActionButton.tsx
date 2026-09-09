"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { TeamActionResult } from "./actions";

export function MemberActionButton({
  action,
  label,
  variant = "outline",
  destructive,
}: {
  action: () => Promise<TeamActionResult>;
  label: string;
  variant?: "outline" | "ghost";
  destructive?: boolean;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsLoading(true);
    setError(null);
    const result = await action();
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={variant}
        size="sm"
        disabled={isLoading}
        onClick={handleClick}
        className={destructive ? "text-muted-foreground hover:text-destructive" : undefined}
      >
        {label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

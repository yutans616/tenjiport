"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// フォームのSubmit中は多重クリックを防ぐため無効化し、ラベルを差し替える。
// useFormStatusは親<form>の状態を読むため、<form>の内側（子コンポーネント）でのみ使用できる。
export function SubmitButton({
  children,
  pendingText,
  disabled,
  variant,
  size,
  className,
  title,
}: {
  children: React.ReactNode;
  pendingText: string;
  disabled?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || disabled} variant={variant} size={size} className={className} title={title}>
      {pending ? pendingText : children}
    </Button>
  );
}

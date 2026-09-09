"use client";

import { ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
        {label}
        {selected.size > 0 ? `（${selected.size}）` : ""}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}で絞り込み</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map((opt) => (
            <DropdownMenuCheckboxItem key={opt.value} checked={selected.has(opt.value)} onCheckedChange={() => toggle(opt.value)}>
              {opt.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {selected.size > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange(new Set())}>すべて解除</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

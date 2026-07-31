"use client";

import type { InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * A consistent shell around the native date control. The native picker remains
 * available, while iOS no longer centres the value or stretches it beyond the
 * surrounding form layout.
 */
export function DateInput({ className, ...props }: DateInputProps) {
  return <span className="relative block min-w-0 w-full">
    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#687169]" aria-hidden="true" />
    <input
      {...props}
      type="date"
      className={cn(
        "kretivos-date-input h-11 min-w-0 w-full rounded-xl border bg-white py-0 pl-10 pr-3 text-left text-sm tabular-nums outline-none focus:border-[#ba5c42] focus:ring-4 focus:ring-[#ba5c42]/10",
        className,
      )}
    />
  </span>;
}

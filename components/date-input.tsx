"use client";

import type { InputHTMLAttributes } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** The shell every native date-and-time control shares. */
const CONTROL = "kretivos-date-input h-11 min-w-0 w-full rounded-xl border bg-card py-0 pl-10 pr-3 text-left text-sm tabular-nums outline-none focus:border-accent focus:ring-4 focus:ring-accent/10";

/**
 * A consistent shell around the native date control. The native picker remains
 * available, while iOS no longer centres the value or stretches it beyond the
 * surrounding form layout.
 */
export function DateInput({ className, ...props }: DateInputProps) {
  return <span className="relative block min-w-0 w-full">
    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    <input
      {...props}
      type="date"
      className={cn(
        CONTROL,
        className,
      )}
    />
  </span>;
}

/** The same mobile-safe control for month-only payroll and report periods. */
export function MonthInput({ className, ...props }: DateInputProps) {
  return <span className="relative block min-w-0 w-full">
    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    <input
      {...props}
      type="month"
      className={cn(
        CONTROL,
        className,
      )}
    />
  </span>;
}

/**
 * The same mobile-safe control for a time.
 *
 * `type="time"` was the one native control still using the plain input, and on
 * iOS that is the one where it shows: Safari gives a time field an intrinsic
 * width wide enough for "10:00 AM" plus its own affordance, and refuses to
 * shrink below it whatever `width: 100%` says. In the two-column From/To row
 * that pushed the second field off the right of the screen. The shared class
 * turns off the native appearance, which is what lets it shrink, and
 * `min-w-0` lets the grid track do the same.
 */
export function TimeInput({ className, ...props }: DateInputProps) {
  return <span className="relative block min-w-0 w-full">
    <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    <input {...props} type="time" className={cn(CONTROL, className)} />
  </span>;
}

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * The status pill, written thirty-four times by hand across the workspaces.
 *
 * Variants are named for what they mean rather than for a colour, so a status
 * map reads `tone="bad"` and the palette can change in one place. `neutral` is
 * the default because most statuses are not an alarm.
 */
export const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-[#eeeae0] text-[#5a605a]",
        good: "bg-emerald-50 text-emerald-700",
        bad: "bg-red-50 text-red-700",
        warn: "bg-amber-50 text-amber-700",
        info: "bg-sky-50 text-sky-700",
        accent: "bg-[#f6e6df] text-[#8c4530]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/**
 * Picks a tone from a status word.
 *
 * Four workspaces each grew their own version of this, and they disagreed:
 * one treated "Open" as amber and another as neutral, one had no red at all.
 * Centralising it means a status reads the same colour wherever it appears,
 * which is the entire point of a status colour.
 */
export function statusTone(value: string): NonNullable<BadgeProps["tone"]> {
  const text = String(value ?? "").toLowerCase();
  if (/(approved|paid|completed|active|won|posted|cleared|confirmed|success|balanced|primary|ready)/.test(text)) return "good";
  if (/(reject|expired|overdue|failed|void|cancel|error|unbalanced|lost)/.test(text)) return "bad";
  if (/(pending|draft|open|review|partial|awaiting|hold|sent|lead|proposal|negotiation|in progress|verified)/.test(text)) return "warn";
  // "Archived" read red in one workspace and neutral in another. Neutral wins:
  // archiving is a normal end state, not a failure.
  return "neutral";
}

/** A badge whose colour is derived from the status it displays. */
export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return <Badge tone={statusTone(value)} className={className}>{value}</Badge>;
}

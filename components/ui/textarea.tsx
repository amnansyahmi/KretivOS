import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-24 w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm leading-6 text-foreground transition-colors",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";

/**
 * Several Field wrappers offer the AI writing-assist button only on long-form
 * inputs, which they decided by comparing the child's type to the string
 * "textarea". That check silently stopped matching the moment the raw tag was
 * replaced by this component — the button vanished with nothing to catch it.
 * Asking here means both spellings answer the same question, and a future
 * wrapper cannot get it half right.
 */
export function isTextField(type: unknown): boolean {
  return type === "textarea" || type === Textarea;
}

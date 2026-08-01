"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

/**
 * Replaces the `title` attribute, which never appears on a touch device — and
 * KretivOS is used on a phone more than on a desktop, so more than fifty icon
 * controls carried a label nobody on mobile could ever read.
 *
 * A tooltip is still hover-and-focus only, so it is a *hint*, never the only
 * label: an icon-only control needs an aria-label as well. This gives sighted
 * mouse and keyboard users the word; the aria-label serves everyone else.
 */
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[260] overflow-hidden rounded-md bg-[#202c25] px-2.5 py-1.5 text-[11px] text-white shadow-md",
        "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
        "data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * The common case in one element, because the four-part form is enough
 * ceremony that people reach for `title` instead.
 *
 * `asChild` on the trigger keeps the child's own element, so wrapping a Button
 * does not nest a button inside a button.
 */
export function Hint({
  label, children, side = "top",
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side={side}>{label}</TooltipContent>
  </Tooltip>;
}

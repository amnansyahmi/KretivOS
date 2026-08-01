"use client";

import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { cn } from "@/lib/utils";

/**
 * Radix owns the open state, the aria-expanded/aria-controls pair and the
 * height variables the animation needs. The hand-rolled version in the Sales
 * sidebar had the state and the chevron but neither aria attribute, so a screen
 * reader could not tell the group was collapsed.
 */
export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

export const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.Content
    ref={ref}
    className={cn(
      "overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
      className,
    )}
    {...props}
  />
));
CollapsibleContent.displayName = CollapsiblePrimitive.Content.displayName;

"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * `text-xs` rather than shadcn's `text-sm` because that is already this
 * codebase's label size, and `leading-none` is left off deliberately: the Field
 * wrappers nest the control inside the label to keep the implicit association,
 * so a zero line-height here would squash the field, not just the caption.
 */
const labelVariants = cva(
  "text-xs font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
));

Label.displayName = LabelPrimitive.Root.displayName;

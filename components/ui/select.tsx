import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A styled *native* select, deliberately not Radix Select.
 *
 * KretivOS is installed to the home screen and used on a phone far more often
 * than on a desktop. iOS and Android render a native <select> as a full-height
 * wheel or sheet that is thumb-reachable and scroll-safe; a Radix listbox is a
 * small floating popover that fights the on-screen keyboard and the address bar.
 * Optgroups also come for free. This departs from canonical shadcn/ui, which
 * ships a Radix implementation, and the trade is accepted knowingly: we give up
 * fully custom option rendering to keep the mobile experience native.
 *
 * Use `<option>` and `<optgroup>` children exactly as with a bare select.
 */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative w-full">
      <select
        ref={ref}
        className={cn(
          "flex h-10 w-full appearance-none rounded-lg border border-input bg-card py-2 pl-3 pr-9 text-sm text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  ),
);

Select.displayName = "Select";

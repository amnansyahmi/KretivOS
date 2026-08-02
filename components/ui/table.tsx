import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The report table, currently written by hand in six files.
 *
 * The wrapper is the part worth centralising: every one of those tables is
 * wider than a phone, and each had to remember its own `overflow-x-auto`
 * container. Forgetting it makes the whole page scroll sideways instead of the
 * table, which is the single most common mobile layout bug in the app.
 */
export function Table({ className, containerClassName, ...props }: React.HTMLAttributes<HTMLTableElement> & { containerClassName?: string }) {
  return <div className={cn("w-full overflow-x-auto rounded-lg border", containerClassName)}>
    <table className={cn("w-full caption-bottom text-xs", className)} {...props} />
  </div>;
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-card text-left text-[10px] uppercase tracking-wider text-muted-foreground", className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn(className)} {...props} />;
}

export function TableFooter({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={cn("border-t bg-card font-semibold", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-t", className)} {...props} />;
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-3 py-2 font-medium", className)} {...props} />;
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2", className)} {...props} />;
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return <tr><td colSpan={colSpan} className="px-3 py-6 text-center text-muted-foreground">{children}</td></tr>;
}

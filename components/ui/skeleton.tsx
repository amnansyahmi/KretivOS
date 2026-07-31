import { cn } from "@/lib/utils";

/**
 * Placeholder block for content still loading. Sized by the caller so the
 * skeleton occupies the same space as the real content and the layout does not
 * jump when data arrives.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-[#e7e2d8]", className)} />;
}

/** Matches the dashboard's Stat card so the metric row reserves its height. */
export function StatSkeleton() {
  return <div className="rounded-[var(--radius)] border bg-white/75 p-5">
    <Skeleton className="h-3 w-24" />
    <Skeleton className="mt-4 h-7 w-32" />
    <Skeleton className="mt-3 h-3 w-40" />
  </div>;
}

/** Generic stack of lines for list and queue panels. */
export function RowSkeleton({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3">
    {Array.from({ length: rows }, (_, index) => <div key={index} className="rounded-lg border bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-4 w-3/4" />
    </div>)}
  </div>;
}

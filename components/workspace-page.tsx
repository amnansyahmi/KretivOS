import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { openCommandPalette } from "@/components/command-palette";

export function WorkspacePage({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background px-4 pb-28 pt-6 text-foreground md:px-8 md:pb-24 md:pt-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Link href="/" className="inline-flex min-h-9 items-center gap-2 rounded-lg border bg-white/75 px-3 text-xs font-medium text-foreground-soft hover:bg-card hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to KretivOS
              </Link>
              <button type="button" onClick={openCommandPalette} className="inline-flex min-h-9 items-center gap-2 rounded-lg border bg-white/75 px-3 text-xs font-medium text-foreground-soft hover:bg-card hover:text-foreground">
                <Search className="h-3.5 w-3.5" /> Search workspace <kbd className="hidden rounded border bg-card px-1.5 py-0.5 text-[9px] font-normal md:inline">⌘K</kbd>
              </button>
            </div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-accent">{eyebrow}</div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-[40px]">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          {actions}
        </div>
        {children}
      </div>
    </main>
  );
}

"use client";

/**
 * Left-hand navigation for the Accounting workspace.
 *
 * Follows components/hrms-shell.tsx rather than inventing a second pattern: the
 * same grid, the same grouped sidebar with a description under each label, the
 * same mobile drawer built on Radix Dialog.
 *
 * The tab strip it replaces had grown to ten items, which scrolled horizontally
 * on a laptop and hid whichever section you were not already looking at. A
 * ledger has more sections than a tab row can carry, and grouping them says
 * something a flat strip cannot — that Bills, Vendors and Payments are one job.
 */

import Link from "next/link";
import { Fragment, type ReactNode, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, ArrowLeftRight, BookOpen, CircleDollarSign, HandCoins,
  LineChart, ListTree, Menu, TrendingUp, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, VisuallyHidden,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type AccountingTab =
  | "overview" | "capture" | "transactions" | "bills" | "vendors"
  | "payments" | "settlements" | "reports" | "journal" | "forecast" | "accounts";

type NavigationGroup = "Workspace" | "Cash & bank" | "Receivables" | "Reports" | "Planning" | "Setup";

export type AccountingNavItem = {
  id: AccountingTab;
  label: string;
  description: string;
  group: NavigationGroup;
  icon: LucideIcon;
};

export const ACCOUNTING_NAV_ITEMS: AccountingNavItem[] = [
  { id: "overview", label: "Accounting overview", description: "Ledger health and financial position", group: "Workspace", icon: CircleDollarSign },
  { id: "transactions", label: "Cash & bank", description: "Money movements without an invoice", group: "Cash & bank", icon: ArrowLeftRight },
  { id: "settlements", label: "Settlements", description: "Weekly per-unit client fees", group: "Receivables", icon: HandCoins },
  { id: "reports", label: "Reports", description: "Profit, balance sheet and review", group: "Reports", icon: TrendingUp },
  { id: "journal", label: "Journal", description: "Every posting, for the accountant", group: "Reports", icon: BookOpen },
  { id: "forecast", label: "Budget & forecast", description: "The plan, against what happened", group: "Planning", icon: LineChart },
  { id: "accounts", label: "Chart of accounts", description: "Accounts and period close", group: "Setup", icon: ListTree },
];

export type AccountingBadges = Partial<Record<AccountingTab, number>>;

function SidebarContent({
  activeId,
  badges,
  onNavigate,
  onClose,
}: {
  activeId: AccountingTab;
  badges?: AccountingBadges;
  onNavigate: (id: AccountingTab) => void;
  onClose?: () => void;
}) {
  return <div className="flex h-full min-h-0 flex-col bg-foreground text-white">
    <div className="flex h-[88px] shrink-0 items-center gap-3 border-b border-white/10 px-5">
      <div className="flex h-10 w-10 items-center justify-center border border-white/15 bg-white/10 text-accent-muted"><CircleDollarSign className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[.2em] text-accent-muted">Kretivco</div>
        <div className="mt-0.5 text-lg font-semibold tracking-tight">Accounting</div>
      </div>
      {onClose && <button onClick={onClose} className="flex h-10 w-10 items-center justify-center text-white/65 hover:bg-white/10 hover:text-white" aria-label="Close accounting menu"><X className="h-5 w-5" /></button>}
    </div>

    <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Accounting navigation">
      {ACCOUNTING_NAV_ITEMS.map((item, index) => {
        const Icon = item.icon;
        const showGroup = index === 0 || ACCOUNTING_NAV_ITEMS[index - 1].group !== item.group;
        const active = activeId === item.id;
        const badge = badges?.[item.id];
        return <Fragment key={item.id}>
          {showGroup && <div className={cn("px-3 pb-2 text-[9px] font-semibold uppercase tracking-[.18em] text-white/35", index > 0 && "pt-5")}>{item.group}</div>}
          <button
            type="button"
            onClick={() => { onClose?.(); onNavigate(item.id); }}
            className={cn(
              "group relative flex min-h-[48px] w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left transition",
              active ? "border-accent-soft bg-white/10 text-white" : "border-transparent text-white/62 hover:bg-white/[.06] hover:text-white",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active ? "text-accent-muted" : "text-white/45 group-hover:text-white/75")} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">{item.label}</span>
              <span className={cn("mt-0.5 block truncate text-[10px]", active ? "text-white/55" : "text-white/32")}>{item.description}</span>
            </span>
            {/* Work waiting in a section the operator is not looking at. */}
            {badge ? <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center bg-accent-soft px-1.5 text-[10px] font-semibold text-foreground">{badge > 99 ? "99+" : badge}</span> : null}
          </button>
        </Fragment>;
      })}
    </nav>

    <div className="shrink-0 border-t border-white/10 p-3">
      <Link href="/" onClick={onClose} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 px-3 text-xs font-medium text-white/65 transition hover:border-white/20 hover:bg-white/[.06] hover:text-white">
        <ArrowLeft className="h-4 w-4" />Back to KretivOS
      </Link>
    </div>
  </div>;
}

export function AccountingShell({
  activeId,
  title,
  description,
  badges,
  onNavigate,
  actions,
  children,
}: {
  activeId: AccountingTab;
  title: string;
  description: string;
  badges?: AccountingBadges;
  onNavigate: (id: AccountingTab) => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  // Radix owns the scroll lock, the Escape handler and the focus trap.
  const [mobileOpen, setMobileOpen] = useState(false);

  return <main className="min-h-screen bg-background text-foreground">
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh self-start border-r border-black/10 lg:block">
        <SidebarContent activeId={activeId} badges={badges} onNavigate={onNavigate} />
      </aside>

      <div className="min-w-0 pb-24">
        <header className="sticky top-0 z-40 border-b border-black/5 bg-background/95 backdrop-blur-xl">
          <div className="mx-auto flex min-h-[72px] max-w-[1600px] items-center gap-3 px-4 md:min-h-24 md:px-8 md:py-5">
            <Button variant="outline" size="icon" className="shrink-0 bg-card lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open accounting navigation"><Menu className="h-5 w-5" /></Button>
            <div className="min-w-0 flex-1">
              <div className="hidden text-[10px] font-semibold uppercase tracking-[.2em] text-accent sm:block">Kretivco accounting</div>
              <h1 className="truncate text-lg font-semibold tracking-tight sm:mt-1 md:text-3xl">{title}</h1>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:mt-1 sm:text-sm">{description}</p>
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        </header>

        <div className="mx-auto max-w-[1600px] px-4 py-5 md:px-8 md:py-7">{children}</div>
      </div>
    </div>

    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[210] bg-black/55 lg:hidden"
        className="left-0 top-0 z-[220] h-full max-h-full w-[min(326px,88vw)] max-w-none translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0 lg:hidden"
      >
        <VisuallyHidden>
          <DialogTitle>Accounting navigation</DialogTitle>
          <DialogDescription>Move between the sections of the Accounting workspace.</DialogDescription>
        </VisuallyHidden>
        <SidebarContent activeId={activeId} badges={badges} onNavigate={onNavigate} onClose={() => setMobileOpen(false)} />
      </DialogContent>
    </Dialog>
  </main>;
}

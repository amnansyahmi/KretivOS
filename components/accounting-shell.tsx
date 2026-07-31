"use client";

/**
 * Left-hand navigation for the Accounting workspace.
 *
 * Follows components/hrms-shell.tsx rather than inventing a second pattern: the
 * same grid, the same grouped sidebar with a description under each label, the
 * same mobile drawer with a scroll lock and an Escape handler.
 *
 * The tab strip it replaces had grown to ten items, which scrolled horizontally
 * on a laptop and hid whichever section you were not already looking at. A
 * ledger has more sections than a tab row can carry, and grouping them says
 * something a flat strip cannot — that Bills, Vendors and Payments are one job.
 */

import Link from "next/link";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, ArrowLeftRight, BookOpen, Building2, Camera, CircleDollarSign,
  HandCoins, Landmark, ListTree, Menu, Receipt, TrendingUp, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AccountingTab =
  | "overview" | "capture" | "transactions" | "bills" | "vendors"
  | "payments" | "settlements" | "reports" | "journal" | "accounts";

type NavigationGroup = "Workspace" | "Daily" | "Payables" | "Receivables" | "Reports" | "Setup";

export type AccountingNavItem = {
  id: AccountingTab;
  label: string;
  description: string;
  group: NavigationGroup;
  icon: LucideIcon;
};

export const ACCOUNTING_NAV_ITEMS: AccountingNavItem[] = [
  { id: "overview", label: "Overview", description: "What needs paying and chasing", group: "Workspace", icon: CircleDollarSign },
  { id: "capture", label: "Capture", description: "Photograph a receipt or invoice", group: "Daily", icon: Camera },
  { id: "transactions", label: "Money in / out", description: "Cash that moves without a document", group: "Daily", icon: ArrowLeftRight },
  { id: "bills", label: "Bills", description: "What suppliers have invoiced us", group: "Payables", icon: Receipt },
  { id: "vendors", label: "Vendors", description: "Suppliers and their payment terms", group: "Payables", icon: Building2 },
  { id: "payments", label: "Payments", description: "Money paid and received", group: "Payables", icon: Landmark },
  { id: "settlements", label: "Settlements", description: "Weekly per-unit client fees", group: "Receivables", icon: HandCoins },
  { id: "reports", label: "Reports", description: "Profit, balance sheet and review", group: "Reports", icon: TrendingUp },
  { id: "journal", label: "Journal", description: "Every posting, for the accountant", group: "Reports", icon: BookOpen },
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
  return <div className="flex h-full min-h-0 flex-col bg-[#1c2b23] text-white">
    <div className="flex h-[88px] shrink-0 items-center gap-3 border-b border-white/10 px-5">
      <div className="flex h-10 w-10 items-center justify-center border border-white/15 bg-white/10 text-[#f19a7f]"><CircleDollarSign className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#f19a7f]">Kretivco</div>
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
              active ? "border-[#ef8a6b] bg-white/10 text-white" : "border-transparent text-white/62 hover:bg-white/[.06] hover:text-white",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[#f19a7f]" : "text-white/45 group-hover:text-white/75")} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">{item.label}</span>
              <span className={cn("mt-0.5 block truncate text-[10px]", active ? "text-white/55" : "text-white/32")}>{item.description}</span>
            </span>
            {/* Work waiting in a section the operator is not looking at. */}
            {badge ? <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center bg-[#ef8a6b] px-1.5 text-[10px] font-semibold text-[#1c2b23]">{badge > 99 ? "99+" : badge}</span> : null}
          </button>
        </Fragment>;
      })}
    </nav>

    <div className="shrink-0 border-t border-white/10 p-3">
      <Link href="/" onClick={onClose} className="flex min-h-11 items-center gap-3 border border-white/10 px-3 text-xs font-medium text-white/65 transition hover:border-white/20 hover:bg-white/[.06] hover:text-white">
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
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  return <main className="min-h-screen bg-[#f5f2ea] text-[#202820]">
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh self-start border-r border-black/10 lg:block">
        <SidebarContent activeId={activeId} badges={badges} onNavigate={onNavigate} />
      </aside>

      <div className="min-w-0 pb-24">
        <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f5f2ea]/95 backdrop-blur-xl">
          <div className="mx-auto flex min-h-[72px] max-w-[1600px] items-center gap-3 px-4 md:min-h-24 md:px-8 md:py-5">
            <Button variant="outline" size="icon" className="shrink-0 bg-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open accounting navigation"><Menu className="h-5 w-5" /></Button>
            <div className="min-w-0 flex-1">
              <div className="hidden text-[10px] font-semibold uppercase tracking-[.2em] text-[#ba5c42] sm:block">Kretivco accounting</div>
              <h1 className="truncate text-lg font-semibold tracking-tight sm:mt-1 md:text-3xl">{title}</h1>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:mt-1 sm:text-sm">{description}</p>
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        </header>

        <div className="mx-auto max-w-[1600px] px-4 py-5 md:px-8 md:py-7">{children}</div>
      </div>
    </div>

    {mobileOpen && <div className="fixed inset-0 z-[210] lg:hidden" role="dialog" aria-modal="true" aria-label="Accounting navigation menu">
      <button className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} aria-label="Close accounting navigation" />
      <aside className="absolute inset-y-0 left-0 w-[min(326px,88vw)] shadow-2xl">
        <SidebarContent activeId={activeId} badges={badges} onNavigate={onNavigate} onClose={() => setMobileOpen(false)} />
      </aside>
    </div>}
  </main>;
}

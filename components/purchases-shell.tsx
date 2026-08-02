"use client";

import Link from "next/link";
import { Fragment, type ReactNode, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, Building2, Camera, FilePlus2, Landmark, LayoutDashboard,
  Menu, Receipt, ShoppingCart, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, VisuallyHidden,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type PurchasesTab = "overview" | "capture" | "bills" | "vendors" | "payments";

type NavigationGroup = "Workspace" | "Purchase documents" | "Suppliers";

export type PurchasesNavItem = {
  id: PurchasesTab;
  label: string;
  description: string;
  group: NavigationGroup;
  icon: LucideIcon;
};

export const PURCHASES_NAV_ITEMS: PurchasesNavItem[] = [
  { id: "overview", label: "Purchase overview", description: "Bills due, overdue and recently paid", group: "Workspace", icon: LayoutDashboard },
  { id: "capture", label: "New expense", description: "Upload a receipt or supplier invoice", group: "Purchase documents", icon: Camera },
  { id: "bills", label: "Purchase invoices", description: "Supplier bills and accounts payable", group: "Purchase documents", icon: Receipt },
  { id: "vendors", label: "Suppliers", description: "Supplier details and payment terms", group: "Suppliers", icon: Building2 },
  { id: "payments", label: "Supplier payments", description: "Pay and allocate purchase invoices", group: "Suppliers", icon: Landmark },
];

export type PurchasesBadges = Partial<Record<PurchasesTab, number>>;

function SidebarContent({
  activeId,
  badges,
  onNavigate,
  onNewExpense,
  onNewBill,
  onClose,
}: {
  activeId: PurchasesTab;
  badges?: PurchasesBadges;
  onNavigate: (id: PurchasesTab) => void;
  onNewExpense: () => void;
  onNewBill: () => void;
  onClose?: () => void;
}) {
  const act = (callback: () => void) => { onClose?.(); callback(); };

  return <div className="flex h-full min-h-0 flex-col bg-foreground text-white">
    <div className="flex h-[88px] shrink-0 items-center gap-3 border-b border-white/10 px-5">
      <div className="flex h-10 w-10 items-center justify-center border border-white/15 bg-white/10 text-accent-muted"><ShoppingCart className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[.2em] text-accent-muted">Kretivco</div>
        <div className="mt-0.5 text-lg font-semibold tracking-tight">Purchases</div>
      </div>
      {onClose && <button onClick={onClose} className="flex h-10 w-10 items-center justify-center text-white/65 hover:bg-white/10 hover:text-white" aria-label="Close purchases menu"><X className="h-5 w-5" /></button>}
    </div>

    <div className="shrink-0 border-b border-white/10 p-3">
      <div className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-[.18em] text-white/35">Quick create</div>
      <button type="button" onClick={() => act(onNewExpense)} className="flex min-h-11 w-full items-center gap-3 bg-accent-soft px-3 text-left text-xs font-semibold text-foreground transition hover:bg-accent-muted">
        <Camera className="h-4 w-4" />Upload receipt
      </button>
      <button type="button" onClick={() => act(onNewBill)} className="mt-2 flex min-h-10 w-full items-center gap-3 border border-white/10 px-3 text-left text-xs font-medium text-white/65 transition hover:border-white/20 hover:bg-white/[.06] hover:text-white">
        <FilePlus2 className="h-4 w-4" />New purchase invoice
      </button>
    </div>

    <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Purchases navigation">
      {PURCHASES_NAV_ITEMS.map((item, index) => {
        const Icon = item.icon;
        const showGroup = index === 0 || PURCHASES_NAV_ITEMS[index - 1].group !== item.group;
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

export function PurchasesShell({
  activeId,
  title,
  description,
  badges,
  onNavigate,
  onNewExpense,
  onNewBill,
  actions,
  children,
}: {
  activeId: PurchasesTab;
  title: string;
  description: string;
  badges?: PurchasesBadges;
  onNavigate: (id: PurchasesTab) => void;
  onNewExpense: () => void;
  onNewBill: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarProps = { activeId, badges, onNavigate, onNewExpense, onNewBill };

  return <main className="min-h-screen bg-background text-foreground">
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh self-start border-r border-black/10 lg:block">
        <SidebarContent {...sidebarProps} />
      </aside>
      <div className="min-w-0 pb-24">
        <header className="sticky top-0 z-40 border-b border-black/5 bg-background/95 backdrop-blur-xl">
          <div className="mx-auto flex min-h-[72px] max-w-[1600px] items-center gap-3 px-4 md:min-h-24 md:px-8 md:py-5">
            <Button variant="outline" size="icon" className="shrink-0 bg-card lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open purchases navigation"><Menu className="h-5 w-5" /></Button>
            <div className="min-w-0 flex-1">
              <div className="hidden text-[10px] font-semibold uppercase tracking-[.2em] text-accent sm:block">Kretivco purchases</div>
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
      <DialogContent showCloseButton={false} overlayClassName="z-[210] bg-black/55 lg:hidden" className="left-0 top-0 z-[220] h-full max-h-full w-[min(326px,88vw)] max-w-none translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0 lg:hidden">
        <VisuallyHidden>
          <DialogTitle>Purchases navigation</DialogTitle>
          <DialogDescription>Move between expenses, purchase invoices, suppliers and payments.</DialogDescription>
        </VisuallyHidden>
        <SidebarContent {...sidebarProps} onClose={() => setMobileOpen(false)} />
      </DialogContent>
    </Dialog>
  </main>;
}

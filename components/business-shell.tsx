"use client";

import Link from "next/link";
import { Fragment, type ReactNode, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, Banknote, BriefcaseBusiness, Building2, Check, ChevronDown, Contact, FileCheck2,
  FilePlus2, FileText, HandCoins, LayoutDashboard, Menu, Plus, Receipt,
  RotateCcw, ShoppingCart, Truck, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, VisuallyHidden,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type BusinessTab =
  | "overview" | "customers" | "contacts" | "brands" | "channels"
  | "crm" | "sales" | "cash-sale" | "quotation" | "sales-order"
  | "delivery-order" | "proforma-invoice" | "invoice" | "receipt"
  | "credit-note" | "settlements" | "projects" | "onboarding";

type NavigationGroup = "Workspace" | "Customers" | "Sales documents" | "Revenue" | "Handoff";

export type BusinessNavItem = {
  id: BusinessTab;
  label: string;
  description: string;
  group: NavigationGroup;
  icon: LucideIcon;
};

export const BUSINESS_NAV_ITEMS: BusinessNavItem[] = [
  { id: "overview", label: "Sales overview", description: "Pipeline, receivables and conversion", group: "Workspace", icon: LayoutDashboard },
  { id: "crm", label: "CRM pipeline", description: "Leads, opportunities and next actions", group: "Customers", icon: Users },
  { id: "customers", label: "Customers", description: "Companies and client records", group: "Customers", icon: Building2 },
  { id: "contacts", label: "Contacts", description: "People at each customer", group: "Customers", icon: Contact },
  { id: "sales", label: "All documents", description: "Every sales document in one queue", group: "Sales documents", icon: FileText },
  { id: "cash-sale", label: "Cash sales", description: "Immediate sale and payment", group: "Sales documents", icon: Banknote },
  { id: "quotation", label: "Quotations", description: "Prices and scope sent to customers", group: "Sales documents", icon: FilePlus2 },
  { id: "sales-order", label: "Sales orders", description: "Confirmed customer orders", group: "Sales documents", icon: ShoppingCart },
  { id: "delivery-order", label: "Delivery orders", description: "Goods and services delivered", group: "Sales documents", icon: Truck },
  { id: "proforma-invoice", label: "Proforma invoices", description: "Preliminary invoices before billing", group: "Sales documents", icon: FileCheck2 },
  { id: "invoice", label: "Sales invoices", description: "Amounts billed to customers", group: "Sales documents", icon: Receipt },
  { id: "receipt", label: "Receipts", description: "Customer payment acknowledgements", group: "Sales documents", icon: HandCoins },
  { id: "credit-note", label: "Credit notes", description: "Reductions and customer credits", group: "Sales documents", icon: RotateCcw },
  { id: "settlements", label: "Settlement overview", description: "Weekly fees and status · managed in Accounting", group: "Revenue", icon: HandCoins },
  { id: "onboarding", label: "Client onboarding", description: "Commercial handoff and launch checklist", group: "Handoff", icon: Check },
  { id: "projects", label: "Delivery handoff", description: "Projects created from won work", group: "Handoff", icon: BriefcaseBusiness },
];

export type BusinessBadges = Partial<Record<BusinessTab, number>>;

function SidebarContent({
  activeId,
  badges,
  onNavigate,
  onCreateQuotation,
  onCreateCustomer,
  onClose,
}: {
  activeId: BusinessTab;
  badges?: BusinessBadges;
  onNavigate: (id: BusinessTab) => void;
  onCreateQuotation: () => void;
  onCreateCustomer: () => void;
  onClose?: () => void;
}) {
  const act = (callback: () => void) => { onClose?.(); callback(); };
  const [salesDocumentsOpen, setSalesDocumentsOpen] = useState(false);
  const salesDocumentActive = BUSINESS_NAV_ITEMS.some((item) => item.group === "Sales documents" && item.id === activeId);
  const salesDocumentsExpanded = salesDocumentsOpen || salesDocumentActive;

  return <div className="flex h-full min-h-0 flex-col bg-[#1c2b23] text-white">
    <div className="flex h-[88px] shrink-0 items-center gap-3 border-b border-white/10 px-5">
      <div className="flex h-10 w-10 items-center justify-center border border-white/15 bg-white/10 text-[#f19a7f]"><BriefcaseBusiness className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#f19a7f]">Kretivco</div>
        <div className="mt-0.5 text-lg font-semibold tracking-tight">Sales</div>
      </div>
      {onClose && <button onClick={onClose} className="flex h-10 w-10 items-center justify-center text-white/65 hover:bg-white/10 hover:text-white" aria-label="Close sales menu"><X className="h-5 w-5" /></button>}
    </div>

    <div className="shrink-0 border-b border-white/10 p-3">
      <div className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-[.18em] text-white/35">Quick create</div>
      <button type="button" onClick={() => act(onCreateQuotation)} className="flex min-h-11 w-full items-center gap-3 bg-[#ef8a6b] px-3 text-left text-xs font-semibold text-[#1c2b23] transition hover:bg-[#f19a7f]">
        <FilePlus2 className="h-4 w-4" />New quotation
      </button>
      <button type="button" onClick={() => act(onCreateCustomer)} className="mt-2 flex min-h-10 w-full items-center gap-3 border border-white/10 px-3 text-left text-xs font-medium text-white/65 transition hover:border-white/20 hover:bg-white/[.06] hover:text-white">
        <Plus className="h-4 w-4" />New customer
      </button>
    </div>

    <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Sales navigation">
      {BUSINESS_NAV_ITEMS.map((item, index) => {
        if (item.group === "Sales documents" && item.id !== "sales" && !salesDocumentsExpanded) return null;
        const Icon = item.icon;
        const showGroup = index === 0 || BUSINESS_NAV_ITEMS[index - 1].group !== item.group;
        const active = activeId === item.id;
        const badge = badges?.[item.id];
        return <Fragment key={item.id}>
          {showGroup && (item.group === "Sales documents"
            ? <button type="button" onClick={() => setSalesDocumentsOpen((value) => !value)} aria-expanded={salesDocumentsExpanded} className={cn("flex w-full items-center justify-between px-3 pb-2 text-left text-[9px] font-semibold uppercase tracking-[.18em] text-white/35", index > 0 && "pt-5")}><span>{item.group}</span><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", salesDocumentsExpanded && "rotate-180")} /></button>
            : <div className={cn("px-3 pb-2 text-[9px] font-semibold uppercase tracking-[.18em] text-white/35", index > 0 && "pt-5")}>{item.group}</div>)}
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
            {badge ? <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center bg-[#ef8a6b] px-1.5 text-[10px] font-semibold text-[#1c2b23]">{badge > 99 ? "99+" : badge}</span> : null}
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

export function BusinessShell({
  activeId,
  title,
  description,
  badges,
  onNavigate,
  onCreateQuotation,
  onCreateCustomer,
  actions,
  children,
}: {
  activeId: BusinessTab;
  title: string;
  description: string;
  badges?: BusinessBadges;
  onNavigate: (id: BusinessTab) => void;
  onCreateQuotation: () => void;
  onCreateCustomer: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarProps = { activeId, badges, onNavigate, onCreateQuotation, onCreateCustomer };

  return <main className="min-h-screen bg-[#f5f2ea] text-[#202820]">
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh self-start border-r border-black/10 lg:block">
        <SidebarContent {...sidebarProps} />
      </aside>

      <div className="min-w-0 pb-24">
        <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f5f2ea]/95 backdrop-blur-xl">
          <div className="mx-auto flex min-h-[72px] max-w-[1600px] items-center gap-3 px-4 md:min-h-24 md:px-8 md:py-5">
            <Button variant="outline" size="icon" className="shrink-0 bg-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open sales navigation"><Menu className="h-5 w-5" /></Button>
            <div className="min-w-0 flex-1">
              <div className="hidden text-[10px] font-semibold uppercase tracking-[.2em] text-[#ba5c42] sm:block">Kretivco sales</div>
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
          <DialogTitle>Sales navigation</DialogTitle>
          <DialogDescription>Move through the customer, quotation, order, invoice and receipt flow.</DialogDescription>
        </VisuallyHidden>
        <SidebarContent {...sidebarProps} onClose={() => setMobileOpen(false)} />
      </DialogContent>
    </Dialog>
  </main>;
}

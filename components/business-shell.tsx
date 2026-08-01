"use client";

import Link from "next/link";
import { Fragment, type ReactNode, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, BriefcaseBusiness, Building2, Check, Contact, FilePlus2,
  FileText, LayoutDashboard, Megaphone, Menu, Palette, Plus, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, VisuallyHidden,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type BusinessTab =
  | "overview" | "customers" | "contacts" | "brands" | "channels"
  | "crm" | "sales" | "projects" | "onboarding";

type NavigationGroup = "Workspace" | "Relationships" | "Revenue" | "Delivery";

export type BusinessNavItem = {
  id: BusinessTab;
  label: string;
  description: string;
  group: NavigationGroup;
  icon: LucideIcon;
};

export const BUSINESS_NAV_ITEMS: BusinessNavItem[] = [
  { id: "overview", label: "Overview", description: "Pipeline, receivables and delivery", group: "Workspace", icon: LayoutDashboard },
  { id: "customers", label: "Customers", description: "Companies and client records", group: "Relationships", icon: Building2 },
  { id: "contacts", label: "Contacts", description: "People at each customer", group: "Relationships", icon: Contact },
  { id: "brands", label: "Brands", description: "Brands owned by customers", group: "Relationships", icon: Palette },
  { id: "channels", label: "Channels", description: "Sales and marketing channels", group: "Relationships", icon: Megaphone },
  { id: "crm", label: "CRM pipeline", description: "Opportunities and next actions", group: "Revenue", icon: Users },
  { id: "sales", label: "Sales documents", description: "Quotations, invoices and receipts", group: "Revenue", icon: FileText },
  { id: "projects", label: "Projects", description: "Client delivery and progress", group: "Delivery", icon: BriefcaseBusiness },
  { id: "onboarding", label: "Client onboarding", description: "Readiness and launch checklist", group: "Delivery", icon: Check },
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

  return <div className="flex h-full min-h-0 flex-col bg-[#1c2b23] text-white">
    <div className="flex h-[88px] shrink-0 items-center gap-3 border-b border-white/10 px-5">
      <div className="flex h-10 w-10 items-center justify-center border border-white/15 bg-white/10 text-[#f19a7f]"><BriefcaseBusiness className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#f19a7f]">Kretivco</div>
        <div className="mt-0.5 text-lg font-semibold tracking-tight">Business</div>
      </div>
      {onClose && <button onClick={onClose} className="flex h-10 w-10 items-center justify-center text-white/65 hover:bg-white/10 hover:text-white" aria-label="Close business menu"><X className="h-5 w-5" /></button>}
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

    <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Business navigation">
      {BUSINESS_NAV_ITEMS.map((item, index) => {
        const Icon = item.icon;
        const showGroup = index === 0 || BUSINESS_NAV_ITEMS[index - 1].group !== item.group;
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
            <Button variant="outline" size="icon" className="shrink-0 bg-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open business navigation"><Menu className="h-5 w-5" /></Button>
            <div className="min-w-0 flex-1">
              <div className="hidden text-[10px] font-semibold uppercase tracking-[.2em] text-[#ba5c42] sm:block">Kretivco business</div>
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
          <DialogTitle>Business navigation</DialogTitle>
          <DialogDescription>Move between customers, sales documents and client delivery.</DialogDescription>
        </VisuallyHidden>
        <SidebarContent {...sidebarProps} onClose={() => setMobileOpen(false)} />
      </DialogContent>
    </Dialog>
  </main>;
}

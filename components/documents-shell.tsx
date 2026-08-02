"use client";

import Link from "next/link";
import { Fragment, type ReactNode, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, FileStack, FileText, LayoutTemplate, Menu,
  Plus, Sparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, VisuallyHidden,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type DocumentsTab = "templates" | "documents" | "print";

type NavigationGroup = "Create" | "Output" | "Setup";

export type DocumentsNavItem = {
  id: DocumentsTab;
  label: string;
  description: string;
  group: NavigationGroup;
  icon: LucideIcon;
};

export const DOCUMENTS_NAV_ITEMS: DocumentsNavItem[] = [
  { id: "templates", label: "Template library", description: "Reusable content and variables", group: "Create", icon: LayoutTemplate },
  { id: "documents", label: "Generated documents", description: "Saved drafts and final files", group: "Output", icon: FileStack },
  { id: "print", label: "Print settings", description: "Bank details, notes and signatures", group: "Setup", icon: FileText },
];

function SidebarContent({
  activeId,
  documentCount,
  onNavigate,
  onNewTemplate,
  onClose,
}: {
  activeId: DocumentsTab;
  documentCount: number;
  onNavigate: (id: DocumentsTab) => void;
  onNewTemplate: () => void;
  onClose?: () => void;
}) {
  return <div className="flex h-full min-h-0 flex-col bg-foreground text-white">
    <div className="flex h-[88px] shrink-0 items-center gap-3 border-b border-white/10 px-5">
      <div className="flex h-10 w-10 items-center justify-center border border-white/15 bg-white/10 text-accent-muted"><FileText className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[.2em] text-accent-muted">Kretivco</div>
        <div className="mt-0.5 text-lg font-semibold tracking-tight">Documents</div>
      </div>
      {onClose && <button onClick={onClose} className="flex h-10 w-10 items-center justify-center text-white/65 hover:bg-white/10 hover:text-white" aria-label="Close documents menu"><X className="h-5 w-5" /></button>}
    </div>

    <div className="shrink-0 border-b border-white/10 p-3">
      <div className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-[.18em] text-white/35">Quick create</div>
      <button type="button" onClick={() => { onClose?.(); onNewTemplate(); }} className="flex min-h-11 w-full items-center gap-3 bg-accent-soft px-3 text-left text-xs font-semibold text-foreground transition hover:bg-accent-muted">
        <Plus className="h-4 w-4" />New template
      </button>
      <Link href="/document-ai" onClick={onClose} className="mt-2 flex min-h-10 w-full items-center gap-3 border border-white/10 px-3 text-xs font-medium text-white/65 transition hover:border-white/20 hover:bg-white/[.06] hover:text-white">
        <Sparkles className="h-4 w-4" />AI proposal package
      </Link>
    </div>

    <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Documents navigation">
      {DOCUMENTS_NAV_ITEMS.map((item, index) => {
        const Icon = item.icon;
        const showGroup = index === 0 || DOCUMENTS_NAV_ITEMS[index - 1].group !== item.group;
        const active = activeId === item.id;
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
            {item.id === "documents" && documentCount > 0 && <span className="ml-auto flex h-5 min-w-5 items-center justify-center bg-accent-soft px-1.5 text-[10px] font-semibold text-foreground">{documentCount > 99 ? "99+" : documentCount}</span>}
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

export function DocumentsShell({
  activeId,
  title,
  description,
  documentCount,
  onNavigate,
  onNewTemplate,
  actions,
  children,
}: {
  activeId: DocumentsTab;
  title: string;
  description: string;
  documentCount: number;
  onNavigate: (id: DocumentsTab) => void;
  onNewTemplate: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarProps = { activeId, documentCount, onNavigate, onNewTemplate };

  return <main className="min-h-screen bg-background text-foreground">
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh self-start border-r border-black/10 lg:block"><SidebarContent {...sidebarProps} /></aside>
      <div className="min-w-0 pb-24">
        <header className="sticky top-0 z-40 border-b border-black/5 bg-background/95 backdrop-blur-xl">
          <div className="mx-auto flex min-h-[72px] max-w-[1600px] items-center gap-3 px-4 md:min-h-24 md:px-8 md:py-5">
            <Button variant="outline" size="icon" className="shrink-0 bg-card lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open documents navigation"><Menu className="h-5 w-5" /></Button>
            <div className="min-w-0 flex-1">
              <div className="hidden text-[10px] font-semibold uppercase tracking-[.2em] text-accent sm:block">Kretivco documents</div>
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
        <VisuallyHidden><DialogTitle>Documents navigation</DialogTitle><DialogDescription>Move between reusable templates, generated files and commercial print layouts.</DialogDescription></VisuallyHidden>
        <SidebarContent {...sidebarProps} onClose={() => setMobileOpen(false)} />
      </DialogContent>
    </Dialog>
  </main>;
}

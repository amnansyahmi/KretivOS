"use client";

/**
 * ⌘K / Ctrl-K command palette.
 *
 * Replaces the header "search" control, which was a link to /knowledge dressed
 * as a search field. Destinations are matched locally and instantly; records are
 * fetched from /api/search behind a debounce, so typing stays responsive and a
 * slow or unavailable database only costs the record half of the results.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Bot, Building2, CircleDollarSign, ClipboardCheck, Contact, FileText,
  FolderKanban, HandCoins, Library, Loader2, Palette, Rocket, Search, Sparkles,
  Target, UsersRound, Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Destination = { label: string; href: string; group: string; icon: any; keywords?: string };
type Hit = { id: string; type: string; title: string; subtitle: string; href: string };

const DESTINATIONS: Destination[] = [
  { label: "Command Centre", href: "/", group: "Company", icon: Sparkles, keywords: "home dashboard overview" },
  { label: "Client Workspaces", href: "/business?tab=customers", group: "Company", icon: Building2, keywords: "customers clients" },
  { label: "Customer Onboarding", href: "/business?tab=onboarding", group: "Company", icon: Rocket },
  { label: "HRMS", href: "/hr", group: "Company", icon: UsersRound, keywords: "hr people leave payroll attendance" },
  { label: "Approval Inbox", href: "/approvals", group: "Company", icon: ClipboardCheck, keywords: "approve pending" },
  { label: "CRM & Pipeline", href: "/business?tab=crm", group: "Business", icon: Contact, keywords: "opportunities deals" },
  { label: "AI Proposal Package", href: "/document-ai", group: "Business", icon: Sparkles, keywords: "proposal quotation generate" },
  { label: "Sales & Documents", href: "/business?tab=sales", group: "Business", icon: FileText, keywords: "quotation invoice" },
  { label: "Finance", href: "/business?tab=finance", group: "Business", icon: CircleDollarSign, keywords: "cash transactions" },
  { label: "Weekly Settlement", href: "/business?tab=settlements", group: "Business", icon: HandCoins, keywords: "tuesday settlement" },
  { label: "Projects & Delivery", href: "/business?tab=projects", group: "Business", icon: FolderKanban },
  { label: "Kretiv AI Studio", href: "/ai-studio", group: "Creative", icon: Bot, keywords: "chat ai prompts" },
  { label: "Funnel Builder", href: "/funnels", group: "Creative", icon: Target, keywords: "tofu mofu bofu" },
  { label: "Brand & Assets", href: "/brands", group: "Creative", icon: Palette, keywords: "brand dna" },
  { label: "Knowledge Library", href: "/knowledge", group: "Operations", icon: Library, keywords: "documents sources search" },
  { label: "Automations", href: "/automations", group: "Operations", icon: Workflow, keywords: "recipes triggers" },
  { label: "Documents", href: "/documents", group: "Operations", icon: FileText, keywords: "templates" },
];

const DEBOUNCE_MS = 180;

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const destinations = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return DESTINATIONS;
    return DESTINATIONS.filter((item) => `${item.label} ${item.group} ${item.keywords ?? ""}`.toLowerCase().includes(term));
  }, [query]);

  const results = useMemo(() => [
    ...destinations.map((item) => ({ kind: "destination" as const, item })),
    ...hits.map((item) => ({ kind: "record" as const, item })),
  ], [destinations, hits]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits([]);
    setActive(0);
    // The dialog mounts before focus can land, so defer a frame.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Record search is debounced and cancelled on each keystroke so an early,
  // slower response cannot overwrite the results for what is now typed.
  useEffect(() => {
    const term = query.trim();
    if (!open || term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = await response.json();
        setHits(response.ok ? payload.hits || [] : []);
      } catch {
        // Aborted or offline; destinations still answer the query.
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open]);

  useEffect(() => { setActive(0); }, [results.length]);

  const go = useCallback((href: string) => {
    onOpenChange(false);
    router.push(href);
  }, [onOpenChange, router]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") { onOpenChange(false); return; }
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      setActive((current) => (results.length ? (current + 1) % results.length : 0));
    } else if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      setActive((current) => (results.length ? (current - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = results[active];
      if (selected) go(selected.kind === "destination" ? selected.item.href : selected.item.href);
    }
  }

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let index = -1;
  let lastGroup = "";

  return <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={() => onOpenChange(false)}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search KretivOS"
      className="w-full max-w-xl overflow-hidden rounded-2xl border bg-white shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-3 border-b px-4">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search workspaces, customers, documents, projects and knowledge…"
          className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
        {!results.length && <p className="px-3 py-8 text-center text-sm text-muted-foreground">
          {query.trim().length < 2 ? "Type to search." : "Nothing matched that."}
        </p>}

        {results.map((result) => {
          index += 1;
          const current = index;
          const group = result.kind === "destination" ? result.item.group : "Records";
          const header = group !== lastGroup ? group : "";
          lastGroup = group;

          const Icon = result.kind === "destination" ? result.item.icon : FileText;
          const title = result.kind === "destination" ? result.item.label : result.item.title;
          const subtitle = result.kind === "destination" ? "Workspace" : `${result.item.type}${result.item.subtitle ? ` · ${result.item.subtitle}` : ""}`;

          return <div key={result.kind === "destination" ? result.item.href : result.item.id}>
            {header && <div className="px-3 pb-1 pt-3 text-[9px] font-semibold uppercase tracking-[.18em] text-muted-foreground">{header}</div>}
            <button
              data-index={current}
              onMouseEnter={() => setActive(current)}
              onClick={() => go(result.item.href)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left",
                current === active ? "bg-[#f4f1e8]" : "hover:bg-[#faf8f3]",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
              </span>
              {current === active && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </button>
          </div>;
        })}
      </div>

      <div className="flex items-center gap-4 border-t bg-[#faf8f3] px-4 py-2 text-[10px] text-muted-foreground">
        <span><kbd className="rounded border bg-white px-1">↑</kbd> <kbd className="rounded border bg-white px-1">↓</kbd> navigate</span>
        <span><kbd className="rounded border bg-white px-1">↵</kbd> open</span>
        <span><kbd className="rounded border bg-white px-1">esc</kbd> close</span>
      </div>
    </div>
  </div>;
}

/** Any component can open the palette without threading state through the tree. */
export const OPEN_PALETTE_EVENT = "kretivos:open-palette";
export const openCommandPalette = () => window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));

/**
 * Mounted once in the root layout so ⌘K works on every route, not only the
 * dashboard. The modifier is required, so the shortcut cannot fire while
 * someone is typing a "k" into a field.
 */
export function GlobalCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    const onRequest = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_PALETTE_EVENT, onRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_PALETTE_EVENT, onRequest);
    };
  }, []);

  return <CommandPalette open={open} onOpenChange={setOpen} />;
}

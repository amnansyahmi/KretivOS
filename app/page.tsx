"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowRight, BarChart3, Bot, Building2, Check,
  ChevronRight, CircleDollarSign, Clapperboard, ClipboardCheck, Cloud, Code2,
  Calculator, Database, FileText, Film, GitBranch,
  HandCoins, LayoutDashboard, Library, Megaphone, Menu, MessageSquareText,
  MonitorSmartphone, Palette, PanelLeftClose, PanelLeftOpen,
  Plus, Presentation, Receipt, RefreshCw, Search, Send, Settings2, ShoppingCart,
  Sparkles, TrendingUp, UsersRound, WandSparkles, Workflow, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AIWritingButton } from "@/components/ai-writing-button";
import { ContentWriter } from "@/components/content-writer";
import { KretivAIChat } from "@/components/kretiv-ai-chat";
import { openCommandPalette } from "@/components/command-palette";
import { NotificationBell } from "@/components/notification-bell";
import { RowSkeleton, StatSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

/**
 * Views rendered inside this shell. Every workspace that owns database-backed
 * records lives on its own route instead, and is reached through `href` below.
 */
type View =
  | "Command Centre" | "Approvals" | "Marketing Studio"
  | "Prompt Lab" | "Technology" | "Settings";

type NavItem = { name: string; icon: any; view?: View; href?: string };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  { label: "Company", items: [
    { name: "Command Centre", icon: LayoutDashboard, view: "Command Centre" },
    { name: "Sales", icon: Building2, href: "/sales?tab=overview" },
    { name: "HR & Team", icon: UsersRound, href: "/hr" },
    { name: "Approval Inbox", icon: ClipboardCheck, href: "/approvals" },
  ]},
  { label: "Finance", items: [
    { name: "Purchases", icon: ShoppingCart, href: "/purchases" },
    { name: "Accounting", icon: Calculator, href: "/accounting" },
  ]},
  { label: "Creative Studio", items: [
    { name: "AI Studio", icon: Bot, href: "/ai-studio" },
    { name: "Marketing Studio", icon: Megaphone, view: "Marketing Studio" },
    // Funnel Builder was reachable only from a button inside Marketing Studio,
    // so it appeared in neither the sidebar nor the command palette.
    { name: "Funnel Builder", icon: Clapperboard, href: "/funnels" },
    { name: "Brand DNA", icon: Palette, href: "/brands" },
  ]},
  { label: "Operations", items: [
    { name: "Knowledge", icon: Library, href: "/knowledge" },
    { name: "Automations", icon: Workflow, href: "/automations" },
    { name: "Documents", icon: FileText, href: "/documents" },
    { name: "Settings", icon: Settings2, view: "Settings" },
  ]},
];

// Prompt Lab and Technology remain available as secondary workspaces from AI
// Studio and Settings, but do not compete with the primary navigation.
const views = [...navGroups.flatMap(group => group.items.map(item => item.view).filter(Boolean)), "Prompt Lab", "Technology"] as View[];

/** Folded into Marketing Studio, but still live in old bookmarks and links. */
const LEGACY_VIEWS = ["Marketing Plans", "Content Planner", "Storyboard Studio"];

/**
 * The dashboard's view lives in the URL.
 *
 * It used to live in localStorage, which quietly redefined "/" as "wherever you
 * left off". Every "Back to KretivOS" link in the app — there are eight, across
 * HR, Knowledge, Business, Accounting, Documents and Purchases — points at "/",
 * so all of them dropped you on your last view instead of the Command Centre.
 * From AI Studio that was reliably Prompt Lab, because its Prompt Lab button
 * deep-links through "/?view=Prompt Lab" and the old code wrote that straight
 * into storage and then stripped the query string.
 *
 * With the view in the URL: "/" unambiguously means the Command Centre, a view
 * still survives a refresh, links are shareable, and the browser Back button
 * steps between views rather than leaving the app.
 */
function useViewRouting() {
  const [view, setViewState] = useState<View>("Command Centre");

  const fromUrl = useCallback((): View => {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (!requested) return "Command Centre";
    if (LEGACY_VIEWS.includes(requested)) return "Marketing Studio";
    return views.includes(requested as View) ? (requested as View) : "Command Centre";
  }, []);

  useEffect(() => {
    setViewState(fromUrl());
    const onPop = () => setViewState(fromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [fromUrl]);

  const setView = useCallback((next: View) => {
    setViewState(next);
    // The Command Centre is the bare path, so "/" keeps one obvious meaning.
    window.history.pushState({}, "", next === "Command Centre" ? "/" : `/?view=${encodeURIComponent(next)}`);
  }, []);

  return [view, setView] as const;
}

const money = (n: number) => `RM${Number(n || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;
const team = ["Amirul Hafiz", "Nurfadilah (Ila)", "Muhammad Afiq", "Amnan", "Ajam (Multazam)"];

const projectionRows = [
  { month: "Bulan 1", unitsWeek: 250, weekly: 500, monthly: 2000, incentive: 0, stage: "Warm-up" },
  { month: "Bulan 2", unitsWeek: 1250, weekly: 2500, monthly: 10000, incentive: 0, stage: "Scaling" },
  { month: "Bulan 3", unitsWeek: 2500, weekly: 5000, monthly: 20000, incentive: 2200, stage: "+ Insentif" },
  ...Array.from({ length: 9 }, (_, i) => ({ month: `Bulan ${i + 4}`, unitsWeek: 7500, weekly: 15000, monthly: 60000, incentive: 16500, stage: "Full speed" })),
];

function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored) { try { setValue(JSON.parse(stored)); } catch {} }
  }, [key]);
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue] as const;
}

export type BusinessSnapshot = {
  customers: any[]; contacts: any[]; brands: any[]; channels: any[];
  opportunities: any[]; documents: any[]; transactions: any[];
  settlements: any[]; projects: any[]; onboardings: any[]; syncedAt?: string;
};

const emptyBusiness: BusinessSnapshot = {
  customers: [], contacts: [], brands: [], channels: [], opportunities: [],
  documents: [], transactions: [], settlements: [], projects: [], onboardings: []
};

/** Shared read of the Neon-backed business snapshot used by the dashboard and approval queue. */
function useBusinessSnapshot() {
  const [data, setData] = useState<BusinessSnapshot>(emptyBusiness);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/business", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load business data.");
      setData(payload);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load business data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload };
}

export default function Home() {
  const [view, setView] = useViewRouting();
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = usePersisted("kretivos-sidebar", false);
  const [chat, setChat] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const handler = (event: Event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  };

  const active = views.includes(view) ? view : "Command Centre";

  return <div className="min-h-screen bg-background text-foreground">
    <aside className={cn(
      "fixed inset-y-0 left-0 z-50 flex h-[100dvh] flex-col border-r border-white/10 bg-foreground text-white transition-all duration-300",
      collapsed ? "w-[76px]" : "w-[264px]",
      mobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
    )}>
      <div className={cn("flex h-[76px] shrink-0 items-center border-b border-white/10", collapsed ? "justify-center px-2" : "justify-between px-5")}>
        <div className={cn(collapsed && "hidden")}>
          <div className="text-xl font-semibold tracking-tight">Kretiv<span className="text-accent-soft">OS</span></div>
          <div className="text-[9px] uppercase tracking-[.25em] text-white/40">Kretivco operating system</div>
        </div>
        {collapsed && <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft font-bold">K</div>}
        <button onClick={() => setMobile(false)} className="lg:hidden" aria-label="Close navigation"><X className="h-5 w-5" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        {navGroups.map(group => <div key={group.label} className="mb-5">
          {!collapsed && <div className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[.2em] text-white/30">{group.label}</div>}
          <div className="space-y-1">{group.items.map(item => {
            const Icon = item.icon;
            const isActive = item.view === active;
            const className = cn(
              "flex w-full items-center rounded-lg text-sm transition",
              collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
              isActive ? "bg-card text-foreground shadow" : "text-white/62 hover:bg-white/8 hover:text-white"
            );
            const body = <>
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.name}</span>}
            </>;

            // Database-backed workspaces are real routes, so they navigate as links.
            return item.href
              ? <Link key={item.name} href={item.href} title={collapsed ? item.name : undefined} onClick={() => setMobile(false)} className={className}>{body}</Link>
              : <button key={item.name} onClick={() => { setView(item.view!); setMobile(false); }} title={collapsed ? item.name : undefined} className={className}>{body}</button>;
          })}</div>
        </div>)}
      </div>
      <div className="z-10 flex h-20 w-full shrink-0 items-center border-t border-white/10 bg-foreground px-3">
        <div className={cn("flex w-full items-center rounded-lg p-2", collapsed ? "justify-center" : "gap-3")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold">KT</div>
          {!collapsed && <div className="min-w-0 text-left"><div className="truncate text-xs font-medium">Kretivco Team</div><div className="text-[10px] text-white/40">Shared internal workspace</div></div>}
        </div>
      </div>
    </aside>

    <main className={cn("min-h-screen transition-all duration-300", collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]")}>
      <header className="sticky top-0 z-40 flex h-[76px] items-center gap-3 border-b border-black/5 bg-background/92 px-4 backdrop-blur-xl md:px-7">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobile(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></Button>
        <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">{collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}</Button>
        <button onClick={openCommandPalette} className="hidden h-10 max-w-lg flex-1 items-center gap-2 rounded-lg border bg-white/70 px-3 text-left text-sm text-muted-foreground shadow-sm transition hover:bg-card md:flex">
          <Search className="h-4 w-4" />
          <span className="flex-1 truncate">Search workspaces, customers, documents…</span>
          <kbd className="rounded border bg-card px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="icon" className="bg-card md:hidden" onClick={openCommandPalette} aria-label="Search"><Search className="h-4 w-4" /></Button>
          {installPrompt && <Button variant="outline" className="hidden bg-card sm:inline-flex" onClick={install}><MonitorSmartphone className="h-4 w-4" />Install app</Button>}
          <NotificationBell />
          <Button onClick={() => setChat(true)}><Bot className="h-4 w-4" /><span className="hidden sm:inline">Ask Kretiv AI</span></Button>
        </div>
      </header>
      <div className="p-4 md:p-7 lg:p-8"><ViewRouter view={active} /></div>
    </main>
    {mobile && <div className="fixed inset-0 z-40 bg-black/45 lg:hidden" onClick={() => setMobile(false)} />}
    {chat && <KretivAIChat onClose={() => setChat(false)} module={active} />}
  </div>;
}

function ViewRouter({ view }: { view: View }) {
  switch (view) {
    case "Command Centre": return <CommandCentre />;
    case "Approvals": return <Approvals />;
    case "Marketing Studio": return <MarketingStudio />;
    case "Prompt Lab": return <PromptLab />;
    case "Technology": return <Technology />;
    case "Settings": return <Settings />;
  }
}

function PageHead({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
    <div>{eyebrow && <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-accent">{eyebrow}</div>}<h1 className="text-3xl font-semibold tracking-tight md:text-[38px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p></div>{action}
  </div>;
}

function Stat({ label, value, note, icon: Icon }: any) { return <Card className="bg-white/75"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="text-xs text-muted-foreground">{label}</div>{Icon && <Icon className="h-4 w-4 text-accent" />}</div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div><div className="mt-2 text-xs text-muted-foreground">{note}</div></CardContent></Card>; }
function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "blue" }) { const tones = { neutral: "bg-muted text-foreground-soft", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", blue: "bg-blue-50 text-blue-700" }; return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium", tones[tone])}>{children}</span>; }
function Empty({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) { return <Card className="bg-white/75"><CardContent className="p-12 text-center"><div className="font-semibold">{title}</div><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>{action && <div className="mt-4 flex justify-center">{action}</div>}</CardContent></Card>; }
function DataNotice({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (loading) return <div className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Loading shared records from Neon…</div>;
  if (error) return <div className="mb-4 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button variant="outline" size="sm" className="bg-card" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" />Retry</Button></div>;
  return null;
}

/**
 * Formats a Date as YYYY-MM-DD in local time.
 *
 * `toISOString().slice(0, 10)` shifts to UTC, so in Malaysia (UTC+8) local
 * midnight on Monday serialises as the preceding Sunday. That was harmless while
 * the planner was a private localStorage blob keyed consistently against itself;
 * it is not harmless now that the same string is a `date` column the whole team
 * reads.
 */
const localDate = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

const daysUntil = (date: string) => {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

function dueLabel(date: string) {
  const days = daysUntil(date);
  if (days === null) return { text: "No date", tone: "neutral" as const };
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: "red" as const };
  if (days === 0) return { text: "Today", tone: "red" as const };
  if (days === 1) return { text: "Tomorrow", tone: "amber" as const };
  if (days <= 7) return { text: `${days} days`, tone: "amber" as const };
  return { text: `${days} days`, tone: "neutral" as const };
}

function CommandCentre() {
  const { data, loading, error, reload } = useBusinessSnapshot();
  const briefing = useBriefing(data);

  const stats = useMemo(() => {
    const open = data.opportunities.filter(item => !["Won", "Lost"].includes(item.stage));
    const pipeline = open.reduce((sum, item) => sum + item.value * item.probability / 100, 0);
    const receivables = data.documents.filter(item => item.type === "Invoice" && ["Sent", "Approved", "Overdue"].includes(item.status)).reduce((sum, item) => sum + item.value, 0);
    const pendingApprovals = data.documents.filter(item => ["Draft", "Sent"].includes(item.status)).length
      + data.settlements.filter(item => ["Draft", "Verified"].includes(item.status)).length;
    const activeClients = data.customers.filter(item => item.status === "Active").length;
    return { pipeline, receivables, pendingApprovals, activeClients, openCount: open.length };
  }, [data]);

  const queue = useMemo(() => {
    const items: { id: string; context: string; title: string; date: string }[] = [];
    for (const item of data.opportunities) {
      if (["Won", "Lost"].includes(item.stage) || !item.nextAction) continue;
      items.push({ id: `opp-${item.id}`, context: data.customers.find(c => c.id === item.customerId)?.name || "Pipeline", title: item.nextAction, date: item.dueDate });
    }
    for (const item of data.documents) {
      if (!["Draft", "Sent", "Overdue"].includes(item.status)) continue;
      items.push({ id: `doc-${item.id}`, context: `${item.type} · ${item.reference || "No reference"}`, title: item.title, date: item.dueDate });
    }
    for (const item of data.onboardings) {
      if (item.status === "Completed") continue;
      const next = item.steps?.find((step: any) => !step.done);
      if (next) items.push({ id: `onb-${item.id}`, context: data.customers.find(c => c.id === item.customerId)?.name || "Onboarding", title: next.label, date: item.targetLaunch });
    }
    return items.sort((a, b) => (daysUntil(a.date) ?? 9999) - (daysUntil(b.date) ?? 9999)).slice(0, 6);
  }, [data]);

  const clients = useMemo(() => data.customers.filter(item => item.status === "Active").slice(0, 3).map(customer => {
    const projects = data.projects.filter(item => item.customerId === customer.id);
    const value = data.opportunities.filter(item => item.customerId === customer.id).reduce((sum, item) => sum + item.value, 0);
    const progress = projects.length ? Math.round(projects.reduce((sum, item) => sum + item.progress, 0) / projects.length) : 0;
    const next = data.opportunities.find(item => item.customerId === customer.id && item.nextAction)?.nextAction;
    return { ...customer, value, progress, projectCount: projects.length, next: next || "No next action set" };
  }), [data]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return <div>
    <PageHead eyebrow={today} title={`${greeting}, Kretivco`} description="Everything requiring attention across clients, revenue, delivery, marketing and technology—drawn live from the shared Neon workspace." action={<div className="flex gap-2"><Button variant="outline" className="bg-card" onClick={reload} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />Sync</Button><Button asChild><Link href="/sales?tab=quotation"><Plus className="h-4 w-4" />New quotation</Link></Button></div>} />
    <DataNotice loading={loading} error={error} onRetry={reload} />

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {loading
        ? Array.from({ length: 4 }, (_, index) => <StatSkeleton key={index} />)
        : <>
          <Stat label="Weighted pipeline" value={money(stats.pipeline)} note={`${stats.openCount} open opportunities`} icon={TrendingUp} />
          <Stat label="Active client workspaces" value={String(stats.activeClients)} note={`${data.projects.length} projects tracked`} icon={Building2} />
          <Stat label="Awaiting decision" value={String(stats.pendingApprovals)} note="Documents and settlements" icon={ClipboardCheck} />
          <Stat label="Receivables" value={money(stats.receivables)} note="Sent, approved and overdue invoices" icon={Receipt} />
        </>}
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-[1.42fr_.8fr]">
      <Card className="overflow-hidden bg-foreground text-white"><CardContent className="p-0"><div className="grid md:grid-cols-[1fr_240px]">
        <div className="p-6 md:p-7">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.2em] text-white/45"><Sparkles className="h-3.5 w-3.5 text-accent-muted" />Company intelligence{briefing.loading && <RefreshCw className="h-3 w-3 animate-spin" />}</div>
          <h2 className="mt-5 max-w-xl text-2xl font-medium leading-snug">{briefing.headline}</h2>
          <div className="mt-6 grid gap-3 text-sm text-white/70">
            {briefing.insights.map((insight, index) => <Insight key={insight.label} n={String(index + 1).padStart(2, "0")} label={insight.label} text={insight.detail} severity={insight.severity} />)}
          </div>
          {briefing.note && <div className="mt-5 text-[10px] text-white/35">{briefing.note}</div>}
        </div>
        <div className="border-t border-white/10 bg-white/5 p-6 md:border-l md:border-t-0">
          <div className="text-xs text-white/45">Weighted pipeline</div>
          <div className="mt-3 text-3xl font-semibold">{money(stats.pipeline)}</div>
          <div className="mt-1 text-xs text-emerald-300">Across {stats.openCount} opportunities</div>
          <div className="mt-8 flex h-24 items-end gap-2 border-b border-white/10">{projectionRows.map((r, i) => <div key={i} className="flex-1 rounded-t bg-white/20" style={{ height: `${Math.max(10, (r.monthly + r.incentive) / 765)}%` }} />)}</div>
        </div>
      </div></CardContent></Card>

      <Card className="bg-white/75"><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Today’s queue</CardTitle><p className="mt-1 text-xs text-muted-foreground">Soonest deadlines across KretivOS</p></div><Link href="/sales?tab=crm" className="text-xs font-medium">View all</Link></CardHeader><CardContent className="space-y-3">
        {loading && <RowSkeleton rows={3} />}
        {queue.length === 0 && !loading && <p className="py-6 text-center text-sm text-muted-foreground">Nothing is waiting. Add an opportunity or document to populate this queue.</p>}
        {queue.map(item => { const due = dueLabel(item.date); return <div key={item.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between gap-2"><div className="truncate text-xs text-muted-foreground">{item.context}</div><Badge tone={due.tone}>{due.text}</Badge></div>
          <div className="mt-2 text-sm font-medium">{item.title}</div>
        </div>; })}
      </CardContent></Card>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-3">
      <Card className="bg-white/75 lg:col-span-2"><CardHeader className="flex-row items-center justify-between"><CardTitle>Client pulse</CardTitle><Link href="/sales?tab=customers" className="text-xs font-medium">All customers</Link></CardHeader><CardContent className="grid gap-4 md:grid-cols-3">
        {clients.length === 0 && !loading && <p className="py-6 text-center text-sm text-muted-foreground md:col-span-3">No active customers yet. Create one in Sales.</p>}
        {clients.map(c => <Link key={c.id} href="/sales?tab=customers" className="rounded-xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between"><div className="truncate font-semibold">{c.name}</div><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" /></div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{c.industry || "Industry not set"}</div>
          <div className="mt-5 text-lg font-semibold">{money(c.value)}</div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, c.progress))}%` }} /></div>
          <div className="mt-3 truncate text-[11px] text-muted-foreground">Next: {c.next}</div>
        </Link>)}
      </CardContent></Card>
      <CashOutlook />
      <Card className="bg-white/75"><CardHeader><CardTitle>Quick create</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-2">{[
        [FileText, "Quotation", "/sales?tab=quotation"], [MessageSquareText, "Opportunity", "/sales?tab=crm"],
        [Clapperboard, "Funnel", "/funnels"], [Megaphone, "Brand DNA", "/brands"],
        [Building2, "Customer", "/sales?tab=customers"], [Workflow, "Automation", "/automations"]
      ].map(([Icon, label, href]: any) => <Link key={label} href={href} className="rounded-lg border bg-card p-3 text-left text-xs font-medium hover:bg-background"><Icon className="mb-3 h-4 w-4" />{label}</Link>)}</CardContent></Card>
    </div>
  </div>;
}
function Insight({ n, label, text, severity = "info" }: { n: string; label?: string; text: string; severity?: "info" | "watch" | "urgent" }) {
  const dot = severity === "urgent" ? "bg-red-400" : severity === "watch" ? "bg-amber-300" : "bg-white/25";
  return <div className="flex gap-3">
    <span className="text-accent-muted">{n}</span>
    <span className="min-w-0">
      {label && <span className="mr-2 inline-flex items-center gap-1.5 font-medium text-white"><span className={cn("h-1.5 w-1.5 rounded-full", dot)} />{label}</span>}
      {text}
    </span>
  </div>;
}

type BriefingInsight = { label: string; detail: string; severity: "info" | "watch" | "urgent" };

/** Loads the AI operations briefing, falling back to plain counts if it is unavailable. */
function useBriefing(data: BusinessSnapshot) {
  const [state, setState] = useState<{ headline: string; insights: BriefingInsight[]; note: string; loading: boolean }>({
    headline: "Reading the shared record…", insights: [], note: "", loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/briefing", { cache: "no-store" })
      .then(response => response.json().then(payload => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => {
        if (cancelled) return;
        if (!ok) throw new Error(payload.error || "Briefing unavailable.");
        setState({
          headline: payload.headline,
          insights: payload.insights || [],
          note: payload.source === "ai-nonymauz-cloud" ? "Generated by ai-nonymauz-cloud from live records." : "Derived directly from live records — AI is not configured.",
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          headline: "Every workspace writes to one shared PostgreSQL record set, so pipeline, delivery and cash always reconcile.",
          insights: [],
          note: "The briefing could not be generated.",
          loading: false,
        });
      });
    return () => { cancelled = true; };
  }, []);

  // Keep something meaningful on screen when the briefing itself is unavailable.
  const fallback: BriefingInsight[] = [
    { label: "Shared record", detail: `${data.customers.length} customers and ${data.contacts.length} contacts.`, severity: "info" },
    { label: "Settlements", detail: `${data.settlements.filter(item => item.status !== "Paid").length} still open for verification or payment.`, severity: "info" },
    { label: "Onboarding", detail: `${data.onboardings.filter(item => item.status !== "Completed").length} client onboardings in progress.`, severity: "info" },
  ];

  return { ...state, insights: state.insights.length ? state.insights : (state.loading ? [] : fallback) };
}

type ApprovalItem = {
  id: string; source: string; reference: string; title: string; context: string;
  value: string; tone: "amber" | "blue" | "neutral";
  approve: { label: string; body: Record<string, unknown>; endpoint: string };
  reject?: { label: string; body: Record<string, unknown>; endpoint: string };
};

function Approvals() {
  const { data, loading, error, reload } = useBusinessSnapshot();
  const [leave, setLeave] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");

  const loadHr = useCallback(async () => {
    try {
      const response = await fetch("/api/hr", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) return;
      setLeave(Array.isArray(payload.leaveRequests) ? payload.leaveRequests : []);
      setEmployees(Array.isArray(payload.employees) ? payload.employees : []);
    } catch {}
  }, []);

  useEffect(() => { void loadHr(); }, [loadHr]);

  const items = useMemo<ApprovalItem[]>(() => {
    const customerName = (id: string) => data.customers.find(item => item.id === id)?.name || "Unknown customer";
    const list: ApprovalItem[] = [];

    for (const doc of data.documents) {
      if (!["Draft", "Sent"].includes(doc.status)) continue;
      list.push({
        id: `doc-${doc.id}`, source: "Sales", reference: doc.reference || doc.type,
        title: doc.title, context: `${customerName(doc.customerId)} · ${doc.type}`,
        value: money(doc.value), tone: "amber",
        approve: { label: "Approve", endpoint: "/api/business", body: { operation: "update", resource: "sales", id: doc.id, data: { ...doc, status: "Approved" } } },
        reject: { label: "Reject", endpoint: "/api/business", body: { operation: "update", resource: "sales", id: doc.id, data: { ...doc, status: "Cancelled" } } },
      });
    }

    for (const item of data.settlements) {
      if (!["Draft", "Verified"].includes(item.status)) continue;
      const total = item.units * item.feePerUnit + item.adReimbursement + item.incentive;
      list.push({
        id: `set-${item.id}`, source: "Settlement", reference: `${item.periodStart} → ${item.periodEnd}`,
        title: item.status === "Draft" ? "Verify weekly settlement" : "Raise settlement invoice",
        context: customerName(item.customerId), value: money(total), tone: "blue",
        approve: { label: item.status === "Draft" ? "Verify" : "Create invoice", endpoint: "/api/business", body: { operation: "action", action: "advance-settlement", id: item.id } },
      });
    }

    for (const request of leave) {
      if (request.status !== "Pending") continue;
      const person = employees.find(item => item.id === request.employeeId)?.name || "Team member";
      list.push({
        id: `leave-${request.id}`, source: "HR", reference: `${request.startDate} → ${request.endDate}`,
        title: `${request.type} request`, context: person, value: `${request.days} days`, tone: "neutral",
        approve: { label: "Approve", endpoint: "/api/hr", body: { operation: "action", resource: "leave", id: request.id, action: "approve" } },
        reject: { label: "Reject", endpoint: "/api/hr", body: { operation: "action", resource: "leave", id: request.id, action: "reject" } },
      });
    }

    return list;
  }, [data, leave, employees]);

  async function decide(item: ApprovalItem, decision: NonNullable<ApprovalItem["approve"]>) {
    setBusy(item.id);
    setFailure("");
    try {
      const response = await fetch(decision.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(decision.body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The decision could not be saved.");
      setNotice(`${item.title} · ${decision.label.toLowerCase()}d.`);
      await Promise.all([reload(), loadHr()]);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "The decision could not be saved.");
    } finally {
      setBusy("");
    }
  }

  return <div>
    <PageHead eyebrow="Shared decision queue" title="Approvals" description="Every open decision across sales documents, weekly settlements and HR leave, in one queue. Approving here writes straight back to the shared record." action={<Button variant="outline" className="bg-card" onClick={() => { void reload(); void loadHr(); }} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />Refresh</Button>} />
    <DataNotice loading={loading} error={error} onRetry={reload} />
    {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}
    {failure && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{failure}</span><button onClick={() => setFailure("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}

    {!loading && items.length === 0 && <Empty title="Nothing is waiting for a decision" description="Draft or sent sales documents, unverified settlements and pending leave requests all appear here automatically." action={<Button asChild variant="outline" className="bg-card"><Link href="/sales?tab=sales">Open Sales</Link></Button>} />}

    <div className="space-y-3">{items.map(item => <Card key={item.id} className="bg-white/80"><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted"><ClipboardCheck className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground"><Badge tone={item.tone}>{item.source}</Badge><span className="truncate">{item.reference}</span></div>
        <div className="mt-1.5 font-medium">{item.title}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{item.context}</div>
      </div>
      <div className="font-semibold">{item.value}</div>
      <div className="flex gap-2">
        {item.reject && <Button variant="outline" disabled={busy === item.id} onClick={() => decide(item, item.reject!)}><X className="h-4 w-4" />{item.reject.label}</Button>}
        <Button disabled={busy === item.id} onClick={() => decide(item, item.approve)}>{busy === item.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{item.approve.label}</Button>
      </div>
    </CardContent></Card>)}</div>
  </div>;
}

/** Calls one of the AI generation routes and surfaces the loading and failure states. */
function useGenerator<T>(endpoint: string) {
  const [result, setResult] = useState<T | null>(null);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const generate = useCallback(async (input: Record<string, unknown>) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Generation failed.");
      setResult(payload as T);
      setSource(String(payload.source || ""));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  return { result, source, loading, error, generate };
}

function SourceNote({ source }: { source: string }) {
  if (!source) return null;
  return <div className="mt-3 text-[10px] text-muted-foreground">{source === "ai-nonymauz-cloud" ? "Generated by ai-nonymauz-cloud." : "AI is not configured, so KretivOS produced an editable starter you can refine."}</div>;
}

const inputClass = "h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent/10";

type MarketingPlan = { summary: string; sections: { title: string; body: string }[] };

function MarketingPlans() {
  const [form, setForm] = usePersisted("marketing-plan-input", { client: "", campaign: "", objective: "", audience: "", budget: "" });
  const { result, source, loading, error, generate } = useGenerator<MarketingPlan>("/api/marketing/generate");
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });

  return <div>
    <PageHead eyebrow="AI Marketing Studio" title="Marketing Plans" description="Describe the campaign once and generate the strategy, personas, channel plan, budget and reporting structure as an editable brief." action={<Button onClick={() => generate(form)} disabled={loading}>{loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{loading ? "Generating…" : "Generate plan with AI"}</Button>} />
    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <Card className="bg-white/80"><CardHeader><CardTitle>Campaign inputs</CardTitle></CardHeader><CardContent className="space-y-4">
        <label className="block text-xs font-medium">Client<input value={form.client} onChange={e => set("client", e.target.value)} className={cn(inputClass, "mt-2")} placeholder="Chef Ammar" /></label>
        <label className="block text-xs font-medium">Campaign<input value={form.campaign} onChange={e => set("campaign", e.target.value)} className={cn(inputClass, "mt-2")} placeholder="Pizza Mania August launch" /></label>
        <label className="block text-xs font-medium">Objective<input value={form.objective} onChange={e => set("objective", e.target.value)} className={cn(inputClass, "mt-2")} placeholder="Bring new customers into the restaurant" /></label>
        <label className="block text-xs font-medium">Audience<input value={form.audience} onChange={e => set("audience", e.target.value)} className={cn(inputClass, "mt-2")} placeholder="Subang and USJ residents" /></label>
        <label className="block text-xs font-medium">Media budget<input value={form.budget} onChange={e => set("budget", e.target.value)} className={cn(inputClass, "mt-2")} placeholder="RM2,000 Meta Ads" /></label>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <Button className="w-full" onClick={() => generate(form)} disabled={loading}>{loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Generate plan</Button>
        <SourceNote source={source} />
      </CardContent></Card>

      <Card className="bg-white/80"><CardHeader><CardTitle>{result ? form.campaign || "Generated marketing plan" : "Plan output"}</CardTitle></CardHeader><CardContent>
        {!result && <p className="py-10 text-center text-sm text-muted-foreground">Fill in the campaign inputs and generate a plan. Every section is written for the supplied client, audience and budget.</p>}
        {result && <div className="space-y-3">
          <div className="rounded-xl border bg-background p-4 text-sm leading-relaxed">{result.summary}</div>
          {result.sections?.map((section, index) => <div key={section.title} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px]">{index + 1}</span><div className="text-sm font-semibold">{section.title}</div></div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{section.body}</p>
          </div>)}
        </div>}
      </CardContent></Card>
    </div>
  </div>;
}

type MarketingStudioTab = "writer" | "strategy" | "content" | "storyboard";

function MarketingStudio() {
  const [tab, setTab] = useState<MarketingStudioTab>("writer");
  const tabs: { id: MarketingStudioTab; label: string }[] = [
    { id: "writer", label: "Content Writer" },
    { id: "content", label: "Planner" },
    { id: "strategy", label: "Strategy" },
    { id: "storyboard", label: "Storyboard" },
  ];

  return <div>
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><div className="text-[10px] font-semibold uppercase tracking-[.2em] text-accent">Creative operations</div><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Marketing Studio keeps strategy, content, storyboards and funnel handoff together without duplicating the underlying workspaces.</p></div><Button asChild variant="outline" className="w-fit bg-card"><Link href="/funnels"><Clapperboard className="h-4 w-4" />Open Funnel Builder</Link></Button></div>
    <div className="mb-6 flex flex-wrap gap-2 rounded-xl border bg-white/75 p-1.5">
      {tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={cn("min-h-10 rounded-lg px-4 text-sm font-medium transition", tab === item.id ? "bg-foreground text-white" : "text-muted-foreground hover:bg-background")}>{item.label}</button>)}
    </div>
    {tab === "writer" && <ContentWriter onOpenPlanner={() => setTab("content")} />}
    {tab === "strategy" && <MarketingPlans />}
    {tab === "content" && <ContentPlanner />}
    {tab === "storyboard" && <StoryboardStudio />}
  </div>;
}

type PlannerSlot = { id?: string; title: string; status: string; channel: string; notes: string; customerId: string };

function ContentPlanner() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const start = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }, []);
  const { data: business } = useBusinessSnapshot();
  const [slots, setSlots] = useState<Record<string, PlannerSlot>>({});
  const [shared, setShared] = useState(true);
  const [loading, setLoading] = useState(true);
  const { error: toastError } = useToast();
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return localDate(date);
    }),
    [start],
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/planner?from=${weekDates[0]}&to=${weekDates[6]}`, { cache: "no-store" })
      .then(response => response.json().then(payload => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => {
        if (cancelled) return;
        if (!ok) { setShared(false); return; }
        const next: Record<string, PlannerSlot> = {};
        for (const entry of payload.entries || []) next[entry.date] = {
          id: entry.id,
          title: entry.title,
          status: entry.status,
          channel: entry.channel || "",
          notes: entry.notes || "",
          customerId: entry.customerId || "",
        };
        setSlots(next);
      })
      .catch(() => { if (!cancelled) setShared(false); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [weekDates]);

  // Clear pending debounces on unmount so a save cannot fire into a dead view.
  useEffect(() => {
    const timers = saveTimers.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  const persist = useCallback(async (date: string, slot: PlannerSlot | null) => {
    if (!shared) return;
    try {
      const response = await fetch("/api/planner", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          title: slot?.title ?? "",
          status: slot?.status ?? "Planned",
          channel: slot?.channel ?? "",
          notes: slot?.notes ?? "",
          customerId: slot?.customerId ?? "",
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Unable to save the plan.");
    } catch (cause) {
      toastError(cause instanceof Error ? cause.message : "Unable to save the plan.");
    }
  }, [shared, toastError]);

  // Typing updates the grid immediately; the write is debounced so a sentence
  // is one request rather than one per keystroke.
  const update = (key: string, title: string) => {
    setSlots(current => {
      const next = { ...current };
      if (title.trim()) next[key] = {
        id: next[key]?.id,
        title,
        status: next[key]?.status || "Planned",
        channel: next[key]?.channel || "",
        notes: next[key]?.notes || "",
        customerId: next[key]?.customerId || "",
      };
      else delete next[key];
      clearTimeout(saveTimers.current[key]);
      saveTimers.current[key] = setTimeout(() => void persist(key, next[key] ?? null), 600);
      return next;
    });
  };

  const cycle = (key: string) => {
    const order = ["Planned", "Review", "Approved"];
    setSlots(current => {
      const slot = current[key];
      if (!slot) return current;
      const next = { ...slot, status: order[(order.indexOf(slot.status) + 1) % order.length] };
      void persist(key, next);
      return { ...current, [key]: next };
    });
  };

  return <div>
    <PageHead eyebrow="Publishing workflow" title="Content Planner" description="Plan the week, then move each piece from planned to review to approved. The calendar is shared with the whole team." />
    {!loading && !shared && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      This plan is not being shared with the team. Apply <code className="rounded bg-white/70 px-1">db/migrations/0007_shared_planner_projection.sql</code> to the Neon database.
    </div>}
    <Card className="overflow-hidden bg-white/80"><div className="grid grid-cols-1 divide-y md:min-w-[900px] md:grid-cols-7 md:divide-x md:divide-y-0">{days.map((day, index) => {
      const date = new Date(start); date.setDate(start.getDate() + index);
      const key = localDate(date);
      const slot = slots[key];
      const isToday = key === localDate(new Date());
      const customerName = slot?.customerId ? business.customers.find((item) => item.id === slot.customerId)?.name : "";
      return <div key={key} className="min-h-[170px] md:min-h-[460px]">
        <div className={cn("border-b p-3 text-xs font-semibold", isToday ? "bg-foreground text-white" : "bg-background")}>{day} {date.getDate()}</div>
        <div className="space-y-2 p-3">
          <textarea value={slot?.title || ""} onChange={e => update(key, e.target.value)} placeholder="Add content…" className="min-h-24 w-full resize-none rounded-lg border bg-card p-3 text-sm outline-none focus:border-accent" />
          {slot && (slot.channel || customerName) && <div className="flex flex-wrap gap-1.5">{slot.channel && <span className="rounded-full bg-muted px-2 py-1 text-[9px] font-medium">{slot.channel}</span>}{customerName && <span className="rounded-full border bg-card px-2 py-1 text-[9px] text-muted-foreground">{customerName}</span>}</div>}
          {slot?.notes && <div className="max-h-32 overflow-hidden whitespace-pre-wrap rounded-lg border bg-card p-2.5 text-[10px] leading-5 text-muted-foreground" title={slot.notes}>{slot.notes}</div>}
          {slot && <button onClick={() => cycle(key)} className="w-full"><Badge tone={slot.status === "Approved" ? "green" : slot.status === "Review" ? "amber" : "neutral"}>{slot.status}</Badge></button>}
        </div>
      </div>;
    })}</div></Card>
  </div>;
}

type Storyboard = { summary: string; scenes: { shot: string; visual: string; audio: string; duration: string; camera: string }[] };

function StoryboardStudio() {
  const [form, setForm] = usePersisted("storyboard-input", { client: "", concept: "", product: "", duration: "20", ratio: "9:16" });
  const { result, source, loading, error, generate } = useGenerator<Storyboard>("/api/storyboard/generate");
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });

  return <div>
    <PageHead eyebrow="Video production" title="Storyboard Studio" description="Turn a campaign idea into scenes, shot list, timing, audio direction and camera notes." action={<div className="flex gap-2"><Button variant="outline" className="bg-card" onClick={() => window.print()}><Presentation className="h-4 w-4" />Present</Button><Button onClick={() => generate(form)} disabled={loading}>{loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{loading ? "Generating…" : "Generate scenes"}</Button></div>} />
    <Card className="mb-5 bg-white/80"><CardContent className="grid gap-4 p-5 md:grid-cols-3 xl:grid-cols-5">
      <label className="block text-xs font-medium">Client<input value={form.client} onChange={e => set("client", e.target.value)} className={cn(inputClass, "mt-2")} placeholder="Chef Ammar" /></label>
      <label className="block text-xs font-medium">Concept<input value={form.concept} onChange={e => set("concept", e.target.value)} className={cn(inputClass, "mt-2")} placeholder="Wagyu pizza launch trailer" /></label>
      <label className="block text-xs font-medium">Product<input value={form.product} onChange={e => set("product", e.target.value)} className={cn(inputClass, "mt-2")} placeholder="Wagyu Pizza" /></label>
      <label className="block text-xs font-medium">Duration (sec)<input type="number" value={form.duration} onChange={e => set("duration", e.target.value)} className={cn(inputClass, "mt-2")} /></label>
      <label className="block text-xs font-medium">Aspect ratio<select value={form.ratio} onChange={e => set("ratio", e.target.value)} className={cn(inputClass, "mt-2")}>{["9:16", "1:1", "4:5", "16:9"].map(x => <option key={x}>{x}</option>)}</select></label>
    </CardContent></Card>
    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    {!result && <Empty title="No storyboard yet" description="Describe the concept above and generate a shot-by-shot scene breakdown." action={<Button onClick={() => generate(form)} disabled={loading}><Sparkles className="h-4 w-4" />Generate scenes</Button>} />}
    {result && <div className="space-y-3">
      <div className="rounded-xl border bg-white/80 p-4 text-sm leading-relaxed">{result.summary}<SourceNote source={source} /></div>
      {result.scenes?.map((scene, index) => <Card key={index} className="bg-white/80"><CardContent className="grid gap-4 p-4 md:grid-cols-[60px_160px_1fr_100px_160px] md:items-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-white">{String(index + 1).padStart(2, "0")}</div>
        <div className="flex h-24 items-center justify-center rounded-lg bg-muted"><Film className="h-6 w-6 text-accent" /></div>
        <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{scene.shot}</div><div className="mt-2 text-sm font-medium">{scene.visual}</div><div className="mt-2 text-xs text-muted-foreground">Audio: {scene.audio}</div></div>
        <div><div className="text-[10px] text-muted-foreground">Duration</div><div className="mt-1 text-sm font-semibold">{scene.duration}</div></div>
        <div><div className="text-[10px] text-muted-foreground">Camera</div><div className="mt-1 text-sm font-medium">{scene.camera}</div></div>
      </CardContent></Card>)}
    </div>}
  </div>;
}

type PromptResult = { prompt: string; negativePrompt: string; notes: string; generationSettings?: string };
type PromptForm = {
  model: string; clientId: string; client: string; brand: string; assetType: string;
  product: string; platform: string; objective: string; brief: string; ratio: string;
  resolution: string; quality: string; composition: string; lighting: string;
  camera: string; style: string; audience: string; textInstruction: string;
  mustInclude: string; avoid: string; duration: string; motion: string;
  mjQuality: string; mjStylize: string; mjRaw: string; realismProfile: string;
};

const promptDefaults: PromptForm = {
  model: "GPT Image 2", clientId: "", client: "", brand: "", assetType: "Food photography",
  product: "", platform: "Instagram / Facebook", objective: "Create demand and drive action", brief: "", ratio: "2:3",
  resolution: "2K", quality: "High", composition: "", lighting: "", camera: "", style: "",
  audience: "", textInstruction: "No generated text unless explicitly requested", mustInclude: "", avoid: "",
  duration: "10 seconds", motion: "", mjQuality: "1", mjStylize: "100", mjRaw: "Yes", realismProfile: "Strict natural",
};
const imagePromptModels = ["GPT Image 2", "GPT Image", "Midjourney V8.2", "Midjourney", "FLUX.2", "Flux"];
const imageAssets = ["Food photography", "Product hero", "Editorial campaign", "Poster / key visual", "Social post", "Packaging concept"];
const videoAssets = ["Product trailer", "Social reel", "Brand film", "Product demo", "Motion ad"];

const imageSizes: Record<string, Record<string, string>> = {
  "1:1": { HD: "1024x1024", "2K": "2048x2048", "4K delivery": "2880x2880" },
  "2:3": { HD: "1024x1536", "2K": "1344x2016", "4K delivery": "2336x3504" },
  "3:2": { HD: "1536x1024", "2K": "2016x1344", "4K delivery": "3504x2336" },
  "4:5": { HD: "1024x1280", "2K": "1536x1920", "4K delivery": "2560x3200" },
  "5:4": { HD: "1280x1024", "2K": "1920x1536", "4K delivery": "3200x2560" },
  "9:16": { HD: "864x1536", "2K": "1152x2048", "4K delivery": "2160x3840" },
  "16:9": { HD: "1536x864", "2K": "2048x1152", "4K delivery": "3840x2160" },
};

function imageOutputTarget(model: string, ratio: string, resolution: string) {
  if (resolution === "Auto") return "automatic size selected by the target model";
  const pixels = imageSizes[ratio]?.[resolution] || `${resolution} at ${ratio}`;
  if (model.startsWith("Midjourney")) return `${pixels} delivery target using the appropriate Midjourney upscale/export workflow`;
  if (model.startsWith("FLUX") || model === "Flux") return `${pixels} target using the closest supported FLUX aspect ratio and pixel limit`;
  return pixels;
}

function PromptWritingControl({ label, value, onChange, context, placeholder = "", multiline = true, className = "" }: { label: string; value: string; onChange: (value: string) => void; context: string; placeholder?: string; multiline?: boolean; className?: string }) {
  return <div>
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{label}</span><AIWritingButton value={value} field={label} context={context} onApply={onChange} /></div>
    {multiline
      ? <textarea value={value} onChange={event => onChange(event.target.value)} className={cn("mt-2 min-h-20 w-full resize-y rounded-lg border bg-card p-3 text-sm leading-6 outline-none focus:border-accent focus:ring-4 focus:ring-accent/10", className)} placeholder={placeholder} />
      : <input value={value} onChange={event => onChange(event.target.value)} className={cn(inputClass, "mt-2", className)} placeholder={placeholder} />}
  </div>;
}

function PromptLab() {
  const [savedForm, setSavedForm] = usePersisted<PromptForm>("prompt-lab-input", promptDefaults);
  const legacyModel = savedForm.model === "GPT Image" ? "GPT Image 2" : savedForm.model === "Midjourney" ? "Midjourney V8.2" : savedForm.model === "Flux" ? "FLUX.2" : savedForm.model;
  const mergedForm = { ...promptDefaults, ...savedForm, model: legacyModel || promptDefaults.model };
  const mergedIsImage = imagePromptModels.includes(mergedForm.model);
  const form = {
    ...mergedForm,
    quality: mergedForm.quality === "Maximum detail" ? "High" : mergedForm.quality,
    assetType: (mergedIsImage ? imageAssets : videoAssets).includes(mergedForm.assetType)
      ? mergedForm.assetType
      : (mergedIsImage ? imageAssets[0] : videoAssets[0]),
  };
  const { data: business } = useBusinessSnapshot();
  const { result, source, loading, error, generate } = useGenerator<PromptResult>("/api/prompt/generate");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftNegative, setDraftNegative] = useState("");
  const [copied, setCopied] = useState<"prompt" | "full" | "">("");
  const isImage = imagePromptModels.includes(form.model);
  const assets = isImage ? imageAssets : videoAssets;
  const linkedBrands = business.brands.filter((item) => !form.clientId || item.customerId === form.clientId);
  const set = (key: keyof PromptForm, value: string) => setSavedForm({ ...form, [key]: value });
  const outputTarget = isImage ? imageOutputTarget(form.model, form.ratio, form.resolution) : form.resolution;
  const writingContext = `${form.model} ${form.assetType}; client: ${form.client || "not selected"}; brand: ${form.brand || "not selected"}; product: ${form.product || "not specified"}; platform: ${form.platform}.`;
  const required = [form.model, form.client, form.assetType, form.product || form.brief, form.ratio, form.objective];
  const completeness = Math.round(required.filter((value) => String(value || "").trim()).length / required.length * 100);

  useEffect(() => {
    if (!result) return;
    setDraftPrompt(result.prompt);
    setDraftNegative(result.negativePrompt || "");
    if (window.innerWidth < 1280) setTimeout(() => document.getElementById("prompt-output")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }, [result]);

  const chooseModel = (model: string) => {
    const nextIsImage = imagePromptModels.includes(model);
    const nextAssets = nextIsImage ? imageAssets : videoAssets;
    setSavedForm({ ...form, model, assetType: nextAssets.includes(form.assetType) ? form.assetType : nextAssets[0], ratio: nextIsImage && form.ratio === "9:16" ? "2:3" : form.ratio });
  };

  const chooseClient = (clientId: string) => {
    const client = business.customers.find((item) => item.id === clientId);
    setSavedForm({ ...form, clientId, client: client?.name || "", brand: "" });
  };

  const applyPreset = (preset: "food" | "product" | "poster") => {
    const presets = {
      food: {
        model: "GPT Image 2", assetType: "Food photography", ratio: "2:3", platform: "Menu / Instagram",
        objective: "Create an appetising premium food visual", resolution: "2K", quality: "High",
        composition: "Slightly zoomed-out portrait composition with generous negative space and a clear food hero",
        lighting: "Bright soft diffused studio light with a subtle natural shadow",
        camera: "50mm lens, three-quarter food photography angle, believable depth of field",
        style: "A real editorial food photograph with true-to-life texture, natural irregularity and restrained retouching",
        realismProfile: "Strict natural",
        textInstruction: "No text, logo or label unless supplied as an exact reference",
        avoid: "plastic-looking food, uniform synthetic grains, waxy texture, impossible garnish, warped plate, excessive gloss, oversaturation, watermark",
      },
      product: {
        model: "GPT Image 2", assetType: "Product hero", ratio: "4:5", platform: "Instagram / Marketplace",
        objective: "Present the product clearly and increase purchase intent", resolution: "2K", quality: "High",
        composition: "Single hero product with clean separation, balanced props and usable negative space",
        lighting: "Controlled commercial studio lighting with realistic reflections and contact shadow",
        camera: "70mm product photography perspective with accurate proportions and crisp focal detail",
        style: "A real commercial product photograph with believable packaging materials, restrained retouching and accurate brand colours",
        realismProfile: "Strict natural",
        textInstruction: "Preserve existing packaging text exactly; do not invent or rewrite labels",
        avoid: "warped packaging, invented label text, floating product, excessive gloss, distorted proportions, watermark",
      },
      poster: {
        model: "Midjourney V8.2", assetType: "Poster / key visual", ratio: "2:3", platform: "Print / Campaign",
        objective: "Create a strong campaign key visual with room for final artwork", resolution: "4K delivery", quality: "High",
        composition: "Editorial poster composition with one dominant focal point and intentional clear space for copy",
        lighting: "Cinematic directional light with controlled contrast and realistic shadow behaviour",
        camera: "Commercial campaign photography, natural perspective, precise subject separation",
        style: "Distinctive premium campaign art direction with realistic materials and restrained colour grading",
        realismProfile: "Balanced commercial",
        textInstruction: "Leave clean negative space for typography; do not generate final text",
        avoid: "watermark, artifacts, warping, clutter, oversaturation",
      },
    } as const;
    setSavedForm({ ...form, ...presets[preset] });
  };

  const runGenerate = () => generate({ ...form, resolution: outputTarget, resolutionMode: form.resolution });
  const copyText = async (mode: "prompt" | "full") => {
    if (!draftPrompt) return;
    const text = mode === "prompt" ? draftPrompt : [draftPrompt, draftNegative && `Negative prompt: ${draftNegative}`, result?.generationSettings].filter(Boolean).join("\n\n");
    try { await navigator.clipboard.writeText(text); setCopied(mode); setTimeout(() => setCopied(""), 2000); } catch {}
  };
  const openImageStudio = () => {
    if (!draftPrompt) return;
    localStorage.setItem("kretivos-ai-studio-image-prompt", draftPrompt);
    window.location.assign("/ai-studio?mode=image");
  };

  return <div>
    <PageHead eyebrow="Production-ready visual prompts" title="Prompt Lab" description="Build model-specific prompts with correct output settings and an enforced anti-slop realism layer for believable food, products and campaign visuals." action={<Button className="hidden sm:inline-flex" onClick={runGenerate} disabled={loading || (!form.brief.trim() && !form.product.trim())}>{loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}{loading ? "Generating…" : "Generate prompt"}</Button>} />
    <div className="grid gap-5 xl:grid-cols-[minmax(340px,.72fr)_minmax(0,1.28fr)]">
      <Card className="overflow-hidden bg-white/85">
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b p-4 sm:p-5"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-accent">01 · Production brief</div><CardTitle className="mt-1">Image direction</CardTitle></div><div className="text-right"><div className="text-lg font-semibold">{completeness}%</div><div className="text-[9px] text-muted-foreground">brief ready</div></div></CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div><div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick setup</div><div className="flex flex-wrap gap-2"><button onClick={() => applyPreset("food")} className="rounded-lg border bg-card px-3 py-2 text-xs hover:border-accent">Real food photo</button><button onClick={() => applyPreset("product")} className="rounded-lg border bg-card px-3 py-2 text-xs hover:border-accent">Product hero</button><button onClick={() => applyPreset("poster")} className="rounded-lg border bg-card px-3 py-2 text-xs hover:border-accent">Campaign poster</button></div></div>

          <label className="block text-xs font-medium">Target model<select value={form.model} onChange={e => chooseModel(e.target.value)} className={cn(inputClass, "mt-2")}><optgroup label="Image">{["GPT Image 2", "Midjourney V8.2", "FLUX.2"].map(x => <option key={x}>{x}</option>)}</optgroup><optgroup label="Video">{["Kling", "Veo", "Runway"].map(x => <option key={x}>{x}</option>)}</optgroup></select><span className="mt-1.5 block text-[10px] font-normal text-muted-foreground">{isImage ? "Image prompt · ratio and output settings included" : "Video prompt · motion and duration included"}</span></label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium">Client<select value={form.clientId} onChange={e => chooseClient(e.target.value)} className={cn(inputClass, "mt-2")}><option value="">Custom client</option>{business.customers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="block text-xs font-medium">Brand<select value={form.brand} onChange={e => set("brand", e.target.value)} className={cn(inputClass, "mt-2")}><option value="">No brand selected</option>{linkedBrands.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
          </div>
          {!form.clientId && <label className="block text-xs font-medium">Client name<input value={form.client} onChange={e => set("client", e.target.value)} className={cn(inputClass, "mt-2")} placeholder="Chef Ammar" /></label>}

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium">Asset type<select value={form.assetType} onChange={e => set("assetType", e.target.value)} className={cn(inputClass, "mt-2")}>{assets.map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="block text-xs font-medium">Platform<select value={form.platform} onChange={e => set("platform", e.target.value)} className={cn(inputClass, "mt-2")}>{["Instagram / Facebook", "TikTok", "Marketplace", "Website", "Menu / Print", "Campaign / OOH"].map(x => <option key={x}>{x}</option>)}</select></label>
          </div>

          <label className="block text-xs font-medium">Product / main subject<input value={form.product} onChange={e => set("product", e.target.value)} className={cn(inputClass, "mt-2")} placeholder="Pes Kabsah jar with plated rice" /></label>
          <PromptWritingControl label="Creative request" value={form.brief} onChange={value => set("brief", value)} context={writingContext} className="min-h-24" placeholder="Describe what should happen or appear. A short idea is enough; AI can improve the writing without changing the facts." />

          <div className="grid grid-cols-3 gap-2">
            <label className="block text-xs font-medium">Aspect<select value={form.ratio} onChange={e => set("ratio", e.target.value)} className={cn(inputClass, "mt-2 px-2")}>{["2:3", "3:2", "4:5", "5:4", "1:1", "9:16", "16:9"].map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="block text-xs font-medium">Resolution<select value={form.resolution} onChange={e => set("resolution", e.target.value)} className={cn(inputClass, "mt-2 px-2")}>{["Auto", "HD", "2K", "4K delivery"].map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="block text-xs font-medium">Quality<select value={form.quality} onChange={e => set("quality", e.target.value)} className={cn(inputClass, "mt-2 px-2")}>{["Draft", "Standard", "High"].map(x => <option key={x}>{x}</option>)}</select></label>
          </div>
          <div className="rounded-lg bg-background px-3 py-2 text-[10px] leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Output target:</span> {outputTarget}. Aspect ratio controls shape; resolution controls pixel delivery.</div>
          {isImage && <label className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-medium text-emerald-900"><span><span className="block">Anti-slop realism</span><span className="mt-1 block text-[9px] font-normal text-emerald-700">Always enforced · no hype-token prompting</span></span><select value={form.realismProfile} onChange={e => set("realismProfile", e.target.value)} className="h-9 max-w-[150px] rounded-lg border border-emerald-200 bg-card px-2 text-xs outline-none"><option>Strict natural</option><option>Balanced commercial</option></select></label>}

          <details className="group rounded-xl border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-semibold">Advanced image direction<span className="text-base font-normal text-muted-foreground group-open:rotate-45">+</span></summary>
            <div className="space-y-4 border-t p-4">
              <PromptWritingControl label="Objective" value={form.objective} onChange={value => set("objective", value)} context={writingContext} multiline={false} />
              <PromptWritingControl label="Audience" value={form.audience} onChange={value => set("audience", value)} context={writingContext} multiline={false} placeholder="Who should respond to this visual?" />
              <PromptWritingControl label="Composition" value={form.composition} onChange={value => set("composition", value)} context={writingContext} placeholder="Framing, angle, negative space, hierarchy…" />
              <PromptWritingControl label="Lighting" value={form.lighting} onChange={value => set("lighting", value)} context={writingContext} placeholder="Soft daylight, warm restaurant light, studio setup…" />
              <PromptWritingControl label="Camera / lens" value={form.camera} onChange={value => set("camera", value)} context={writingContext} multiline={false} placeholder="50mm, eye-level, believable depth of field…" />
              <PromptWritingControl label="Style and realism" value={form.style} onChange={value => set("style", value)} context={writingContext} placeholder="Editorial, true-to-life food texture, natural imperfection…" />
              <PromptWritingControl label="Text handling" value={form.textInstruction} onChange={value => set("textInstruction", value)} context={writingContext} multiline={false} />
              <PromptWritingControl label="Must include" value={form.mustInclude} onChange={value => set("mustInclude", value)} context={writingContext} multiline={false} placeholder="Exact product details, props, colours or logo treatment" />
              <PromptWritingControl label="Avoid" value={form.avoid} onChange={value => set("avoid", value)} context={writingContext} multiline={false} placeholder="Plastic texture, fake rice, warped label…" />
              {form.model.startsWith("Midjourney") && <div className="grid grid-cols-3 gap-2"><label className="block text-xs font-medium">Raw<select value={form.mjRaw} onChange={e => set("mjRaw", e.target.value)} className={cn(inputClass, "mt-2 px-2")}><option>Yes</option><option>No</option></select></label><label className="block text-xs font-medium">Quality<select value={form.mjQuality} onChange={e => set("mjQuality", e.target.value)} className={cn(inputClass, "mt-2 px-2")}>{["1", "2", "4"].map(x => <option key={x}>{x}</option>)}</select></label><label className="block text-xs font-medium">Stylize<select value={form.mjStylize} onChange={e => set("mjStylize", e.target.value)} className={cn(inputClass, "mt-2 px-2")}>{["0", "50", "100", "250", "500"].map(x => <option key={x}>{x}</option>)}</select></label><p className="col-span-3 text-[10px] leading-5 text-muted-foreground">Midjourney <code>--q</code> controls GPU effort, not pixel resolution.</p></div>}
              {!isImage && <><label className="block text-xs font-medium">Duration<input value={form.duration} onChange={e => set("duration", e.target.value)} className={cn(inputClass, "mt-2")} /></label><label className="block text-xs font-medium">Motion and camera movement<textarea value={form.motion} onChange={e => set("motion", e.target.value)} className="mt-2 min-h-20 w-full rounded-lg border bg-card p-3 text-sm" /></label></>}
            </div>
          </details>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          <Button className="w-full sm:hidden" onClick={runGenerate} disabled={loading || (!form.brief.trim() && !form.product.trim())}>{loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}{loading ? "Building prompt…" : "Build production prompt"}</Button>
          <SourceNote source={source} />
        </CardContent>
      </Card>

      <Card id="prompt-output" className="scroll-mt-24 overflow-hidden bg-foreground text-white">
        <CardHeader className="flex-row items-start justify-between space-y-0 border-b border-white/10 p-4 sm:p-5"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-accent-muted">02 · Generated output</div><CardTitle className="mt-1">{form.model} prompt</CardTitle></div>{result && <Badge tone="green">Ready</Badge>}</CardHeader>
        <CardContent className="p-4 sm:p-5">
          {result ? <>
            <textarea value={draftPrompt} onChange={e => setDraftPrompt(e.target.value)} className="min-h-[280px] w-full resize-y rounded-xl border border-white/10 bg-black/10 p-4 font-mono text-xs leading-7 text-white/80 outline-none focus:border-white/25 sm:min-h-[360px]" />
            <div className="mt-2 text-right text-[9px] text-white/35">{draftPrompt.length.toLocaleString()} characters · editable</div>
            {result.generationSettings && <div className="mt-3 rounded-xl border border-accent-muted/25 bg-accent-muted/10 p-4 text-xs leading-6 text-accent-faint"><div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-accent-muted">Generation settings</div>{result.generationSettings}</div>}
            {draftNegative && <div className="mt-3"><div className="mb-2 text-[10px] uppercase tracking-wider text-white/40">Negative prompt</div><textarea value={draftNegative} onChange={e => setDraftNegative(e.target.value)} className="min-h-24 w-full resize-y rounded-xl border border-white/10 bg-black/10 p-4 font-mono text-xs leading-6 text-white/55 outline-none" /></div>}
            {result.notes && <div className="mt-3 text-xs leading-relaxed text-white/55">{result.notes}</div>}
            <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => copyText("prompt")}>{copied === "prompt" && <Check className="h-4 w-4" />}{copied === "prompt" ? "Copied" : "Copy prompt"}</Button><Button variant="outline" className="border-white/15 text-white hover:bg-white/10" onClick={() => copyText("full")}>{copied === "full" && <Check className="h-4 w-4" />}{copied === "full" ? "Copied all" : "Copy with settings"}</Button>{isImage && <Button className="bg-accent-muted text-foreground hover:bg-accent-muted" onClick={openImageStudio}>Open in Image Studio<ArrowRight className="h-4 w-4" /></Button>}</div>
          </> : <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-white/15 p-8 text-center"><WandSparkles className="h-7 w-7 text-accent-muted" /><div className="mt-4 font-semibold">No production prompt yet</div><p className="mt-2 max-w-sm text-xs leading-6 text-white/45">Start with a preset, add the product or idea, then generate. KretivOS will structure subject, composition, lighting, realism, exclusions and the correct model syntax.</p></div>}
        </CardContent>
      </Card>
    </div>
  </div>;
}

function Technology() {
  const systems = [
    { n: "KretivOS PWA", stack: "Next.js · PWA · ai-nonymauz-cloud", status: "Build", env: "Neon PostgreSQL" },
    { n: "Chef Ammar Marketplace", stack: "Next.js · CHIP · Cloudflare", status: "Setup", env: "Staging" },
    { n: "Restu.ai", stack: "Next.js · RAG · PostgreSQL", status: "Healthy", env: "Production" },
    { n: "Social Agent", stack: "Python · Gemini · Threads API", status: "Healthy", env: "Ubuntu VM" }
  ];
  const [health, setHealth] = useState<{ ok: boolean; label: string }>({ ok: false, label: "Checking database…" });

  useEffect(() => {
    fetch("/api/db/health", { cache: "no-store" })
      .then(response => response.json().then(payload => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => setHealth({ ok, label: ok ? `Connected · ${payload.database || "Neon"}` : payload.error || "Database unreachable" }))
      .catch(() => setHealth({ ok: false, label: "Database unreachable" }));
  }, []);

  return <div>
    <PageHead eyebrow="CTO workspace" title="Technology" description="Repositories, environments, deployments, infrastructure and AI services across every product. The registry below is a static inventory pending a systems table." action={<Button asChild variant="outline" className="bg-card"><Link href="/automations"><Workflow className="h-4 w-4" />Automations</Link></Button>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Registered systems" value={String(systems.length)} note="Static inventory" icon={Cloud} />
      <Stat label="Shared database" value={health.ok ? "Online" : "Attention"} note={health.label} icon={Database} />
      <Stat label="Repositories" value="14" note="3 active releases" icon={GitBranch} />
      <Stat label="Open incidents" value="2" note="1 high priority" icon={Activity} />
    </div>
    <div className="mt-5 grid gap-4 md:grid-cols-2">{systems.map(x => <Card key={x.n} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Code2 className="h-5 w-5" /></div><Badge tone={x.status === "Healthy" ? "green" : "amber"}>{x.status}</Badge></div><div className="mt-4 font-semibold">{x.n}</div><div className="mt-1 text-xs text-muted-foreground">{x.stack}</div><div className="mt-5 border-t pt-4 text-xs">{x.env}</div></CardContent></Card>)}</div>
  </div>;
}

function Settings() {
  const cards: [any, string, string, string][] = [
    [Building2, "Company profile", "Kretivco Mediaworks, registration, address and signatories", "/sales?tab=customers"],
    [FileText, "Documents", "AI-assisted proposals, quotations, invoices, memos and agreements", "/documents"],
    [UsersRound, "HRMS", "People, attendance, leave, onboarding, performance and learning", "/hr"],
    [Palette, "Brand DNA", "Colours, typography, tone and approved claims per brand", "/brands"],
    [Workflow, "Automations", "Triggers, actions and approval thresholds", "/automations"],
    [Library, "Knowledge library", "Agreements, SOPs, campaign learnings and technical decisions", "/knowledge"],
    [Code2, "Technology", "Systems, deployments, infrastructure and shared service health", "/?view=Technology"],
  ];
  return <div>
    <PageHead eyebrow="Configuration" title="Settings" description="KretivOS keeps configuration inside the workspace that owns it, so each area below opens the record it configures." />
    <div className="grid gap-5 lg:grid-cols-2">{cards.map(([Icon, title, description, href]) => <Link key={title} href={href}><Card className="h-full bg-white/80 transition hover:-translate-y-0.5 hover:shadow-md"><CardContent className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="font-semibold">{title}</div><div className="mt-1 text-xs text-muted-foreground">{description}</div></div><ChevronRight className="h-4 w-4 shrink-0" /></CardContent></Card></Link>)}</div>
    <Card className="mt-5 bg-white/80"><CardHeader><CardTitle>AI and offline</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4" />ai-nonymauz-cloud</div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Connected server-side to the deployed Render service. <code className="rounded bg-muted px-1">AI_NONYMAUZ_BASE_URL</code>, <code className="rounded bg-muted px-1">AI_NONYMAUZ_API_KEY</code> and <code className="rounded bg-muted px-1">AI_NONYMAUZ_MODEL</code> remain optional deployment overrides; the browser never receives them.</p></div>
      <div className="rounded-lg border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><MonitorSmartphone className="h-4 w-4" />PWA and offline</div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">The app shell is cached for offline launch. Business records are always fetched live so shared data is never served stale.</p></div>
    </CardContent></Card>
  </div>;
}

/**
 * The daily cash question, on the page everyone opens first.
 *
 * Codex suggested keeping Finance as a read-only "Cash Outlook" beside
 * Accounting. The operational need is real — "what have we got, what is due" is
 * asked far more often than "show me the trial balance" — but a second
 * money menu is what made people unsure where to record things in the first
 * place. So the view lives here, and the records live in one place.
 */
function CashOutlook() {
  const [data, setData] = useState<{ cash: number; receivable: { total: number }; payable: { total: number } } | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounting/reports", { cache: "no-store" })
      .then(response => response.json().then(payload => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => { if (!cancelled && ok) setData(payload); else if (!cancelled) setUnavailable(true); })
      .catch(() => { if (!cancelled) setUnavailable(true); });
    return () => { cancelled = true; };
  }, []);

  if (unavailable) return null;

  const rows: [string, number, string][] = data
    ? [
      ["Cash at bank", data.cash, "text-foreground"],
      ["Owed to us", data.receivable.total, "text-emerald-700"],
      ["Owed by us", -data.payable.total, "text-red-600"],
    ]
    : [];

  return <Card className="bg-white/75">
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle>Cash outlook</CardTitle>
      <Link href="/accounting" className="text-xs font-medium">Accounting</Link>
    </CardHeader>
    <CardContent className="space-y-3">
      {!data && <RowSkeleton rows={3} />}
      {rows.map(([label, value, tone]) => <div key={label} className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn("text-sm font-semibold tabular-nums", tone)}>{money(value)}</span>
      </div>)}
      {data && <div className="border-t pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-medium">Net position</span>
          <span className="text-lg font-semibold tabular-nums">{money(data.cash + data.receivable.total - data.payable.total)}</span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          Read from the ledger. Record money in Accounting so this and the reports always agree.
        </p>
      </div>}
    </CardContent>
  </Card>;
}

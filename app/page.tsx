"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, BarChart3, Bell, Bot, Building2, CalendarDays, Check,
  ChevronRight, CircleDollarSign, Clapperboard, ClipboardCheck, Cloud, Code2,
  Contact, Database, FileCheck2, FileText, Film, FolderKanban, GitBranch,
  HandCoins, LayoutDashboard, Library, Megaphone, Menu, MessageSquareText,
  MonitorSmartphone, MoreHorizontal, Palette, PanelLeftClose, PanelLeftOpen,
  Plus, Presentation, Receipt, RefreshCw, Rocket, Search, Send, Settings2,
  Sparkles, Target, TrendingUp, UsersRound, WandSparkles, Workflow, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Views rendered inside this shell. Every workspace that owns database-backed
 * records lives on its own route instead, and is reached through `href` below.
 */
type View =
  | "Command Centre" | "Financial Projection" | "Approvals" | "Marketing Plans"
  | "Content Planner" | "Storyboard Studio" | "Prompt Lab" | "Technology" | "Settings";

type NavItem = { name: string; icon: any; view?: View; href?: string };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  { label: "Company", items: [
    { name: "Command Centre", icon: LayoutDashboard, view: "Command Centre" },
    { name: "Client Workspaces", icon: Building2, href: "/business?tab=customers" },
    { name: "Customer Onboarding", icon: Rocket, href: "/business?tab=onboarding" },
    { name: "HR & Team", icon: UsersRound, href: "/hr" },
    { name: "Approvals", icon: ClipboardCheck, view: "Approvals" },
  ]},
  { label: "Business", items: [
    { name: "CRM & Pipeline", icon: Contact, href: "/business?tab=crm" },
    { name: "AI Proposal Package", icon: Sparkles, href: "/document-ai" },
    { name: "Sales & Documents", icon: FileCheck2, href: "/business?tab=sales" },
    { name: "Finance", icon: CircleDollarSign, href: "/business?tab=finance" },
    { name: "Weekly Settlement", icon: HandCoins, href: "/business?tab=settlements" },
    { name: "Financial Projection", icon: BarChart3, view: "Financial Projection" },
    { name: "Projects & Delivery", icon: FolderKanban, href: "/business?tab=projects" },
  ]},
  { label: "Creative Studio", items: [
    { name: "Kretiv AI Studio", icon: Bot, href: "/ai-studio" },
    { name: "Marketing Plans", icon: Megaphone, view: "Marketing Plans" },
    { name: "Funnel Builder", icon: Target, href: "/funnels" },
    { name: "Content Planner", icon: CalendarDays, view: "Content Planner" },
    { name: "Storyboard Studio", icon: Clapperboard, view: "Storyboard Studio" },
    { name: "Prompt Lab", icon: WandSparkles, view: "Prompt Lab" },
    { name: "Brand & Assets", icon: Palette, href: "/brands" },
  ]},
  { label: "Operations", items: [
    { name: "Technology", icon: Code2, view: "Technology" },
    { name: "Knowledge", icon: Library, href: "/knowledge" },
    { name: "Automations", icon: Workflow, href: "/automations" },
    { name: "Documents", icon: FileText, href: "/documents" },
    { name: "Settings", icon: Settings2, view: "Settings" },
  ]},
];

const views = navGroups.flatMap(group => group.items.map(item => item.view).filter(Boolean)) as View[];

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
  const [view, setView] = usePersisted<View>("kretivos-view", "Command Centre");
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

  // Views that moved onto their own routes may still be stored from an earlier visit.
  useEffect(() => { if (view && !views.includes(view)) setView("Command Centre"); }, [view, setView]);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  };

  const active = views.includes(view) ? view : "Command Centre";

  return <div className="min-h-screen bg-[#f4f1e8] text-[#202820]">
    <aside className={cn(
      "fixed inset-y-0 left-0 z-50 border-r border-white/10 bg-[#202c25] text-white transition-all duration-300",
      collapsed ? "w-[76px]" : "w-[264px]",
      mobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
    )}>
      <div className={cn("flex h-[76px] items-center border-b border-white/10", collapsed ? "justify-center px-2" : "justify-between px-5")}>
        <div className={cn(collapsed && "hidden")}>
          <div className="text-xl font-semibold tracking-tight">Kretiv<span className="text-[#ef7f5f]">OS</span></div>
          <div className="text-[9px] uppercase tracking-[.25em] text-white/40">Kretivco operating system</div>
        </div>
        {collapsed && <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ef7f5f] font-bold">K</div>}
        <button onClick={() => setMobile(false)} className="lg:hidden" aria-label="Close navigation"><X className="h-5 w-5" /></button>
      </div>
      <div className="h-[calc(100vh-156px)] overflow-y-auto px-3 py-4 scrollbar-thin">
        {navGroups.map(group => <div key={group.label} className="mb-5">
          {!collapsed && <div className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[.2em] text-white/30">{group.label}</div>}
          <div className="space-y-1">{group.items.map(item => {
            const Icon = item.icon;
            const isActive = item.view === active;
            const className = cn(
              "flex w-full items-center rounded-lg text-sm transition",
              collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
              isActive ? "bg-white text-[#202c25] shadow" : "text-white/62 hover:bg-white/8 hover:text-white"
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
      <div className="absolute bottom-0 flex h-20 w-full items-center border-t border-white/10 px-3">
        <button className={cn("flex w-full items-center rounded-lg p-2 hover:bg-white/5", collapsed ? "justify-center" : "gap-3")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ef7f5f] text-xs font-semibold">KT</div>
          {!collapsed && <><div className="min-w-0 text-left"><div className="truncate text-xs font-medium">Kretivco Team</div><div className="text-[10px] text-white/40">Shared internal workspace</div></div><MoreHorizontal className="ml-auto h-4 w-4" /></>}
        </button>
      </div>
    </aside>

    <main className={cn("min-h-screen transition-all duration-300", collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]")}>
      <header className="sticky top-0 z-40 flex h-[76px] items-center gap-3 border-b border-black/5 bg-[#f4f1e8]/92 px-4 backdrop-blur-xl md:px-7">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobile(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></Button>
        <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">{collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}</Button>
        <Link href="/knowledge" className="hidden h-10 max-w-lg flex-1 items-center gap-2 rounded-lg border bg-white/70 px-3 text-left text-sm text-muted-foreground shadow-sm md:flex"><Search className="h-4 w-4" />Search the Kretivco knowledge library…</Link>
        <div className="ml-auto flex items-center gap-2">
          {installPrompt && <Button variant="outline" className="hidden bg-white sm:inline-flex" onClick={install}><MonitorSmartphone className="h-4 w-4" />Install app</Button>}
          <Button variant="outline" size="icon" className="bg-white" aria-label="Notifications"><Bell className="h-4 w-4" /></Button>
          <Button onClick={() => setChat(true)}><Bot className="h-4 w-4" /><span className="hidden sm:inline">Ask Kretiv AI</span></Button>
        </div>
      </header>
      <div className="p-4 md:p-7 lg:p-8"><ViewRouter view={active} /></div>
    </main>
    {mobile && <div className="fixed inset-0 z-40 bg-black/45 lg:hidden" onClick={() => setMobile(false)} />}
    {chat && <AIChat onClose={() => setChat(false)} module={active} />}
  </div>;
}

function ViewRouter({ view }: { view: View }) {
  switch (view) {
    case "Command Centre": return <CommandCentre />;
    case "Financial Projection": return <FinancialProjection />;
    case "Approvals": return <Approvals />;
    case "Marketing Plans": return <MarketingPlans />;
    case "Content Planner": return <ContentPlanner />;
    case "Storyboard Studio": return <StoryboardStudio />;
    case "Prompt Lab": return <PromptLab />;
    case "Technology": return <Technology />;
    case "Settings": return <Settings />;
  }
}

function PageHead({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
    <div>{eyebrow && <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-[#ba5c42]">{eyebrow}</div>}<h1 className="text-3xl font-semibold tracking-tight md:text-[38px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p></div>{action}
  </div>;
}

function Stat({ label, value, note, icon: Icon }: any) { return <Card className="bg-white/75"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="text-xs text-muted-foreground">{label}</div>{Icon && <Icon className="h-4 w-4 text-[#ba5c42]" />}</div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div><div className="mt-2 text-xs text-muted-foreground">{note}</div></CardContent></Card>; }
function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "blue" }) { const tones = { neutral: "bg-[#eeeae0] text-[#5a605a]", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", blue: "bg-blue-50 text-blue-700" }; return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium", tones[tone])}>{children}</span>; }
function Empty({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) { return <Card className="bg-white/75"><CardContent className="p-12 text-center"><div className="font-semibold">{title}</div><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>{action && <div className="mt-4 flex justify-center">{action}</div>}</CardContent></Card>; }
function DataNotice({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (loading) return <div className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Loading shared records from Neon…</div>;
  if (error) return <div className="mb-4 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button variant="outline" size="sm" className="bg-white" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" />Retry</Button></div>;
  return null;
}

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
    <PageHead eyebrow={today} title={`${greeting}, Kretivco`} description="Everything requiring attention across clients, revenue, delivery, marketing and technology—drawn live from the shared Neon workspace." action={<div className="flex gap-2"><Button variant="outline" className="bg-white" onClick={reload} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />Sync</Button><Button asChild><Link href="/business?tab=sales"><Plus className="h-4 w-4" />New document</Link></Button></div>} />
    <DataNotice loading={loading} error={error} onRetry={reload} />

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Weighted pipeline" value={money(stats.pipeline)} note={`${stats.openCount} open opportunities`} icon={TrendingUp} />
      <Stat label="Active client workspaces" value={String(stats.activeClients)} note={`${data.projects.length} projects tracked`} icon={Building2} />
      <Stat label="Awaiting decision" value={String(stats.pendingApprovals)} note="Documents and settlements" icon={ClipboardCheck} />
      <Stat label="Receivables" value={money(stats.receivables)} note="Sent, approved and overdue invoices" icon={Receipt} />
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-[1.42fr_.8fr]">
      <Card className="overflow-hidden bg-[#26342b] text-white"><CardContent className="p-0"><div className="grid md:grid-cols-[1fr_240px]">
        <div className="p-6 md:p-7">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.2em] text-white/45"><Sparkles className="h-3.5 w-3.5 text-[#ef9a75]" />Company intelligence{briefing.loading && <RefreshCw className="h-3 w-3 animate-spin" />}</div>
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

      <Card className="bg-white/75"><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Today’s queue</CardTitle><p className="mt-1 text-xs text-muted-foreground">Soonest deadlines across KretivOS</p></div><Link href="/business?tab=crm" className="text-xs font-medium">View all</Link></CardHeader><CardContent className="space-y-3">
        {queue.length === 0 && !loading && <p className="py-6 text-center text-sm text-muted-foreground">Nothing is waiting. Add an opportunity or document to populate this queue.</p>}
        {queue.map(item => { const due = dueLabel(item.date); return <div key={item.id} className="rounded-lg border bg-white p-3">
          <div className="flex items-center justify-between gap-2"><div className="truncate text-xs text-muted-foreground">{item.context}</div><Badge tone={due.tone}>{due.text}</Badge></div>
          <div className="mt-2 text-sm font-medium">{item.title}</div>
        </div>; })}
      </CardContent></Card>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-3">
      <Card className="bg-white/75 lg:col-span-2"><CardHeader className="flex-row items-center justify-between"><CardTitle>Client pulse</CardTitle><Link href="/business?tab=customers" className="text-xs font-medium">All customers</Link></CardHeader><CardContent className="grid gap-4 md:grid-cols-3">
        {clients.length === 0 && !loading && <p className="py-6 text-center text-sm text-muted-foreground md:col-span-3">No active customers yet. Create one in the Business Workspace.</p>}
        {clients.map(c => <Link key={c.id} href="/business?tab=customers" className="rounded-xl border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between"><div className="truncate font-semibold">{c.name}</div><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" /></div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{c.industry || "Industry not set"}</div>
          <div className="mt-5 text-lg font-semibold">{money(c.value)}</div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ece8de]"><div className="h-full rounded-full bg-[#ba5c42]" style={{ width: `${Math.max(0, Math.min(100, c.progress))}%` }} /></div>
          <div className="mt-3 truncate text-[11px] text-muted-foreground">Next: {c.next}</div>
        </Link>)}
      </CardContent></Card>
      <Card className="bg-white/75"><CardHeader><CardTitle>Quick create</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-2">{[
        [FileText, "Quotation", "/business?tab=sales"], [MessageSquareText, "Opportunity", "/business?tab=crm"],
        [Clapperboard, "Funnel", "/funnels"], [Megaphone, "Brand DNA", "/brands"],
        [Building2, "Customer", "/business?tab=customers"], [Workflow, "Automation", "/automations"]
      ].map(([Icon, label, href]: any) => <Link key={label} href={href} className="rounded-lg border bg-white p-3 text-left text-xs font-medium hover:bg-[#f7f4ed]"><Icon className="mb-3 h-4 w-4" />{label}</Link>)}</CardContent></Card>
    </div>
  </div>;
}
function Insight({ n, label, text, severity = "info" }: { n: string; label?: string; text: string; severity?: "info" | "watch" | "urgent" }) {
  const dot = severity === "urgent" ? "bg-red-400" : severity === "watch" ? "bg-amber-300" : "bg-white/25";
  return <div className="flex gap-3">
    <span className="text-[#ef9a75]">{n}</span>
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

function FinancialProjection() {
  const [companyPct, setCompanyPct] = usePersisted("ca-company-pct", 10);
  const [members, setMembers] = usePersisted("ca-members", 5);
  const totalFees = 572000, totalIncentive = 150700, grand = totalFees + totalIncentive;
  const company = grand * companyPct / 100; const teamTotal = grand - company; const perPerson = teamTotal / members;
  return <div>
    <PageHead eyebrow="Kretivco × Chef Ammar" title="Financial Projection" description="An editable 12-month scenario model. It is deliberately kept separate from actual sales and settlements, which live in the Finance and Settlement workspaces." action={<Button asChild variant="outline" className="bg-white"><Link href="/business?tab=settlements"><HandCoins className="h-4 w-4" />Open actual settlements</Link></Button>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="12-month Kretivco income" value={money(grand)} note="Fees + performance incentive" /><Stat label="Company / year" value={money(company)} note={`${companyPct}% of total`} /><Stat label="Team / year" value={money(teamTotal)} note={`${100 - companyPct}% distributed`} /><Stat label="Per person / year" value={money(perPerson)} note={`${members} team members`} /></div>
    <Card className="mt-5 bg-white/80"><CardContent className="grid gap-5 p-5 md:grid-cols-2"><label className="text-xs font-medium">Company share: {companyPct}%<input type="range" min="0" max="50" value={companyPct} onChange={e => setCompanyPct(Number(e.target.value))} className="mt-3 w-full accent-[#ba5c42]" /></label><label className="text-xs font-medium">Team members: {members}<input type="range" min="1" max="10" value={members} onChange={e => setMembers(Number(e.target.value))} className="mt-3 w-full accent-[#ba5c42]" /></label></CardContent></Card>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <Card className="overflow-hidden bg-white/80"><CardHeader><CardTitle>Monthly projection</CardTitle></CardHeader><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-[#f7f4ed] text-muted-foreground"><tr><th className="px-4 py-3">Month</th><th className="px-4 py-3 text-right">Units / week</th><th className="px-4 py-3 text-right">Fee / month</th><th className="px-4 py-3 text-right">Incentive</th><th className="px-4 py-3 text-right">Company</th><th className="px-4 py-3 text-right">Per person</th></tr></thead><tbody>{projectionRows.map(r => { const total = r.monthly + r.incentive, co = total * companyPct / 100, pp = (total - co) / members; return <tr key={r.month} className="border-t"><td className="px-4 py-3 font-medium">{r.month}<div className="text-[9px] text-muted-foreground">{r.stage}</div></td><td className="px-4 py-3 text-right">{r.unitsWeek.toLocaleString()}</td><td className="px-4 py-3 text-right">{money(r.monthly)}</td><td className="px-4 py-3 text-right">{r.incentive ? money(r.incentive) : "—"}</td><td className="px-4 py-3 text-right">{money(co)}</td><td className="px-4 py-3 text-right font-semibold">{money(pp)}</td></tr>})}</tbody></table></div></Card>
      <Card className="bg-[#26342b] text-white"><CardHeader><CardTitle>Annual distribution</CardTitle></CardHeader><CardContent><div className="rounded-xl bg-white/5 p-4"><div className="text-xs text-white/45">Kretivco company allocation</div><div className="mt-2 text-3xl font-semibold">{money(company)}</div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#ef9a75]" style={{ width: `${companyPct}%` }} /></div></div><div className="mt-5 space-y-3">{team.slice(0, members).map((x, i) => <div key={i} className="flex items-center justify-between border-b border-white/10 pb-3 text-sm"><span className="text-white/65">{x || `Member ${i + 1}`}</span><span className="font-medium">{money(perPerson)}</span></div>)}</div><div className="mt-5 rounded-lg border border-white/10 p-3 text-xs leading-relaxed text-white/55">Scenario reference: management fees {money(totalFees)} + incentive {money(totalIncentive)}. Marketplace surplus is excluded and can be added as a separate actual-data line.</div></CardContent></Card>
    </div>
  </div>;
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
    <PageHead eyebrow="Shared decision queue" title="Approvals" description="Every open decision across sales documents, weekly settlements and HR leave, in one queue. Approving here writes straight back to the shared record." action={<Button variant="outline" className="bg-white" onClick={() => { void reload(); void loadHr(); }} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />Refresh</Button>} />
    <DataNotice loading={loading} error={error} onRetry={reload} />
    {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}
    {failure && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{failure}</span><button onClick={() => setFailure("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}

    {!loading && items.length === 0 && <Empty title="Nothing is waiting for a decision" description="Draft or sent sales documents, unverified settlements and pending leave requests all appear here automatically." action={<Button asChild variant="outline" className="bg-white"><Link href="/business?tab=sales">Open Sales</Link></Button>} />}

    <div className="space-y-3">{items.map(item => <Card key={item.id} className="bg-white/80"><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#eee9df]"><ClipboardCheck className="h-5 w-5" /></div>
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

const inputClass = "h-11 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-[#ba5c42] focus:ring-4 focus:ring-[#ba5c42]/10";

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
          <div className="rounded-xl border bg-[#f7f4ed] p-4 text-sm leading-relaxed">{result.summary}</div>
          {result.sections?.map((section, index) => <div key={section.title} className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f0ebe1] text-[10px]">{index + 1}</span><div className="text-sm font-semibold">{section.title}</div></div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{section.body}</p>
          </div>)}
        </div>}
      </CardContent></Card>
    </div>
  </div>;
}

function ContentPlanner() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const start = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }, []);
  const [slots, setSlots] = usePersisted<Record<string, { title: string; status: string }>>("content-planner", {});

  const update = (key: string, title: string) => {
    const next = { ...slots };
    if (title.trim()) next[key] = { title, status: next[key]?.status || "Planned" };
    else delete next[key];
    setSlots(next);
  };

  const cycle = (key: string) => {
    const order = ["Planned", "Review", "Approved"];
    const current = slots[key];
    if (!current) return;
    setSlots({ ...slots, [key]: { ...current, status: order[(order.indexOf(current.status) + 1) % order.length] } });
  };

  return <div>
    <PageHead eyebrow="Publishing workflow" title="Content Planner" description="Plan the week, then move each piece from planned to review to approved. Entries are kept on this device until the content calendar is moved onto the shared record." />
    <Card className="overflow-hidden bg-white/80"><div className="grid min-w-[900px] grid-cols-7 divide-x">{days.map((day, index) => {
      const date = new Date(start); date.setDate(start.getDate() + index);
      const key = date.toISOString().slice(0, 10);
      const slot = slots[key];
      const isToday = key === new Date().toISOString().slice(0, 10);
      return <div key={key} className="min-h-[460px]">
        <div className={cn("border-b p-3 text-xs font-semibold", isToday ? "bg-[#26342b] text-white" : "bg-[#f7f4ed]")}>{day} {date.getDate()}</div>
        <div className="space-y-2 p-3">
          <textarea value={slot?.title || ""} onChange={e => update(key, e.target.value)} placeholder="Add content…" className="min-h-24 w-full resize-none rounded-lg border bg-white p-3 text-sm outline-none focus:border-[#ba5c42]" />
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
    <PageHead eyebrow="Video production" title="Storyboard Studio" description="Turn a campaign idea into scenes, shot list, timing, audio direction and camera notes." action={<div className="flex gap-2"><Button variant="outline" className="bg-white" onClick={() => window.print()}><Presentation className="h-4 w-4" />Present</Button><Button onClick={() => generate(form)} disabled={loading}>{loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{loading ? "Generating…" : "Generate scenes"}</Button></div>} />
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
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#202c25] text-sm font-semibold text-white">{String(index + 1).padStart(2, "0")}</div>
        <div className="flex h-24 items-center justify-center rounded-lg bg-[#eee9df]"><Film className="h-6 w-6 text-[#ba5c42]" /></div>
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

function ImproveWritingButton({ value, field, context, onApply }: { value: string; field: string; context: string; onApply: (value: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const improve = async () => {
    if (busy || value.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/writing/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, field, context }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to improve writing.");
      onApply(String(payload.improved || value));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to improve writing.");
    } finally {
      setBusy(false);
    }
  };

  return <span className="inline-flex items-center gap-1.5"><button type="button" onClick={improve} disabled={busy || value.trim().length < 3} className="inline-flex h-7 items-center gap-1 rounded-md border bg-white px-2 text-[10px] font-medium text-[#5d655e] transition hover:border-[#ba5c42] hover:text-[#ba5c42] disabled:cursor-not-allowed disabled:opacity-40">{busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}{busy ? "Improving…" : "Improve with AI"}</button>{error && <span className="text-[10px] text-red-600" title={error}>!</span>}</span>;
}

function PromptWritingControl({ label, value, onChange, context, placeholder = "", multiline = true, className = "" }: { label: string; value: string; onChange: (value: string) => void; context: string; placeholder?: string; multiline?: boolean; className?: string }) {
  return <div>
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{label}</span><ImproveWritingButton value={value} field={label} context={context} onApply={onChange} /></div>
    {multiline
      ? <textarea value={value} onChange={event => onChange(event.target.value)} className={cn("mt-2 min-h-20 w-full resize-y rounded-lg border bg-white p-3 text-sm leading-6 outline-none focus:border-[#ba5c42] focus:ring-4 focus:ring-[#ba5c42]/10", className)} placeholder={placeholder} />
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
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b p-4 sm:p-5"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ba5c42]">01 · Production brief</div><CardTitle className="mt-1">Image direction</CardTitle></div><div className="text-right"><div className="text-lg font-semibold">{completeness}%</div><div className="text-[9px] text-muted-foreground">brief ready</div></div></CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div><div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick setup</div><div className="flex flex-wrap gap-2"><button onClick={() => applyPreset("food")} className="rounded-lg border bg-[#faf8f3] px-3 py-2 text-xs hover:border-[#ba5c42]">Real food photo</button><button onClick={() => applyPreset("product")} className="rounded-lg border bg-[#faf8f3] px-3 py-2 text-xs hover:border-[#ba5c42]">Product hero</button><button onClick={() => applyPreset("poster")} className="rounded-lg border bg-[#faf8f3] px-3 py-2 text-xs hover:border-[#ba5c42]">Campaign poster</button></div></div>

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
          <div className="rounded-lg bg-[#f4f1e8] px-3 py-2 text-[10px] leading-5 text-muted-foreground"><span className="font-semibold text-[#202c25]">Output target:</span> {outputTarget}. Aspect ratio controls shape; resolution controls pixel delivery.</div>
          {isImage && <label className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-medium text-emerald-900"><span><span className="block">Anti-slop realism</span><span className="mt-1 block text-[9px] font-normal text-emerald-700">Always enforced · no hype-token prompting</span></span><select value={form.realismProfile} onChange={e => set("realismProfile", e.target.value)} className="h-9 max-w-[150px] rounded-lg border border-emerald-200 bg-white px-2 text-xs outline-none"><option>Strict natural</option><option>Balanced commercial</option></select></label>}

          <details className="group rounded-xl border bg-[#faf8f3]">
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
              {!isImage && <><label className="block text-xs font-medium">Duration<input value={form.duration} onChange={e => set("duration", e.target.value)} className={cn(inputClass, "mt-2")} /></label><label className="block text-xs font-medium">Motion and camera movement<textarea value={form.motion} onChange={e => set("motion", e.target.value)} className="mt-2 min-h-20 w-full rounded-lg border bg-white p-3 text-sm" /></label></>}
            </div>
          </details>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          <Button className="w-full sm:hidden" onClick={runGenerate} disabled={loading || (!form.brief.trim() && !form.product.trim())}>{loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}{loading ? "Building prompt…" : "Build production prompt"}</Button>
          <SourceNote source={source} />
        </CardContent>
      </Card>

      <Card id="prompt-output" className="scroll-mt-24 overflow-hidden bg-[#26342b] text-white">
        <CardHeader className="flex-row items-start justify-between space-y-0 border-b border-white/10 p-4 sm:p-5"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ef9a75]">02 · Generated output</div><CardTitle className="mt-1">{form.model} prompt</CardTitle></div>{result && <Badge tone="green">Ready</Badge>}</CardHeader>
        <CardContent className="p-4 sm:p-5">
          {result ? <>
            <textarea value={draftPrompt} onChange={e => setDraftPrompt(e.target.value)} className="min-h-[280px] w-full resize-y rounded-xl border border-white/10 bg-black/10 p-4 font-mono text-xs leading-7 text-white/80 outline-none focus:border-white/25 sm:min-h-[360px]" />
            <div className="mt-2 text-right text-[9px] text-white/35">{draftPrompt.length.toLocaleString()} characters · editable</div>
            {result.generationSettings && <div className="mt-3 rounded-xl border border-[#ef9a75]/25 bg-[#ef9a75]/10 p-4 text-xs leading-6 text-[#ffd3c4]"><div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-[#ef9a75]">Generation settings</div>{result.generationSettings}</div>}
            {draftNegative && <div className="mt-3"><div className="mb-2 text-[10px] uppercase tracking-wider text-white/40">Negative prompt</div><textarea value={draftNegative} onChange={e => setDraftNegative(e.target.value)} className="min-h-24 w-full resize-y rounded-xl border border-white/10 bg-black/10 p-4 font-mono text-xs leading-6 text-white/55 outline-none" /></div>}
            {result.notes && <div className="mt-3 text-xs leading-relaxed text-white/55">{result.notes}</div>}
            <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => copyText("prompt")}>{copied === "prompt" && <Check className="h-4 w-4" />}{copied === "prompt" ? "Copied" : "Copy prompt"}</Button><Button variant="outline" className="border-white/15 text-white hover:bg-white/10" onClick={() => copyText("full")}>{copied === "full" && <Check className="h-4 w-4" />}{copied === "full" ? "Copied all" : "Copy with settings"}</Button>{isImage && <Button className="bg-[#ef9a75] text-[#202c25] hover:bg-[#f3a486]" onClick={openImageStudio}>Open in Image Studio<ArrowRight className="h-4 w-4" /></Button>}</div>
          </> : <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-white/15 p-8 text-center"><WandSparkles className="h-7 w-7 text-[#ef9a75]" /><div className="mt-4 font-semibold">No production prompt yet</div><p className="mt-2 max-w-sm text-xs leading-6 text-white/45">Start with a preset, add the product or idea, then generate. KretivOS will structure subject, composition, lighting, realism, exclusions and the correct model syntax.</p></div>}
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
    <PageHead eyebrow="CTO workspace" title="Technology" description="Repositories, environments, deployments, infrastructure and AI services across every product. The registry below is a static inventory pending a systems table." action={<Button asChild variant="outline" className="bg-white"><Link href="/automations"><Workflow className="h-4 w-4" />Automations</Link></Button>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Registered systems" value={String(systems.length)} note="Static inventory" icon={Cloud} />
      <Stat label="Shared database" value={health.ok ? "Online" : "Attention"} note={health.label} icon={Database} />
      <Stat label="Repositories" value="14" note="3 active releases" icon={GitBranch} />
      <Stat label="Open incidents" value="2" note="1 high priority" icon={Activity} />
    </div>
    <div className="mt-5 grid gap-4 md:grid-cols-2">{systems.map(x => <Card key={x.n} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eee9df]"><Code2 className="h-5 w-5" /></div><Badge tone={x.status === "Healthy" ? "green" : "amber"}>{x.status}</Badge></div><div className="mt-4 font-semibold">{x.n}</div><div className="mt-1 text-xs text-muted-foreground">{x.stack}</div><div className="mt-5 border-t pt-4 text-xs">{x.env}</div></CardContent></Card>)}</div>
  </div>;
}

function Settings() {
  const cards: [any, string, string, string][] = [
    [Building2, "Company profile", "Kretivco Mediaworks, registration, address and signatories", "/business?tab=customers"],
    [FileText, "Documents", "AI-assisted proposals, quotations, invoices, memos and agreements", "/documents"],
    [UsersRound, "Team and HR", "Employees, leave, attendance, goals and onboarding", "/hr"],
    [Palette, "Brand DNA", "Colours, typography, tone and approved claims per brand", "/brands"],
    [Workflow, "Automations", "Triggers, actions and approval thresholds", "/automations"],
    [Library, "Knowledge library", "Agreements, SOPs, campaign learnings and technical decisions", "/knowledge"],
  ];
  return <div>
    <PageHead eyebrow="Configuration" title="Settings" description="KretivOS keeps configuration inside the workspace that owns it, so each area below opens the record it configures." />
    <div className="grid gap-5 lg:grid-cols-2">{cards.map(([Icon, title, description, href]) => <Link key={title} href={href}><Card className="h-full bg-white/80 transition hover:-translate-y-0.5 hover:shadow-md"><CardContent className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#eee9df]"><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="font-semibold">{title}</div><div className="mt-1 text-xs text-muted-foreground">{description}</div></div><ChevronRight className="h-4 w-4 shrink-0" /></CardContent></Card></Link>)}</div>
    <Card className="mt-5 bg-white/80"><CardHeader><CardTitle>AI and offline</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border bg-white p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4" />ai-nonymauz-cloud</div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Connected server-side to the deployed Render service. <code className="rounded bg-[#f0ebe1] px-1">AI_NONYMAUZ_BASE_URL</code>, <code className="rounded bg-[#f0ebe1] px-1">AI_NONYMAUZ_API_KEY</code> and <code className="rounded bg-[#f0ebe1] px-1">AI_NONYMAUZ_MODEL</code> remain optional deployment overrides; the browser never receives them.</p></div>
      <div className="rounded-lg border bg-white p-4"><div className="flex items-center gap-2 text-sm font-semibold"><MonitorSmartphone className="h-4 w-4" />PWA and offline</div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">The app shell is cached for offline launch. Business records are always fetched live so shared data is never served stale.</p></div>
    </CardContent></Card>
  </div>;
}

type ChatTurn = {
  from: "ai" | "user";
  text: string;
  sources?: { index: number; id: string; title: string; category: string; customerName: string }[];
  grounded?: boolean;
};

function AIChat({ onClose, module }: { onClose: () => void; module: string }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([{ from: "ai", text: "I can read the shared KretivOS record — pipeline, receivables, settlements, delivery and the knowledge library. Ask about the business and I will cite the entries I used." }]);

  const send = async () => {
    if (!message.trim() || loading) return;
    const next: ChatTurn[] = [...messages, { from: "user", text: message }];
    setMessages(next);
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, messages: next.map(m => ({ role: m.from === "ai" ? "assistant" : "user", content: m.text })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI request failed");
      setMessages(m => [...m, { from: "ai", text: data.content, sources: data.sources, grounded: data.grounded }]);
    } catch (e) {
      setMessages(m => [...m, { from: "ai", text: e instanceof Error ? e.message : "AI unavailable" }]);
    } finally {
      setLoading(false);
    }
  };

  return <div className="fixed inset-0 z-[70] flex justify-end bg-black/25"><div className="flex h-full w-full max-w-[460px] flex-col bg-[#f7f4ed] shadow-2xl">
    <div className="flex h-[76px] items-center border-b px-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#202c25] text-white"><Bot className="h-5 w-5" /></div>
      <div className="ml-3"><div className="font-semibold">Kretiv AI</div><div className="text-[10px] text-muted-foreground">{module} · reads live company records</div></div>
      <Button variant="ghost" size="icon" className="ml-auto" onClick={onClose}><X className="h-4 w-4" /></Button>
    </div>
    <div className="flex-1 space-y-4 overflow-y-auto p-5">
      {messages.map((m, i) => <div key={i} className={cn("max-w-[87%]", m.from === "user" ? "ml-auto" : "")}>
        <div className={cn("whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-relaxed", m.from === "user" ? "bg-[#202c25] text-white" : "border bg-white")}>{m.text}</div>
        {m.from === "ai" && m.sources && m.sources.length > 0 && <div className="mt-2 space-y-1">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Sources</div>
          {m.sources.map(source => <Link key={source.index} href="/knowledge" className="flex items-start gap-2 rounded-lg border bg-white/70 px-2.5 py-1.5 text-[10px] hover:bg-white">
            <span className="font-semibold text-[#ba5c42]">[{source.index}]</span>
            <span className="min-w-0"><span className="block truncate font-medium">{source.title}</span><span className="text-muted-foreground">{[source.customerName, source.category].filter(Boolean).join(" · ")}</span></span>
          </Link>)}
        </div>}
        {m.from === "ai" && m.grounded === false && i > 0 && <div className="mt-1.5 text-[10px] text-muted-foreground">Answered without live records — nothing in the library matched.</div>}
      </div>)}
      {loading && <div className="w-fit rounded-xl border bg-white px-4 py-3 text-sm text-muted-foreground">Reading company records…</div>}
    </div>
    <div className="border-t bg-white/60 p-4">
      <div className="mb-3 flex gap-2 overflow-x-auto">{["What needs attention today?", "Which invoices are overdue?", "What does the Chef Ammar MoU say about payment?"].map(x => <button key={x} onClick={() => setMessage(x)} className="whitespace-nowrap rounded-full border bg-white px-3 py-1.5 text-[10px]">{x}</button>)}</div>
      <div className="flex items-end gap-2 rounded-xl border bg-white p-2">
        <textarea value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} className="min-h-10 flex-1 resize-none px-2 py-2 text-sm outline-none" placeholder="Ask about the business…" />
        <Button size="icon" onClick={send} aria-label="Send"><Send className="h-4 w-4" /></Button>
      </div>
    </div>
  </div></div>;
}

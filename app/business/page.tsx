"use client";

import { isValidElement, useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness, Building2, Check, CircleDollarSign, Contact, Database,
  FileText, HandCoins, Megaphone, Palette, Pencil, Plus, RefreshCw,
  Search, Trash2, Users, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/date-input";
import { AIWritingButton } from "@/components/ai-writing-button";
import { WorkspacePage } from "@/components/workspace-page";
import { BUSINESS_STORAGE_KEY, CUSTOMER_STORAGE_KEY, businessId } from "@/lib/business-data";
import { INDUSTRY_GROUPS } from "@/lib/industries";
import { cn } from "@/lib/utils";

type Tab = "customers" | "contacts" | "brands" | "channels" | "crm" | "sales" | "finance" | "settlements" | "projects" | "onboarding";
type EditorState = { tab: Tab; record: any; isNew: boolean } | null;

type Snapshot = {
  customers: any[];
  contacts: any[];
  brands: any[];
  channels: any[];
  opportunities: any[];
  documents: any[];
  transactions: any[];
  settlements: any[];
  projects: any[];
  onboardings: any[];
  syncedAt?: string;
};

const emptySnapshot: Snapshot = {
  customers: [], contacts: [], brands: [], channels: [], opportunities: [],
  documents: [], transactions: [], settlements: [], projects: [], onboardings: []
};

const tabs: { id: Tab; label: string; icon: any }[] = [
  { id: "customers", label: "Customers", icon: Building2 },
  { id: "contacts", label: "Contacts", icon: Contact },
  { id: "brands", label: "Brands", icon: Palette },
  { id: "channels", label: "Channels", icon: Megaphone },
  { id: "crm", label: "CRM", icon: Users },
  { id: "sales", label: "Sales", icon: FileText },

  { id: "projects", label: "Projects", icon: BriefcaseBusiness },
  { id: "onboarding", label: "Onboarding", icon: Check }
];

const resourceForTab: Record<Tab, string> = {
  customers: "customers", contacts: "contacts", brands: "brands", channels: "channels",
  crm: "crm", sales: "sales", finance: "finance", settlements: "settlements",
  projects: "projects", onboarding: "onboarding"
};

const channelCategories = [
  "Social Media", "Video", "Messaging", "Owned Media", "Commerce", "Marketplace",
  "Paid Media", "Local Discovery", "Offline", "Partnership", "Community", "Other"
];

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => `RM${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function BusinessOperationsPage() {
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  const [tab, setTab] = useState<Tab>("customers");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData(showLoader = true) {
    if (showLoader) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/business", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load business data.");
      setData(payload);

      const legacy = {
        customers: payload.customers,
        opportunities: payload.opportunities,
        documents: payload.documents,
        transactions: payload.transactions,
        settlements: payload.settlements,
        projects: payload.projects,
        onboardings: payload.onboardings
      };
      localStorage.setItem(BUSINESS_STORAGE_KEY, JSON.stringify(legacy));
      localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(payload.customers));
      localStorage.setItem("kretivos-brands", JSON.stringify(payload.brands));
      localStorage.setItem("kretivos-marketing-channels", JSON.stringify(payload.channels));
      window.dispatchEvent(new CustomEvent("kretivos-business-synced", { detail: payload }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load business data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    // Finance moved into the Accounting app, where the same money is recorded
    // once on a real ledger. Existing links and bookmarks follow it rather than
    // landing on a tab that no longer exists.
    if (requested === "finance") { window.location.replace("/accounting?tab=transactions"); return; }
    // Settlements are purely financial — units times a fee — so they moved to
    // the app that owns money. Existing links follow rather than dead-ending.
    if (requested === "settlements") { window.location.replace("/accounting?tab=settlements"); return; }
    if (requested && tabs.some((item) => item.id === requested)) setTab(requested);
    void loadData();
  }, []);

  function changeTab(next: Tab) {
    setTab(next);
    setQuery("");
    setEditor(null);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url);
  }

  const customerName = (id: string) => data.customers.find((item) => item.id === id)?.name || "Unknown customer";
  const lowerQuery = query.toLowerCase().trim();
  const matches = (...values: unknown[]) => !lowerQuery || values.some((value) => String(value ?? "").toLowerCase().includes(lowerQuery));

  const stats = useMemo(() => {
    const pipeline = data.opportunities.filter((item) => !["Won", "Lost"].includes(item.stage)).reduce((sum, item) => sum + item.value * item.probability / 100, 0);
    const receivables = data.documents.filter((item) => item.type === "Invoice" && ["Sent", "Approved", "Overdue"].includes(item.status)).reduce((sum, item) => sum + item.value, 0);
    const income = data.transactions.filter((item) => item.type === "Income" && item.status === "Cleared").reduce((sum, item) => sum + item.amount, 0);
    const expense = data.transactions.filter((item) => item.type === "Expense" && item.status === "Cleared").reduce((sum, item) => sum + item.amount, 0);
    return { pipeline, receivables, cash: income - expense, activeProjects: data.projects.filter((item) => item.status === "Active").length };
  }, [data]);

  function openCreate(target: Tab = tab) {
    if (!["customers", "channels"].includes(target) && data.customers.length === 0) {
      setNotice("Create a customer before adding linked records.");
      changeTab("customers");
      return;
    }
    const customerId = data.customers[0]?.id || "";
    const defaults: Record<Tab, any> = {
      customers: { id: businessId("customer"), name: "", legalName: "", industry: "", status: "Lead", contactName: "", email: "", phone: "", notes: "" },
      contacts: { id: businessId("contact"), customerId, name: "", jobTitle: "", email: "", phone: "", isPrimary: false, notes: "" },
      brands: { id: businessId("brand"), customerId, name: "", description: "", status: "Active", websiteUrl: "" },
      channels: { id: businessId("channel"), name: "", category: "Social Media", status: "Active", description: "" },
      crm: { id: businessId("opp"), customerId, title: "", stage: "New", value: 0, probability: 25, nextAction: "", dueDate: today(), notes: "" },
      sales: { id: businessId("doc"), customerId, type: "Quotation", title: "", reference: "", status: "Draft", value: 0, issueDate: today(), dueDate: today(), notes: "" },
      finance: { id: businessId("txn"), customerId, type: "Income", category: "", amount: 0, date: today(), status: "Pending", reference: "", notes: "" },
      settlements: { id: businessId("settlement"), customerId, periodStart: today(), periodEnd: today(), units: 0, feePerUnit: 2, adReimbursement: 0, incentive: 0, status: "Draft", dueDate: today(), notes: "" },
      projects: { id: businessId("project"), customerId, name: "", status: "Planning", progress: 0, budget: 0, dueDate: today(), owner: "Kretivco Team", notes: "" },
      onboarding: { id: businessId("onboarding"), customerId, blueprint: "General Client Onboarding", status: "Not started", targetLaunch: today(), notes: "", steps: [
        { id: businessId("step"), label: "Customer profile", done: false },
        { id: businessId("step"), label: "Commercial agreement", done: false },
        { id: businessId("step"), label: "Brand DNA and assets", done: false },
        { id: businessId("step"), label: "Delivery setup", done: false },
        { id: businessId("step"), label: "Launch checklist", done: false }
      ] }
    };
    setEditor({ tab: target, record: defaults[target], isNew: true });
  }

  function openEdit(target: Tab, record: any) {
    setEditor({ tab: target, record: JSON.parse(JSON.stringify(record)), isNew: false });
  }

  async function mutate(body: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save record.");
      setNotice(successMessage);
      setEditor(null);
      await loadData(false);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save record.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveEditor() {
    if (!editor) return;
    const record = editor.record;
    const requiredName = editor.tab === "customers" || editor.tab === "contacts" || editor.tab === "brands" || editor.tab === "channels" || editor.tab === "projects";
    if (requiredName && !String(record.name || "").trim()) {
      setError("Name is required.");
      return;
    }
    await mutate({
      operation: editor.isNew ? "create" : "update",
      resource: resourceForTab[editor.tab],
      id: record.id,
      data: record
    }, editor.isNew ? "Record created in Neon." : "Record updated in Neon.");
  }

  async function deleteRecord(target: Tab, id: string) {
    if (!window.confirm("Delete this record? Linked records may also be removed.")) return;
    await mutate({ operation: "delete", resource: resourceForTab[target], id }, "Record deleted from Neon.");
  }

  async function performAction(action: string, id: string, message: string) {
    await mutate({ operation: "action", action, id }, message);
  }

  async function toggleOnboardingStep(item: any, stepId: string) {
    const updated = { ...item, steps: item.steps.map((step: any) => step.id === stepId ? { ...step, done: !step.done } : step) };
    const completed = updated.steps.length > 0 && updated.steps.every((step: any) => step.done);
    if (completed) updated.status = "Completed";
    else if (updated.steps.some((step: any) => step.done)) updated.status = "In progress";
    await mutate({ operation: "update", resource: "onboarding", id: item.id, data: updated }, "Onboarding checklist updated.");
  }

  const currentLabel = tabs.find((item) => item.id === tab)?.label || "Record";

  return (
    <WorkspacePage
      eyebrow="PostgreSQL shared operations"
      title="Business Workspace"
      description="Customers, contacts, brands, channels, CRM, sales, finance, settlements, projects and onboarding now use Neon PostgreSQL as the shared source of truth."
      actions={<div className="flex flex-wrap gap-2"><Button variant="outline" className="bg-white" onClick={() => loadData()} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />Sync</Button><Button onClick={() => openCreate()}><Plus className="h-4 w-4" />Add {currentLabel}</Button></div>}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Database className="h-4 w-4 text-emerald-600" /><span>{loading ? "Connecting to Neon…" : error ? "Database needs attention" : `Synced ${data.syncedAt ? new Date(data.syncedAt).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" }) : "just now"}`}</span></div>
        <div className="text-xs text-muted-foreground">Authentication intentionally skipped for this phase</div>
      </div>

      {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}
      {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Weighted pipeline" value={money(stats.pipeline)} note={`${data.opportunities.length} opportunities`} />
        <Stat label="Receivables" value={money(stats.receivables)} note="Sent, approved and overdue invoices" />
        <Stat label="Cleared cash position" value={money(stats.cash)} note="Income less expenses" />
        <Stat label="Active projects" value={String(stats.activeProjects)} note={`${data.projects.length} total projects`} />
      </div>

      <div className="my-5 overflow-x-auto rounded-xl border bg-white/70 p-1.5">
        <div className="flex min-w-max gap-1">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => changeTab(id)} className={cn("flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition", tab === id ? "bg-[#202c25] text-white" : "text-muted-foreground hover:bg-[#f3efe6]")}><Icon className="h-4 w-4" />{label}</button>)}</div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border bg-white px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={`Search ${currentLabel.toLowerCase()}…`} /></div>
        <Button onClick={() => openCreate()} className="w-full sm:w-auto"><Plus className="h-4 w-4" />Create new</Button>
      </div>

      {loading && <Card className="bg-white/75"><CardContent className="p-12 text-center text-sm text-muted-foreground"><RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin" />Loading shared business records…</CardContent></Card>}

      {!loading && tab === "customers" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.customers.filter((item) => matches(item.name, item.legalName, item.industry, item.contactName)).map((item) => <Card key={item.id} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eee9df]"><Building2 className="h-5 w-5 text-[#ba5c42]" /></div><Badge value={item.status} /></div><h2 className="mt-5 text-xl font-semibold">{item.name}</h2><p className="mt-1 text-xs text-muted-foreground">{item.industry || "Industry not set"}</p><div className="mt-5 grid grid-cols-2 gap-2"><Mini label="Primary contact" value={item.contactName || "—"} /><Mini label="Email" value={item.email || "—"} /></div><p className="mt-4 min-h-10 text-xs leading-5 text-muted-foreground">{item.notes || "No notes."}</p><RecordActions onEdit={() => openEdit("customers", item)} onDelete={() => deleteRecord("customers", item.id)} /></CardContent></Card>)}</div>}

      {!loading && tab === "contacts" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.contacts.filter((item) => matches(item.name, item.jobTitle, item.email, customerName(item.customerId))).map((item) => <Card key={item.id} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eee9df]"><Contact className="h-5 w-5 text-[#ba5c42]" /></div>{item.isPrimary && <Badge value="Primary" />}</div><h3 className="mt-5 font-semibold">{item.name}</h3><div className="mt-1 text-xs text-[#ba5c42]">{customerName(item.customerId)}</div><div className="mt-4 grid grid-cols-2 gap-2"><Mini label="Role" value={item.jobTitle || "—"} /><Mini label="Phone" value={item.phone || "—"} /></div><p className="mt-4 text-xs text-muted-foreground">{item.email || "No email"}</p><RecordActions onEdit={() => openEdit("contacts", item)} onDelete={() => deleteRecord("contacts", item.id)} /></CardContent></Card>)}</div>}

      {!loading && tab === "brands" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.brands.filter((item) => matches(item.name, item.description, customerName(item.customerId))).map((item) => <Card key={item.id} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eee9df]"><Palette className="h-5 w-5 text-[#ba5c42]" /></div><Badge value={item.status} /></div><h3 className="mt-5 text-lg font-semibold">{item.name}</h3><div className="mt-1 text-xs text-[#ba5c42]">{customerName(item.customerId)}</div><p className="mt-4 min-h-10 text-xs leading-5 text-muted-foreground">{item.description || "No brand description."}</p><div className="mt-3 text-xs text-muted-foreground">{item.websiteUrl || "Website not set"}</div><RecordActions onEdit={() => openEdit("brands", item)} onDelete={() => deleteRecord("brands", item.id)} /></CardContent></Card>)}</div>}

      {!loading && tab === "channels" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.channels.filter((item) => matches(item.name, item.category, item.description)).map((item) => <Card key={item.id} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eee9df]"><Megaphone className="h-5 w-5 text-[#ba5c42]" /></div><Badge value={item.status} /></div><h3 className="mt-5 font-semibold">{item.name}</h3><div className="mt-1 text-xs text-[#ba5c42]">{item.category}</div><p className="mt-4 min-h-10 text-xs leading-5 text-muted-foreground">{item.description || "No description."}</p><RecordActions onEdit={() => openEdit("channels", item)} onDelete={() => deleteRecord("channels", item.id)} /></CardContent></Card>)}</div>}

      {!loading && tab === "crm" && <div className="grid gap-4 lg:grid-cols-2">{data.opportunities.filter((item) => matches(item.title, item.stage, item.nextAction, customerName(item.customerId))).map((item) => <Card key={item.id} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-wider text-[#ba5c42]">{customerName(item.customerId)}</div><h3 className="mt-1 font-semibold">{item.title}</h3></div><Badge value={item.stage} /></div><div className="mt-5 grid grid-cols-3 gap-2"><Mini label="Value" value={money(item.value)} /><Mini label="Probability" value={`${item.probability}%`} /><Mini label="Due" value={item.dueDate || "—"} /></div><div className="mt-4 rounded-lg bg-[#f7f4ed] p-3 text-xs"><span className="text-muted-foreground">Next action</span><div className="mt-1 font-medium">{item.nextAction || "Not set"}</div></div><RecordActions onEdit={() => openEdit("crm", item)} onDelete={() => deleteRecord("crm", item.id)} /></CardContent></Card>)}</div>}

      {!loading && tab === "sales" && <div className="space-y-3">{data.documents.filter((item) => matches(item.title, item.reference, item.type, item.status, customerName(item.customerId))).map((item) => <Card key={item.id} className="bg-white/80"><CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_120px_140px_auto] md:items-center"><div><div className="text-[10px] text-muted-foreground">{customerName(item.customerId)} · {item.reference || "No reference"}</div><div className="mt-1 font-semibold">{item.title}</div><div className="mt-1 text-xs text-muted-foreground">{item.type} · Due {item.dueDate || "—"}</div></div><Badge value={item.status} /><div className="font-semibold">{money(item.value)}</div><div className="flex flex-wrap gap-2 md:justify-end">{item.type === "Invoice" && item.status !== "Paid" && <Button size="sm" onClick={() => performAction("mark-document-paid", item.id, "Invoice paid and finance transaction created.")}>Mark paid</Button>}<Button variant="outline" size="icon" onClick={() => openEdit("sales", item)}><Pencil className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => deleteRecord("sales", item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>)}</div>}

      {!loading && tab === "finance" && <div className="space-y-3">{data.transactions.filter((item) => matches(item.category, item.reference, item.type, item.status, customerName(item.customerId))).map((item) => <Card key={item.id} className="bg-white/80"><CardContent className="grid gap-4 p-5 sm:grid-cols-[1fr_120px_140px_auto] sm:items-center"><div><div className="text-[10px] uppercase tracking-wider text-[#ba5c42]">{item.customerId ? customerName(item.customerId) : "Kretivco"}</div><div className="mt-1 font-semibold">{item.category}</div><div className="mt-1 text-xs text-muted-foreground">{item.reference || "No reference"} · {item.date}</div></div><Badge value={item.status} /><div className={cn("font-semibold", item.type === "Expense" && "text-red-600")}>{item.type === "Expense" ? "−" : "+"}{money(item.amount)}</div><RecordActions compact onEdit={() => openEdit("finance", item)} onDelete={() => deleteRecord("finance", item.id)} /></CardContent></Card>)}</div>}

      {!loading && tab === "settlements" && <div className="grid gap-4 lg:grid-cols-2">{data.settlements.filter((item) => matches(customerName(item.customerId), item.status, item.periodStart, item.periodEnd)).map((item) => { const total = item.units * item.feePerUnit + item.adReimbursement + item.incentive; return <Card key={item.id} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between"><div><div className="text-[10px] uppercase tracking-wider text-[#ba5c42]">{customerName(item.customerId)}</div><h3 className="mt-1 font-semibold">{item.periodStart} → {item.periodEnd}</h3></div><Badge value={item.status} /></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><Mini label="Units" value={String(item.units)} /><Mini label="Fee/unit" value={money(item.feePerUnit)} /><Mini label="Reimbursement" value={money(item.adReimbursement)} /><Mini label="Total" value={money(total)} /></div><div className="mt-5 flex flex-wrap gap-2">{["Draft", "Verified"].includes(item.status) && <Button size="sm" onClick={() => performAction("advance-settlement", item.id, "Settlement status advanced.")}>{item.status === "Draft" ? "Verify" : "Create invoice"}</Button>}{item.status !== "Paid" && <Button size="sm" variant="outline" onClick={() => performAction("mark-settlement-paid", item.id, "Settlement paid and finance transaction created.")}>Mark paid</Button>}<Button size="sm" variant="outline" onClick={() => openEdit("settlements", item)}><Pencil className="h-4 w-4" />Edit</Button><Button size="sm" variant="outline" onClick={() => deleteRecord("settlements", item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>; })}</div>}

      {!loading && tab === "projects" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.projects.filter((item) => matches(item.name, item.status, item.owner, customerName(item.customerId))).map((item) => <Card key={item.id} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between"><div><div className="text-[10px] uppercase tracking-wider text-[#ba5c42]">{item.customerId ? customerName(item.customerId) : "Internal"}</div><h3 className="mt-1 font-semibold">{item.name}</h3></div><Badge value={item.status} /></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-[#ece8de]"><div className="h-full rounded-full bg-[#ba5c42]" style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }} /></div><div className="mt-2 text-xs text-muted-foreground">{item.progress}% · Due {item.dueDate || "—"}</div><div className="mt-4 grid grid-cols-2 gap-2"><Mini label="Owner" value={item.owner || "—"} /><Mini label="Budget" value={money(item.budget)} /></div><RecordActions onEdit={() => openEdit("projects", item)} onDelete={() => deleteRecord("projects", item.id)} /></CardContent></Card>)}</div>}

      {!loading && tab === "onboarding" && <div className="grid gap-4 lg:grid-cols-2">{data.onboardings.filter((item) => matches(customerName(item.customerId), item.blueprint, item.status)).map((item) => { const done = item.steps.filter((step: any) => step.done).length; const progress = item.steps.length ? Math.round(done / item.steps.length * 100) : 0; return <Card key={item.id} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between"><div><div className="text-[10px] uppercase tracking-wider text-[#ba5c42]">{customerName(item.customerId)}</div><h3 className="mt-1 font-semibold">{item.blueprint}</h3></div><Badge value={item.status} /></div><div className="mt-4 text-xs text-muted-foreground">{done}/{item.steps.length} steps · Target {item.targetLaunch || "—"}</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ece8de]"><div className="h-full rounded-full bg-[#ba5c42]" style={{ width: `${progress}%` }} /></div><div className="mt-5 space-y-2">{item.steps.map((step: any) => <label key={step.id} className="flex cursor-pointer items-center gap-3 rounded-lg border bg-white p-3 text-sm"><input type="checkbox" checked={step.done} onChange={() => toggleOnboardingStep(item, step.id)} className="h-4 w-4 accent-[#ba5c42]" /><span className={cn(step.done && "text-muted-foreground line-through")}>{step.label}</span></label>)}</div><RecordActions onEdit={() => openEdit("onboarding", item)} onDelete={() => deleteRecord("onboarding", item.id)} /></CardContent></Card>; })}</div>}

      {!loading && recordCount(data, tab) === 0 && <Card className="bg-white/75"><CardContent className="p-12 text-center"><div className="font-semibold">No {currentLabel.toLowerCase()} yet</div><p className="mt-2 text-sm text-muted-foreground">Create the first shared record in Neon PostgreSQL.</p><Button className="mt-4" onClick={() => openCreate()}><Plus className="h-4 w-4" />Create record</Button></CardContent></Card>}

      {editor && <EditorModal editor={editor} customers={data.customers} saving={saving} onChange={(record) => setEditor({ ...editor, record })} onClose={() => setEditor(null)} onSave={saveEditor} />}
    </WorkspacePage>
  );
}

function recordCount(data: Snapshot, tab: Tab) {
  const map: Record<Tab, any[]> = {
    customers: data.customers, contacts: data.contacts, brands: data.brands, channels: data.channels,
    crm: data.opportunities, sales: data.documents, finance: data.transactions,
    settlements: data.settlements, projects: data.projects, onboarding: data.onboardings
  };
  return map[tab].length;
}

function EditorModal({ editor, customers, saving, onChange, onClose, onSave }: { editor: NonNullable<EditorState>; customers: any[]; saving: boolean; onChange: (record: any) => void; onClose: () => void; onSave: () => void }) {
  const r = editor.record;
  const set = (key: string, value: any) => onChange({ ...r, [key]: value });
  const selectClass = "h-12 w-full rounded-xl border border-[#d9d3c7] bg-white px-3 text-sm outline-none focus:border-[#ba5c42] focus:ring-4 focus:ring-[#ba5c42]/10";
  const inputClass = selectClass;
  const textareaClass = "min-h-28 w-full rounded-xl border border-[#d9d3c7] bg-white px-3 py-3 text-sm outline-none focus:border-[#ba5c42] focus:ring-4 focus:ring-[#ba5c42]/10";

  return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"><Card className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-b-none bg-[#f7f4ed] shadow-2xl sm:rounded-xl"><CardHeader className="sticky top-0 z-10 flex-row items-start justify-between border-b bg-[#f7f4ed] p-4 sm:p-6"><div><CardTitle className="text-xl">{editor.isNew ? "Create" : "Edit"} {tabs.find((item) => item.id === editor.tab)?.label}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Changes are saved directly to Neon PostgreSQL.</p></div><Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button></CardHeader><CardContent className="p-4 sm:p-6"><div className="grid gap-4 sm:grid-cols-2">
    {!["customers", "channels"].includes(editor.tab) && <Field label="Customer"><select value={r.customerId} onChange={(event) => set("customerId", event.target.value)} className={selectClass}>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}

    {editor.tab === "customers" && <>
      <Field label="Customer / company name"><input value={r.name} onChange={(event) => set("name", event.target.value)} className={inputClass} /></Field>
      <Field label="Legal name"><input value={r.legalName} onChange={(event) => set("legalName", event.target.value)} className={inputClass} /></Field>
      <Field label="Industry"><select value={r.industry} onChange={(event) => set("industry", event.target.value)} className={selectClass}><option value="">Select industry</option>{INDUSTRY_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.options.map((option) => <option key={option} value={option}>{option}</option>)}</optgroup>)}</select></Field>
      <Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className={selectClass}>{["Lead", "Active", "Paused", "Archived"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Primary contact"><input value={r.contactName} onChange={(event) => set("contactName", event.target.value)} className={inputClass} /></Field>
      <Field label="Email"><input type="email" value={r.email} onChange={(event) => set("email", event.target.value)} className={inputClass} /></Field>
      <Field label="Phone"><input value={r.phone} onChange={(event) => set("phone", event.target.value)} className={inputClass} /></Field>
      <Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className={textareaClass} /></Field>
    </>}

    {editor.tab === "contacts" && <>
      <Field label="Contact name"><input value={r.name} onChange={(event) => set("name", event.target.value)} className={inputClass} /></Field>
      <Field label="Job title"><input value={r.jobTitle} onChange={(event) => set("jobTitle", event.target.value)} className={inputClass} /></Field>
      <Field label="Email"><input type="email" value={r.email} onChange={(event) => set("email", event.target.value)} className={inputClass} /></Field>
      <Field label="Phone"><input value={r.phone} onChange={(event) => set("phone", event.target.value)} className={inputClass} /></Field>
      <Field label="Primary contact"><label className="flex h-12 items-center gap-3 rounded-xl border bg-white px-4"><input type="checkbox" checked={r.isPrimary} onChange={(event) => set("isPrimary", event.target.checked)} className="h-4 w-4 accent-[#ba5c42]" />Use as primary contact</label></Field>
      <Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className={textareaClass} /></Field>
    </>}

    {editor.tab === "brands" && <>
      <Field label="Brand name"><input value={r.name} onChange={(event) => set("name", event.target.value)} className={inputClass} /></Field>
      <Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className={selectClass}><option>Active</option><option>Draft</option><option>Paused</option><option>Archived</option></select></Field>
      <Field label="Website"><input type="url" value={r.websiteUrl} onChange={(event) => set("websiteUrl", event.target.value)} className={inputClass} placeholder="https://" /></Field>
      <Field label="Description" wide><textarea value={r.description} onChange={(event) => set("description", event.target.value)} className={textareaClass} /></Field>
    </>}

    {editor.tab === "channels" && <>
      <Field label="Channel name"><input value={r.name} onChange={(event) => set("name", event.target.value)} className={inputClass} /></Field>
      <Field label="Category"><select value={r.category} onChange={(event) => set("category", event.target.value)} className={selectClass}>{channelCategories.map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className={selectClass}><option>Active</option><option>Paused</option><option>Archived</option></select></Field>
      <Field label="Description" wide><textarea value={r.description} onChange={(event) => set("description", event.target.value)} className={textareaClass} /></Field>
    </>}

    {editor.tab === "crm" && <>
      <Field label="Opportunity title"><input value={r.title} onChange={(event) => set("title", event.target.value)} className={inputClass} /></Field>
      <Field label="Stage"><select value={r.stage} onChange={(event) => set("stage", event.target.value)} className={selectClass}>{["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Value"><input type="number" value={r.value} onChange={(event) => set("value", Number(event.target.value))} className={inputClass} /></Field>
      <Field label={`Probability: ${r.probability}%`}><input type="range" min="0" max="100" value={r.probability} onChange={(event) => set("probability", Number(event.target.value))} className="mt-4 w-full accent-[#ba5c42]" /></Field>
      <Field label="Next action"><input value={r.nextAction} onChange={(event) => set("nextAction", event.target.value)} className={inputClass} /></Field>
      <Field label="Due date"><DateInput value={r.dueDate} onChange={(event) => set("dueDate", event.target.value)} /></Field>
      <Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className={textareaClass} /></Field>
    </>}

    {editor.tab === "sales" && <>
      <Field label="Document type"><select value={r.type} onChange={(event) => set("type", event.target.value)} className={selectClass}>{["Proposal", "Quotation", "Sales Order", "Invoice", "Receipt", "Credit Note", "MoU"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className={selectClass}>{["Draft", "Sent", "Approved", "Paid", "Overdue", "Cancelled"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Title" wide><input value={r.title} onChange={(event) => set("title", event.target.value)} className={inputClass} /></Field>
      <Field label="Reference"><input value={r.reference} onChange={(event) => set("reference", event.target.value)} className={inputClass} /></Field>
      <Field label="Value"><input type="number" value={r.value} onChange={(event) => set("value", Number(event.target.value))} className={inputClass} /></Field>
      <Field label="Issue date"><DateInput value={r.issueDate} onChange={(event) => set("issueDate", event.target.value)} /></Field>
      <Field label="Due date"><DateInput value={r.dueDate} onChange={(event) => set("dueDate", event.target.value)} /></Field>
      <Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className={textareaClass} /></Field>
    </>}

    {editor.tab === "finance" && <>
      <Field label="Type"><select value={r.type} onChange={(event) => set("type", event.target.value)} className={selectClass}><option>Income</option><option>Expense</option></select></Field>
      <Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className={selectClass}><option>Pending</option><option>Cleared</option></select></Field>
      <Field label="Category"><input value={r.category} onChange={(event) => set("category", event.target.value)} className={inputClass} /></Field>
      <Field label="Amount"><input type="number" value={r.amount} onChange={(event) => set("amount", Number(event.target.value))} className={inputClass} /></Field>
      <Field label="Date"><DateInput value={r.date} onChange={(event) => set("date", event.target.value)} /></Field>
      <Field label="Reference"><input value={r.reference} onChange={(event) => set("reference", event.target.value)} className={inputClass} /></Field>
      <Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className={textareaClass} /></Field>
    </>}

    {editor.tab === "settlements" && <>
      <Field label="Period start"><DateInput value={r.periodStart} onChange={(event) => set("periodStart", event.target.value)} /></Field>
      <Field label="Period end"><DateInput value={r.periodEnd} onChange={(event) => set("periodEnd", event.target.value)} /></Field>
      <Field label="Units"><input type="number" value={r.units} onChange={(event) => set("units", Number(event.target.value))} className={inputClass} /></Field>
      <Field label="Fee per unit"><input type="number" step="0.01" value={r.feePerUnit} onChange={(event) => set("feePerUnit", Number(event.target.value))} className={inputClass} /></Field>
      <Field label="Ad reimbursement"><input type="number" value={r.adReimbursement} onChange={(event) => set("adReimbursement", Number(event.target.value))} className={inputClass} /></Field>
      <Field label="Incentive"><input type="number" value={r.incentive} onChange={(event) => set("incentive", Number(event.target.value))} className={inputClass} /></Field>
      <Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className={selectClass}>{["Draft", "Verified", "Invoiced", "Paid"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Due date"><DateInput value={r.dueDate} onChange={(event) => set("dueDate", event.target.value)} /></Field>
      <Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className={textareaClass} /></Field>
    </>}

    {editor.tab === "projects" && <>
      <Field label="Project name" wide><input value={r.name} onChange={(event) => set("name", event.target.value)} className={inputClass} /></Field>
      <Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className={selectClass}>{["Planning", "Active", "Review", "Completed", "On hold"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label={`Progress: ${r.progress}%`}><input type="range" min="0" max="100" value={r.progress} onChange={(event) => set("progress", Number(event.target.value))} className="mt-4 w-full accent-[#ba5c42]" /></Field>
      <Field label="Budget"><input type="number" value={r.budget} onChange={(event) => set("budget", Number(event.target.value))} className={inputClass} /></Field>
      <Field label="Due date"><DateInput value={r.dueDate} onChange={(event) => set("dueDate", event.target.value)} /></Field>
      <Field label="Owner"><input value={r.owner} onChange={(event) => set("owner", event.target.value)} className={inputClass} /></Field>
      <Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className={textareaClass} /></Field>
    </>}

    {editor.tab === "onboarding" && <>
      <Field label="Blueprint"><select value={r.blueprint} onChange={(event) => set("blueprint", event.target.value)} className={selectClass}>{["General Client Onboarding", "E-commerce & Marketplace", "Website Development", "Marketing Campaign", "AI / Software Product", "Retainer Service"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className={selectClass}>{["Not started", "In progress", "Ready", "Completed"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Target launch"><DateInput value={r.targetLaunch} onChange={(event) => set("targetLaunch", event.target.value)} /></Field>
      <Field label="Checklist" wide><div className="space-y-2">{r.steps.map((step: any, index: number) => <div key={step.id} className="flex items-center gap-2"><input type="checkbox" checked={step.done} onChange={(event) => set("steps", r.steps.map((item: any) => item.id === step.id ? { ...item, done: event.target.checked } : item))} className="h-4 w-4 accent-[#ba5c42]" /><input value={step.label} onChange={(event) => set("steps", r.steps.map((item: any) => item.id === step.id ? { ...item, label: event.target.value } : item))} className={inputClass} /><Button variant="outline" size="icon" onClick={() => set("steps", r.steps.filter((item: any) => item.id !== step.id))}><Trash2 className="h-4 w-4 text-red-500" /></Button></div>)}<Button type="button" variant="outline" onClick={() => set("steps", [...r.steps, { id: businessId("step"), label: "New step", done: false }])}><Plus className="h-4 w-4" />Add step</Button></div></Field>
      <Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className={textareaClass} /></Field>
    </>}
  </div><div className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end"><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={onSave} disabled={saving}>{saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving ? "Saving…" : "Save record"}</Button></div></CardContent></Card></div>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  const control = isValidElement<{ value?: unknown; onChange?: (event: any) => void }>(children) ? children : null;
  const value = typeof control?.props.value === "string" ? control.props.value : "";
  const canImprove = control?.type === "textarea" && typeof control.props.onChange === "function";
  return <div className={cn("block text-sm font-medium", wide && "sm:col-span-2")}><div className="mb-2 flex min-h-8 items-center justify-between gap-2"><span>{label}</span>{canImprove && <AIWritingButton value={value} field={label} context="KretivOS business record. Preserve customer names, commercial values, dates, references and commitments." onApply={(next) => control.props.onChange?.({ target: { value: next }, currentTarget: { value: next } })} />}</div>{children}</div>;
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <Card className="bg-white/75"><CardContent className="p-5"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div><div className="mt-2 text-xs text-muted-foreground">{note}</div></CardContent></Card>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-[#f7f4ed] p-3"><div className="text-[10px] text-muted-foreground">{label}</div><div className="mt-1 truncate text-xs font-medium">{value}</div></div>;
}

function Badge({ value }: { value: string }) {
  const green = ["Active", "Paid", "Completed", "Won", "Cleared", "Primary", "Ready"].includes(value);
  const amber = ["Lead", "Draft", "Pending", "Review", "Verified", "In progress", "Proposal", "Negotiation"].includes(value);
  const red = ["Overdue", "Lost", "Cancelled", "Archived"].includes(value);
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium", green ? "bg-emerald-50 text-emerald-700" : red ? "bg-red-50 text-red-700" : amber ? "bg-amber-50 text-amber-700" : "bg-[#eeeae0] text-[#5a605a]")}>{value}</span>;
}

function RecordActions({ onEdit, onDelete, compact = false }: { onEdit: () => void; onDelete: () => void; compact?: boolean }) {
  return <div className={cn("flex gap-2", compact ? "sm:justify-end" : "mt-5")}><Button variant="outline" size={compact ? "icon" : "sm"} className={compact ? "" : "flex-1"} onClick={onEdit}><Pencil className="h-4 w-4" />{!compact && "Edit"}</Button><Button variant="outline" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4 text-red-500" /></Button></div>;
}

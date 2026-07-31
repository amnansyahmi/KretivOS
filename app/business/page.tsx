"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote, BriefcaseBusiness, Building2, Check, ChevronRight, CircleDollarSign,
  ClipboardCheck, FileText, HandCoins, Pencil, Plus, Search, Trash2, Users, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspacePage } from "@/components/workspace-page";
import {
  BUSINESS_STORAGE_KEY, CUSTOMER_STORAGE_KEY, FinanceTransaction, Onboarding,
  Opportunity, Project, SalesDocument, Settlement, businessId, starterBusinessData
} from "@/lib/business-data";
import { cn } from "@/lib/utils";

type Tab = "customers" | "crm" | "sales" | "finance" | "settlements" | "projects" | "onboarding";
type BusinessData = typeof starterBusinessData;
type EditorState = { tab: Tab; record: any; isNew: boolean } | null;

const tabs: { id: Tab; label: string; icon: any }[] = [
  { id: "customers", label: "Customers", icon: Building2 },
  { id: "crm", label: "CRM", icon: Users },
  { id: "sales", label: "Sales", icon: FileText },
  { id: "finance", label: "Finance", icon: CircleDollarSign },
  { id: "settlements", label: "Settlements", icon: HandCoins },
  { id: "projects", label: "Projects", icon: BriefcaseBusiness },
  { id: "onboarding", label: "Onboarding", icon: ClipboardCheck }
];

function loadData(): BusinessData {
  if (typeof window === "undefined") return starterBusinessData;
  const saved = localStorage.getItem(BUSINESS_STORAGE_KEY);
  if (!saved) return starterBusinessData;
  try {
    const parsed = JSON.parse(saved) as BusinessData;
    return parsed?.customers ? parsed : starterBusinessData;
  } catch {
    return starterBusinessData;
  }
}

function money(value: number) {
  return `RM${Number(value || 0).toLocaleString("en-MY", { maximumFractionDigits: 2 })}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function BusinessOperationsPage() {
  const [data, setData] = useState<BusinessData>(starterBusinessData);
  const [tab, setTab] = useState<Tab>("customers");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [notice, setNotice] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setData(loadData());
    const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (requested && tabs.some((item) => item.id === requested)) setTab(requested);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(BUSINESS_STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(data.customers));
  }, [data, mounted]);

  function changeTab(next: Tab) {
    setTab(next);
    setQuery("");
    setEditor(null);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url);
  }

  const customerName = (id: string) => data.customers.find((customer) => customer.id === id)?.name || "Unknown customer";
  const lowerQuery = query.toLowerCase().trim();
  const matches = (...values: unknown[]) => !lowerQuery || values.some((value) => String(value ?? "").toLowerCase().includes(lowerQuery));

  const stats = useMemo(() => {
    const pipeline = data.opportunities.filter((item) => !["Won", "Lost"].includes(item.stage)).reduce((sum, item) => sum + item.value * item.probability / 100, 0);
    const receivables = data.documents.filter((item) => ["Sent", "Approved", "Overdue"].includes(item.status) && item.type === "Invoice").reduce((sum, item) => sum + item.value, 0);
    const income = data.transactions.filter((item) => item.type === "Income" && item.status === "Cleared").reduce((sum, item) => sum + item.amount, 0);
    const expense = data.transactions.filter((item) => item.type === "Expense" && item.status === "Cleared").reduce((sum, item) => sum + item.amount, 0);
    return { pipeline, receivables, cash: income - expense, activeProjects: data.projects.filter((item) => item.status === "Active").length };
  }, [data]);

  function openCreate(target: Tab = tab) {
    if (target !== "customers" && data.customers.length === 0) {
      setNotice("Add a customer before creating linked business records.");
      changeTab("customers");
      return;
    }
    const firstCustomer = data.customers[0]?.id || "";
    const now = new Date().toISOString();
    const defaults: Record<Tab, any> = {
      customers: { id: businessId("customer"), name: "", legalName: "", industry: "", status: "Lead", contactName: "", email: "", phone: "", notes: "", createdAt: now, updatedAt: now },
      crm: { id: businessId("opp"), customerId: firstCustomer, title: "", stage: "New", value: 0, probability: 25, nextAction: "", dueDate: today(), notes: "", createdAt: now, updatedAt: now },
      sales: { id: businessId("doc"), customerId: firstCustomer, type: "Quotation", title: "", reference: "", status: "Draft", value: 0, issueDate: today(), dueDate: today(), notes: "", createdAt: now, updatedAt: now },
      finance: { id: businessId("txn"), customerId: firstCustomer, type: "Income", category: "", amount: 0, date: today(), status: "Pending", reference: "", notes: "", createdAt: now, updatedAt: now },
      settlements: { id: businessId("settlement"), customerId: firstCustomer, periodStart: today(), periodEnd: today(), units: 0, feePerUnit: 2, adReimbursement: 0, status: "Draft", dueDate: today(), notes: "", createdAt: now, updatedAt: now },
      projects: { id: businessId("project"), customerId: firstCustomer, name: "", status: "Planning", progress: 0, budget: 0, dueDate: today(), owner: "Kretivco Team", notes: "", createdAt: now, updatedAt: now },
      onboarding: { id: businessId("onboarding"), customerId: firstCustomer, blueprint: "E-commerce & Marketplace", status: "Not started", targetLaunch: today(), notes: "", steps: [
        { id: businessId("step"), label: "Customer profile", done: false },
        { id: businessId("step"), label: "Commercial agreement", done: false },
        { id: businessId("step"), label: "Brand DNA and assets", done: false },
        { id: businessId("step"), label: "Delivery setup", done: false },
        { id: businessId("step"), label: "Launch checklist", done: false }
      ], createdAt: now, updatedAt: now }
    };
    setEditor({ tab: target, record: defaults[target], isNew: true });
  }

  function openEdit(target: Tab, record: any) {
    setEditor({ tab: target, record: JSON.parse(JSON.stringify(record)), isNew: false });
  }

  function saveEditor() {
    if (!editor) return;
    const record = { ...editor.record, updatedAt: new Date().toISOString() };
    if (editor.tab === "customers" && !record.name.trim()) return;
    if (editor.tab !== "customers" && !record.customerId) return;
    const keyMap: Record<Tab, keyof BusinessData> = {
      customers: "customers", crm: "opportunities", sales: "documents", finance: "transactions",
      settlements: "settlements", projects: "projects", onboarding: "onboardings"
    };
    const key = keyMap[editor.tab];
    setData((current) => {
      const list = current[key] as any[];
      const next = editor.isNew ? [record, ...list] : list.map((item) => item.id === record.id ? record : item);
      return { ...current, [key]: next } as BusinessData;
    });
    setEditor(null);
    setNotice(editor.isNew ? "Record created." : "Record updated.");
  }

  function deleteRecord(target: Tab, id: string) {
    if (!window.confirm("Delete this record? This cannot be undone.")) return;
    if (target === "customers") {
      setData((current) => ({
        customers: current.customers.filter((item) => item.id !== id),
        opportunities: current.opportunities.filter((item) => item.customerId !== id),
        documents: current.documents.filter((item) => item.customerId !== id),
        transactions: current.transactions.filter((item) => item.customerId !== id),
        settlements: current.settlements.filter((item) => item.customerId !== id),
        projects: current.projects.filter((item) => item.customerId !== id),
        onboardings: current.onboardings.filter((item) => item.customerId !== id)
      }));
    } else {
      const keyMap: Record<Exclude<Tab, "customers">, keyof BusinessData> = {
        crm: "opportunities", sales: "documents", finance: "transactions", settlements: "settlements", projects: "projects", onboarding: "onboardings"
      };
      const key = keyMap[target as Exclude<Tab, "customers">];
      setData((current) => ({ ...current, [key]: (current[key] as any[]).filter((item) => item.id !== id) } as BusinessData));
    }
    setNotice("Record deleted.");
  }

  function markDocumentPaid(document: SalesDocument) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      documents: current.documents.map((item) => item.id === document.id ? { ...item, status: "Paid", updatedAt: now } : item),
      transactions: [{ id: businessId("txn"), customerId: document.customerId, type: "Income", category: document.type, amount: document.value, date: today(), status: "Cleared", reference: document.reference, notes: `Created from ${document.type}`, createdAt: now, updatedAt: now } as FinanceTransaction, ...current.transactions]
    }));
    setNotice("Document marked paid and income transaction created.");
  }

  function verifySettlement(settlement: Settlement) {
    setData((current) => ({ ...current, settlements: current.settlements.map((item) => item.id === settlement.id ? { ...item, status: item.status === "Draft" ? "Verified" : item.status === "Verified" ? "Invoiced" : "Paid", updatedAt: new Date().toISOString() } : item) }));
  }

  function settleAsPaid(settlement: Settlement) {
    const total = settlement.units * settlement.feePerUnit + settlement.adReimbursement;
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      settlements: current.settlements.map((item) => item.id === settlement.id ? { ...item, status: "Paid", updatedAt: now } : item),
      transactions: [{ id: businessId("txn"), customerId: settlement.customerId, type: "Income", category: "Settlement", amount: total, date: today(), status: "Cleared", reference: `SET-${settlement.periodEnd}`, notes: "Created from paid settlement", createdAt: now, updatedAt: now } as FinanceTransaction, ...current.transactions]
    }));
    setNotice("Settlement paid and finance transaction created.");
  }

  return (
    <WorkspacePage
      eyebrow="Connected business operations"
      title="Business Workspace"
      description="Customers are the master record. CRM, documents, finance, settlements, projects and onboarding are linked to an existing customer and remain editable across the PWA."
      actions={<Button onClick={() => openCreate()}><Plus className="h-4 w-4" />Add {tabs.find((item) => item.id === tab)?.label.slice(0, -1) || "record"}</Button>}
    >
      {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Weighted pipeline" value={money(stats.pipeline)} note={`${data.opportunities.length} opportunities`} />
        <Stat label="Receivables" value={money(stats.receivables)} note="Sent and overdue invoices" />
        <Stat label="Cleared cash position" value={money(stats.cash)} note="Income less expenses" />
        <Stat label="Active projects" value={String(stats.activeProjects)} note={`${data.projects.length} total projects`} />
      </div>

      <div className="mb-5 overflow-x-auto rounded-xl border bg-white/70 p-1.5">
        <div className="flex min-w-max gap-1">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => changeTab(id)} className={cn("flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition", tab === id ? "bg-[#202c25] text-white" : "text-muted-foreground hover:bg-[#f3efe6]")}><Icon className="h-4 w-4" />{label}</button>)}</div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border bg-white px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={`Search ${tabs.find((item) => item.id === tab)?.label.toLowerCase()}...`} /></div>
        <Button onClick={() => openCreate()} className="w-full sm:w-auto"><Plus className="h-4 w-4" />Create new</Button>
      </div>

      {tab === "customers" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.customers.filter((item) => matches(item.name, item.legalName, item.industry, item.contactName)).map((customer) => <Card key={customer.id} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eee9df]"><Building2 className="h-5 w-5 text-[#ba5c42]" /></div><Badge value={customer.status} /></div><h2 className="mt-5 text-xl font-semibold">{customer.name}</h2><p className="mt-1 text-xs text-muted-foreground">{customer.industry || "Industry not set"}</p><div className="mt-5 grid grid-cols-2 gap-2 text-xs"><Mini label="Contact" value={customer.contactName || "—"} /><Mini label="Email" value={customer.email || "—"} /></div><p className="mt-4 min-h-10 text-xs leading-5 text-muted-foreground">{customer.notes || "No notes."}</p><div className="mt-5 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => openEdit("customers", customer)}><Pencil className="h-4 w-4" />Edit</Button><Button variant="outline" size="icon" onClick={() => deleteRecord("customers", customer.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>)}</div>}

      {tab === "crm" && <div className="grid gap-4 lg:grid-cols-2">{data.opportunities.filter((item) => matches(item.title, customerName(item.customerId), item.stage, item.nextAction)).map((item) => <Card key={item.id} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-wider text-[#ba5c42]">{customerName(item.customerId)}</div><h3 className="mt-1 font-semibold">{item.title}</h3></div><Badge value={item.stage} /></div><div className="mt-5 grid grid-cols-3 gap-2"><Mini label="Value" value={money(item.value)} /><Mini label="Probability" value={`${item.probability}%`} /><Mini label="Due" value={item.dueDate || "—"} /></div><div className="mt-4 rounded-lg bg-[#f7f4ed] p-3 text-xs"><span className="text-muted-foreground">Next action</span><div className="mt-1 font-medium">{item.nextAction || "Not set"}</div></div><RecordActions onEdit={() => openEdit("crm", item)} onDelete={() => deleteRecord("crm", item.id)} /></CardContent></Card>)}</div>}

      {tab === "sales" && <div className="space-y-3">{data.documents.filter((item) => matches(item.title, item.reference, item.type, item.status, customerName(item.customerId))).map((item) => <Card key={item.id} className="bg-white/80"><CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_120px_140px_130px_auto] md:items-center"><div><div className="text-[10px] text-muted-foreground">{customerName(item.customerId)} · {item.reference || "No reference"}</div><div className="mt-1 font-semibold">{item.title}</div><div className="mt-1 text-xs text-muted-foreground">{item.type} · Due {item.dueDate || "—"}</div></div><Badge value={item.status} /><div className="font-semibold">{money(item.value)}</div><div className="text-xs text-muted-foreground">Issued {item.issueDate || "—"}</div><div className="flex flex-wrap gap-2 md:justify-end">{item.status !== "Paid" && item.type === "Invoice" && <Button size="sm" onClick={() => markDocumentPaid(item)}>Mark paid</Button>}<Button variant="outline" size="icon" onClick={() => openEdit("sales", item)}><Pencil className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => deleteRecord("sales", item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>)}</div>}

      {tab === "finance" && <div className="space-y-3">{data.transactions.filter((item) => matches(item.category, item.reference, item.type, item.status, customerName(item.customerId))).map((item) => <Card key={item.id} className="bg-white/80"><CardContent className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex items-start gap-4"><div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", item.type === "Income" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}><Banknote className="h-5 w-5" /></div><div><div className="text-[10px] text-muted-foreground">{customerName(item.customerId)} · {item.date}</div><div className="mt-1 font-semibold">{item.category}</div><div className="mt-1 text-xs text-muted-foreground">{item.reference || "No reference"} · {item.status}</div></div></div><div className="flex items-center justify-between gap-3 sm:justify-end"><div className={cn("text-lg font-semibold", item.type === "Income" ? "text-emerald-700" : "text-red-600")}>{item.type === "Income" ? "+" : "−"}{money(item.amount)}</div><Button variant="outline" size="icon" onClick={() => openEdit("finance", item)}><Pencil className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => deleteRecord("finance", item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>)}</div>}

      {tab === "settlements" && <div className="grid gap-4 lg:grid-cols-2">{data.settlements.filter((item) => matches(customerName(item.customerId), item.status, item.periodStart, item.periodEnd)).map((item) => { const total = item.units * item.feePerUnit + item.adReimbursement; return <Card key={item.id} className="bg-white/80"><CardHeader><div className="flex items-start justify-between"><div><div className="text-[10px] uppercase tracking-wider text-[#ba5c42]">{customerName(item.customerId)}</div><CardTitle className="mt-1">{item.periodStart} – {item.periodEnd}</CardTitle></div><Badge value={item.status} /></div></CardHeader><CardContent><div className="grid grid-cols-3 gap-2"><Mini label="Units" value={item.units.toLocaleString()} /><Mini label="Fee" value={money(item.units * item.feePerUnit)} /><Mini label="Ads" value={money(item.adReimbursement)} /></div><div className="mt-4 flex items-center justify-between rounded-xl bg-[#26342b] p-4 text-white"><span className="text-xs text-white/55">Total payable</span><span className="text-xl font-semibold">{money(total)}</span></div><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => openEdit("settlements", item)}><Pencil className="h-4 w-4" />Edit</Button>{item.status !== "Paid" && <Button variant="outline" onClick={() => verifySettlement(item)}><ChevronRight className="h-4 w-4" />Advance status</Button>}{item.status !== "Paid" && <Button onClick={() => settleAsPaid(item)}><Check className="h-4 w-4" />Mark paid</Button>}<Button variant="outline" size="icon" onClick={() => deleteRecord("settlements", item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>; })}</div>}

      {tab === "projects" && <div className="grid gap-4 md:grid-cols-2">{data.projects.filter((item) => matches(item.name, item.status, item.owner, customerName(item.customerId))).map((item) => <Card key={item.id} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between"><div><div className="text-[10px] uppercase tracking-wider text-[#ba5c42]">{customerName(item.customerId)}</div><h3 className="mt-1 font-semibold">{item.name}</h3><p className="mt-1 text-xs text-muted-foreground">Owner: {item.owner || "—"} · Due {item.dueDate || "—"}</p></div><Badge value={item.status} /></div><div className="mt-5 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#ece8de]"><div className="h-full rounded-full bg-[#ba5c42]" style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} /></div><span className="text-xs font-semibold">{item.progress}%</span></div><div className="mt-4 grid grid-cols-2 gap-2"><Mini label="Budget" value={money(item.budget)} /><Mini label="Status" value={item.status} /></div><RecordActions onEdit={() => openEdit("projects", item)} onDelete={() => deleteRecord("projects", item.id)} /></CardContent></Card>)}</div>}

      {tab === "onboarding" && <div className="grid gap-4 lg:grid-cols-2">{data.onboardings.filter((item) => matches(item.blueprint, item.status, customerName(item.customerId))).map((item) => { const completed = item.steps.filter((step) => step.done).length; const pct = item.steps.length ? Math.round(completed / item.steps.length * 100) : 0; return <Card key={item.id} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between"><div><div className="text-[10px] uppercase tracking-wider text-[#ba5c42]">{customerName(item.customerId)}</div><h3 className="mt-1 font-semibold">{item.blueprint}</h3><p className="mt-1 text-xs text-muted-foreground">Target launch {item.targetLaunch || "—"}</p></div><Badge value={item.status} /></div><div className="mt-5 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#ece8de]"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} /></div><span className="text-xs font-semibold">{pct}%</span></div><div className="mt-4 space-y-2">{item.steps.map((step) => <label key={step.id} className="flex items-center gap-3 rounded-lg border bg-white p-3 text-sm"><input type="checkbox" checked={step.done} onChange={() => setData((current) => ({ ...current, onboardings: current.onboardings.map((record) => record.id === item.id ? { ...record, status: "In progress", updatedAt: new Date().toISOString(), steps: record.steps.map((entry) => entry.id === step.id ? { ...entry, done: !entry.done } : entry) } : record) }))} className="accent-[#ba5c42]" />{step.label}</label>)}</div><RecordActions onEdit={() => openEdit("onboarding", item)} onDelete={() => deleteRecord("onboarding", item.id)} /></CardContent></Card>; })}</div>}

      {editor && <EditorModal editor={editor} customers={data.customers} onChange={(record) => setEditor({ ...editor, record })} onClose={() => setEditor(null)} onSave={saveEditor} />}
    </WorkspacePage>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <Card className="bg-white/80"><CardContent className="p-5"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-3 text-2xl font-semibold">{value}</div><div className="mt-2 text-xs text-muted-foreground">{note}</div></CardContent></Card>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg bg-[#f7f4ed] p-3"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 truncate text-xs font-semibold">{value}</div></div>;
}

function Badge({ value }: { value: string }) {
  const positive = ["Active", "Won", "Paid", "Cleared", "Completed", "Ready", "Approved", "Verified"].includes(value);
  const warning = ["Lead", "Proposal", "Negotiation", "Sent", "Invoiced", "Review", "In progress", "Pending", "Draft"].includes(value);
  return <span className={cn("inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium", positive ? "bg-emerald-50 text-emerald-700" : warning ? "bg-amber-50 text-amber-700" : "bg-[#eeeae0] text-[#5a605a]")}>{value}</span>;
}

function RecordActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return <div className="mt-5 flex gap-2"><Button variant="outline" className="flex-1" onClick={onEdit}><Pencil className="h-4 w-4" />Edit</Button><Button variant="outline" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4 text-red-500" /></Button></div>;
}

function EditorModal({ editor, customers, onChange, onClose, onSave }: { editor: NonNullable<EditorState>; customers: BusinessData["customers"]; onChange: (record: any) => void; onClose: () => void; onSave: () => void }) {
  const r = editor.record;
  const set = (key: string, value: any) => onChange({ ...r, [key]: value });
  return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"><Card className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-b-none bg-[#f7f4ed] shadow-2xl sm:rounded-xl"><CardHeader className="sticky top-0 z-10 flex-row items-start justify-between border-b bg-[#f7f4ed] p-4 sm:p-6"><div><CardTitle className="text-xl">{editor.isNew ? "Create" : "Edit"} {tabs.find((item) => item.id === editor.tab)?.label}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Changes are saved to the shared PWA business record.</p></div><Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button></CardHeader><CardContent className="p-4 sm:p-6"><div className="grid gap-4 sm:grid-cols-2">
    {editor.tab !== "customers" && <Field label="Customer"><select value={r.customerId} onChange={(event) => set("customerId", event.target.value)} className="input">{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field>}
    {editor.tab === "customers" && <><Field label="Customer / brand name"><input value={r.name} onChange={(event) => set("name", event.target.value)} className="input" /></Field><Field label="Legal name"><input value={r.legalName} onChange={(event) => set("legalName", event.target.value)} className="input" /></Field><Field label="Industry"><input value={r.industry} onChange={(event) => set("industry", event.target.value)} className="input" /></Field><Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className="input">{["Lead", "Active", "Paused", "Archived"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Primary contact"><input value={r.contactName} onChange={(event) => set("contactName", event.target.value)} className="input" /></Field><Field label="Email"><input type="email" value={r.email} onChange={(event) => set("email", event.target.value)} className="input" /></Field><Field label="Phone"><input value={r.phone} onChange={(event) => set("phone", event.target.value)} className="input" /></Field><Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className="textarea" /></Field></>}
    {editor.tab === "crm" && <><Field label="Opportunity title"><input value={r.title} onChange={(event) => set("title", event.target.value)} className="input" /></Field><Field label="Stage"><select value={r.stage} onChange={(event) => set("stage", event.target.value)} className="input">{["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Value"><input type="number" value={r.value} onChange={(event) => set("value", Number(event.target.value))} className="input" /></Field><Field label={`Probability: ${r.probability}%`}><input type="range" min="0" max="100" value={r.probability} onChange={(event) => set("probability", Number(event.target.value))} className="mt-4 w-full accent-[#ba5c42]" /></Field><Field label="Next action"><input value={r.nextAction} onChange={(event) => set("nextAction", event.target.value)} className="input" /></Field><Field label="Due date"><input type="date" value={r.dueDate} onChange={(event) => set("dueDate", event.target.value)} className="input" /></Field><Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className="textarea" /></Field></>}
    {editor.tab === "sales" && <><Field label="Document type"><select value={r.type} onChange={(event) => set("type", event.target.value)} className="input">{["Proposal", "Quotation", "Sales Order", "Invoice", "Receipt", "Credit Note", "MoU"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className="input">{["Draft", "Sent", "Approved", "Paid", "Overdue", "Cancelled"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Title" wide><input value={r.title} onChange={(event) => set("title", event.target.value)} className="input" /></Field><Field label="Reference"><input value={r.reference} onChange={(event) => set("reference", event.target.value)} className="input" /></Field><Field label="Value"><input type="number" value={r.value} onChange={(event) => set("value", Number(event.target.value))} className="input" /></Field><Field label="Issue date"><input type="date" value={r.issueDate} onChange={(event) => set("issueDate", event.target.value)} className="input" /></Field><Field label="Due date"><input type="date" value={r.dueDate} onChange={(event) => set("dueDate", event.target.value)} className="input" /></Field><Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className="textarea" /></Field></>}
    {editor.tab === "finance" && <><Field label="Type"><select value={r.type} onChange={(event) => set("type", event.target.value)} className="input"><option>Income</option><option>Expense</option></select></Field><Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className="input"><option>Pending</option><option>Cleared</option></select></Field><Field label="Category"><input value={r.category} onChange={(event) => set("category", event.target.value)} className="input" /></Field><Field label="Amount"><input type="number" value={r.amount} onChange={(event) => set("amount", Number(event.target.value))} className="input" /></Field><Field label="Date"><input type="date" value={r.date} onChange={(event) => set("date", event.target.value)} className="input" /></Field><Field label="Reference"><input value={r.reference} onChange={(event) => set("reference", event.target.value)} className="input" /></Field><Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className="textarea" /></Field></>}
    {editor.tab === "settlements" && <><Field label="Period start"><input type="date" value={r.periodStart} onChange={(event) => set("periodStart", event.target.value)} className="input" /></Field><Field label="Period end"><input type="date" value={r.periodEnd} onChange={(event) => set("periodEnd", event.target.value)} className="input" /></Field><Field label="Units"><input type="number" value={r.units} onChange={(event) => set("units", Number(event.target.value))} className="input" /></Field><Field label="Fee per unit"><input type="number" step="0.01" value={r.feePerUnit} onChange={(event) => set("feePerUnit", Number(event.target.value))} className="input" /></Field><Field label="Ad reimbursement"><input type="number" value={r.adReimbursement} onChange={(event) => set("adReimbursement", Number(event.target.value))} className="input" /></Field><Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className="input">{["Draft", "Verified", "Invoiced", "Paid"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Due date"><input type="date" value={r.dueDate} onChange={(event) => set("dueDate", event.target.value)} className="input" /></Field><Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className="textarea" /></Field></>}
    {editor.tab === "projects" && <><Field label="Project name" wide><input value={r.name} onChange={(event) => set("name", event.target.value)} className="input" /></Field><Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className="input">{["Planning", "Active", "Review", "Completed", "On hold"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label={`Progress: ${r.progress}%`}><input type="range" min="0" max="100" value={r.progress} onChange={(event) => set("progress", Number(event.target.value))} className="mt-4 w-full accent-[#ba5c42]" /></Field><Field label="Budget"><input type="number" value={r.budget} onChange={(event) => set("budget", Number(event.target.value))} className="input" /></Field><Field label="Due date"><input type="date" value={r.dueDate} onChange={(event) => set("dueDate", event.target.value)} className="input" /></Field><Field label="Owner"><input value={r.owner} onChange={(event) => set("owner", event.target.value)} className="input" /></Field><Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className="textarea" /></Field></>}
    {editor.tab === "onboarding" && <><Field label="Blueprint"><select value={r.blueprint} onChange={(event) => set("blueprint", event.target.value)} className="input">{["E-commerce & Marketplace", "Corporate Website", "AI Product", "Marketing Retainer", "Branding", "Custom Software"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Status"><select value={r.status} onChange={(event) => set("status", event.target.value)} className="input">{["Not started", "In progress", "Ready", "Completed"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Target launch"><input type="date" value={r.targetLaunch} onChange={(event) => set("targetLaunch", event.target.value)} className="input" /></Field><Field label="Notes" wide><textarea value={r.notes} onChange={(event) => set("notes", event.target.value)} className="textarea" /></Field><div className="sm:col-span-2"><div className="mb-2 text-xs font-medium">Checklist</div><div className="space-y-2">{r.steps.map((step: any) => <div key={step.id} className="flex items-center gap-2"><input type="checkbox" checked={step.done} onChange={() => set("steps", r.steps.map((item: any) => item.id === step.id ? { ...item, done: !item.done } : item))} className="accent-[#ba5c42]" /><input value={step.label} onChange={(event) => set("steps", r.steps.map((item: any) => item.id === step.id ? { ...item, label: event.target.value } : item))} className="input flex-1" /><button onClick={() => set("steps", r.steps.filter((item: any) => item.id !== step.id))} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>)}</div><button onClick={() => set("steps", [...r.steps, { id: businessId("step"), label: "New step", done: false }])} className="mt-3 text-xs font-semibold text-[#ba5c42]">+ Add checklist step</button></div></>}
  </div><div className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSave}><Check className="h-4 w-4" />Save record</Button></div></CardContent></Card><style jsx global>{`.input{height:2.75rem;width:100%;border-radius:.65rem;border:1px solid hsl(var(--border));background:white;padding:0 .8rem;font-size:.875rem;outline:none}.textarea{min-height:6rem;width:100%;resize:vertical;border-radius:.65rem;border:1px solid hsl(var(--border));background:white;padding:.75rem .8rem;font-size:.875rem;outline:none}.input:focus,.textarea:focus{box-shadow:0 0 0 3px rgba(186,92,66,.12);border-color:rgba(186,92,66,.55)}`}</style></div>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={cn("block text-xs font-medium", wide && "sm:col-span-2")}>{label}<div className="mt-2">{children}</div></label>;
}

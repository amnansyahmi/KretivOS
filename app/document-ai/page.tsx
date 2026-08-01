"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BriefcaseBusiness, Check, ChevronLeft, ClipboardList, FileCheck2,
  FileText, Loader2, Plus, RefreshCw, Save, Sparkles, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/date-input";
import { WorkspacePage } from "@/components/workspace-page";
import { cn } from "@/lib/utils";

type Customer = { id: string; name: string; industry: string; notes: string };
type Opportunity = { id: string; customerId: string; title: string; stage: string; value: number; probability: number; nextAction: string; dueDate: string; notes: string };
type LineItem = { id: string; description: string; quantity: number; unit: string; unitPrice: number };
type Draft = {
  packageId: string; source: "ai-nonymauz-cloud" | "starter"; summary: string;
  proposal: { title: string; executiveSummary: string; observations: string; objectives: string[]; strategy: string; scope: string[]; timeline: string };
  quotation: { title: string; scope: string; items: LineItem[]; terms: string[]; validityDays: number };
  onboarding: { blueprint: string; notes: string; steps: string[] };
  projectBrief: { title: string; background: string; objective: string; deliverables: string[]; timeline: string; responsibilities: string[]; risks: string[]; successMetrics: string[] };
};
type Form = { customerId: string; opportunityId: string; projectTitle: string; objectives: string; scopeNotes: string; budget: string; mediaBudget: string; targetLaunch: string; validityDays: string };
type ReviewTab = "proposal" | "quotation" | "onboarding" | "project";

const emptyForm: Form = { customerId: "", opportunityId: "", projectTitle: "", objectives: "", scopeNotes: "", budget: "", mediaBudget: "", targetLaunch: "", validityDays: "14" };
const money = (value: number | string) => `RM${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toLines = (value: string) => value.split(/\n+/).map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
const fromLines = (value: string[]) => value.join("\n");
const id = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}`;

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export default function DocumentAiPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<ReviewTab>("proposal");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<{ ids: Record<string, string>; message: string } | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [business] = await Promise.all([
        jsonRequest("/api/business", { cache: "no-store" }),
        // This also ensures all reusable templates, including Project Brief, exist.
        jsonRequest("/api/templates", { cache: "no-store" }),
      ]);
      setCustomers(business.customers || []);
      setOpportunities(business.opportunities || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load client records."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const clientOpportunities = useMemo(() => opportunities.filter((item) => item.customerId === form.customerId), [opportunities, form.customerId]);
  const selectedCustomer = customers.find((item) => item.id === form.customerId);
  const selectedOpportunity = opportunities.find((item) => item.id === form.opportunityId);
  const total = Number(form.budget || 0) + Number(form.mediaBudget || 0);

  function chooseCustomer(customerId: string) {
    setForm({ ...emptyForm, customerId });
    setDraft(null); setSaved(null); setError("");
  }
  function chooseOpportunity(opportunityId: string) {
    const opportunity = opportunities.find((item) => item.id === opportunityId);
    setForm((current) => ({
      ...current, opportunityId,
      projectTitle: opportunity?.title || current.projectTitle,
      objectives: opportunity?.nextAction || current.objectives,
      scopeNotes: opportunity?.notes || current.scopeNotes,
      budget: opportunity?.value ? String(opportunity.value) : current.budget,
      targetLaunch: opportunity?.dueDate || current.targetLaunch,
    }));
  }

  async function generate() {
    if (!form.customerId || !form.projectTitle.trim()) { setError("Select a client and enter the engagement title."); return; }
    setGenerating(true); setError(""); setNotice(""); setSaved(null);
    try {
      const result = await jsonRequest("/api/ai/proposal-package", { method: "POST", body: JSON.stringify({ action: "generate", ...form }) });
      setDraft(result.draft); setTab("proposal");
      setNotice(result.draft.source === "ai-nonymauz-cloud" ? "Package generated by ai-nonymauz-cloud. Review every section before saving." : "AI was unavailable, so KretivOS created a structured starter package for review.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to generate the proposal package."); }
    finally { setGenerating(false); }
  }

  async function savePackage() {
    if (!draft) return;
    if (!window.confirm("Save the reviewed proposal, quotation, onboarding and project records as drafts?")) return;
    setSaving(true); setError("");
    try {
      const result = await jsonRequest("/api/ai/proposal-package", { method: "POST", body: JSON.stringify({ action: "save", customerId: form.customerId, budget: form.budget, mediaBudget: form.mediaBudget, targetLaunch: form.targetLaunch, draft }) });
      setSaved(result); setNotice(result.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save the package."); }
    finally { setSaving(false); }
  }

  return <WorkspacePage
    eyebrow="Grounded commercial workflow"
    title="AI Proposal Package"
    description="Turn one CRM opportunity into a coherent proposal, quotation, onboarding checklist and delivery brief. AI drafts; the Kretivco team reviews and approves."
    actions={<div className="flex gap-2"><Button variant="outline" className="bg-white" onClick={load} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Button>{draft && <Button onClick={savePackage} disabled={saving || Boolean(saved)}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}{saved ? "Saved as drafts" : saving ? "Saving…" : "Save package"}</Button>}</div>}
  >
    {notice && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}
    {error && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}

    {saved && <Card className="mb-5 border-emerald-200 bg-emerald-50"><CardContent className="p-5"><div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white"><Check className="h-5 w-5" /></div><div className="flex-1"><div className="font-semibold text-emerald-900">Document package created</div><p className="mt-1 text-xs leading-5 text-emerald-800">Everything remains in Draft, Planning or Not started status. Open each workspace to review before approval or sending.</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" className="bg-white" asChild><Link href="/documents?section=documents">Review documents <ArrowRight className="h-3.5 w-3.5" /></Link></Button><Button variant="outline" size="sm" className="bg-white" asChild><Link href="/sales?tab=sales">Sales records</Link></Button><Button variant="outline" size="sm" className="bg-white" asChild><Link href="/sales?tab=onboarding">Onboarding</Link></Button><Button variant="outline" size="sm" className="bg-white" asChild><Link href="/sales?tab=projects">Project</Link></Button></div></div></div></CardContent></Card>}

    <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
      <Card className="h-fit bg-white/80"><CardHeader className="border-b p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#202c25] text-white"><BriefcaseBusiness className="h-4 w-4" /></div><div><CardTitle>1. Engagement brief</CardTitle><p className="mt-1 text-xs text-muted-foreground">Commercial facts stay under your control.</p></div></div></CardHeader><CardContent className="space-y-4 p-5">
        <Field label="Client"><Select value={form.customerId} onChange={(event) => chooseCustomer(event.target.value)} ><option value="">Select client</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</Select></Field>
        <Field label="CRM opportunity"><Select value={form.opportunityId} onChange={(event) => chooseOpportunity(event.target.value)} disabled={!form.customerId}><option value="">Use latest client context</option>{clientOpportunities.map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.title} · {opportunity.stage}</option>)}</Select></Field>
        <Field label="Engagement title"><Input value={form.projectTitle} onChange={(event) => setForm({ ...form, projectTitle: event.target.value })} placeholder="e.g. Chef Ammar marketplace launch" /></Field>
        <Field label="Objective"><Textarea value={form.objectives} onChange={(event) => setForm({ ...form, objectives: event.target.value })} placeholder="One objective per line" /></Field>
        <Field label="Known scope"><Textarea value={form.scopeNotes} onChange={(event) => setForm({ ...form, scopeNotes: event.target.value })} className="min-h-28" placeholder="Only confirmed deliverables and constraints" /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Service fee (RM)"><Input type="number" min="0" step="0.01" value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} /></Field><Field label="Media budget (RM)"><Input type="number" min="0" step="0.01" value={form.mediaBudget} onChange={(event) => setForm({ ...form, mediaBudget: event.target.value })} /></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Target launch"><DateInput value={form.targetLaunch} onChange={(event) => setForm({ ...form, targetLaunch: event.target.value })} /></Field><Field label="Quote validity"><Select value={form.validityDays} onChange={(event) => setForm({ ...form, validityDays: event.target.value })} ><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></Select></Field></div>
        <div className="rounded-xl border bg-[#f7f4ed] p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Commercial total</div><div className="mt-1 text-xl font-semibold">{money(total)}</div><div className="mt-1 text-[10px] text-muted-foreground">AI cannot change this amount.</div></div>
        <Button className="w-full" onClick={generate} disabled={generating || loading || !form.customerId}>{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{generating ? "Building grounded package…" : "Generate proposal package"}</Button>
        {selectedCustomer && <div className="text-[10px] leading-5 text-muted-foreground">Context: {selectedCustomer.name}{selectedCustomer.industry ? ` · ${selectedCustomer.industry}` : ""}{selectedOpportunity ? ` · ${selectedOpportunity.stage} opportunity at ${selectedOpportunity.probability}%` : ""}</div>}
      </CardContent></Card>

      <div className="min-w-0">
        {!draft ? <EmptyState /> : <Card className="overflow-hidden bg-white/80"><CardHeader className="border-b p-0"><div className="p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#ba5c42]">2. Human review</div><CardTitle className="mt-2 text-xl">{draft.summary}</CardTitle></div><span className={cn("w-fit rounded-full px-2.5 py-1 text-[10px]", draft.source === "ai-nonymauz-cloud" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{draft.source}</span></div></div><div className="flex overflow-x-auto border-t bg-[#fbfaf7] p-1.5">{([
          ["proposal", "Proposal", FileText], ["quotation", "Quotation", FileCheck2], ["onboarding", "Onboarding", ClipboardList], ["project", "Project brief", BriefcaseBusiness],
        ] as const).map(([key, label, Icon]) => <button key={key} onClick={() => setTab(key)} className={cn("flex min-h-11 min-w-[130px] flex-1 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium", tab === key ? "bg-[#202c25] text-white" : "text-muted-foreground hover:bg-white")}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div></CardHeader><CardContent className="p-4 sm:p-6">
          {tab === "proposal" && <ProposalReview draft={draft} setDraft={setDraft} />}
          {tab === "quotation" && <QuotationReview draft={draft} setDraft={setDraft} />}
          {tab === "onboarding" && <OnboardingReview draft={draft} setDraft={setDraft} />}
          {tab === "project" && <ProjectReview draft={draft} setDraft={setDraft} />}
          <div className="mt-6 flex flex-col justify-between gap-3 border-t pt-5 sm:flex-row sm:items-center"><p className="max-w-xl text-[10px] leading-5 text-muted-foreground">Saving creates linked draft records only. It does not send a document, approve commercial terms or start delivery.</p><Button onClick={savePackage} disabled={saving || Boolean(saved)}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saved ? "Package saved" : "Save reviewed drafts"}</Button></div>
        </CardContent></Card>}
      </div>
    </div>
  </WorkspacePage>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <Label className="block text-[#4e5a52]">{label}<div className="mt-2">{children}</div></Label>; }
function EmptyState() { return <Card className="bg-white/80"><CardContent className="flex min-h-[600px] flex-col items-center justify-center p-8 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eee9df]"><Sparkles className="h-6 w-6 text-[#ba5c42]" /></div><h2 className="mt-5 text-xl font-semibold">One brief, four connected records</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Select a client and opportunity. KretivOS will ground the package in CRM, Brand DNA and linked knowledge before generating anything.</p><div className="mt-7 grid w-full max-w-lg grid-cols-2 gap-2 text-left text-xs"><PreviewItem label="Client proposal" /><PreviewItem label="Editable quotation" /><PreviewItem label="Onboarding checklist" /><PreviewItem label="Project brief" /></div></CardContent></Card>; }
function PreviewItem({ label }: { label: string }) { return <div className="flex items-center gap-2 rounded-xl border bg-white p-3"><Check className="h-3.5 w-3.5 text-emerald-600" />{label}</div>; }
function ReviewField({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) { return <Field label={label}><Textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} /></Field>; }

function ProposalReview({ draft, setDraft }: { draft: Draft; setDraft: (draft: Draft) => void }) {
  const update = (patch: Partial<Draft["proposal"]>) => setDraft({ ...draft, proposal: { ...draft.proposal, ...patch } });
  return <div className="space-y-4"><Field label="Document title"><Input value={draft.proposal.title} onChange={(event) => update({ title: event.target.value })} /></Field><ReviewField label="Executive summary" value={draft.proposal.executiveSummary} onChange={(value) => update({ executiveSummary: value })} /><ReviewField label="Observations" value={draft.proposal.observations} onChange={(value) => update({ observations: value })} /><ReviewField label="Objectives · one per line" value={fromLines(draft.proposal.objectives)} onChange={(value) => update({ objectives: toLines(value) })} /><ReviewField label="Strategy" value={draft.proposal.strategy} onChange={(value) => update({ strategy: value })} rows={5} /><ReviewField label="Scope · one item per line" value={fromLines(draft.proposal.scope)} onChange={(value) => update({ scope: toLines(value) })} /><ReviewField label="Timeline" value={draft.proposal.timeline} onChange={(value) => update({ timeline: value })} /></div>;
}
function QuotationReview({ draft, setDraft }: { draft: Draft; setDraft: (draft: Draft) => void }) {
  const update = (patch: Partial<Draft["quotation"]>) => setDraft({ ...draft, quotation: { ...draft.quotation, ...patch } });
  const updateItem = (index: number, patch: Partial<LineItem>) => update({ items: draft.quotation.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  const quotationTotal = draft.quotation.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  return <div className="space-y-4"><Field label="Quotation title"><Input value={draft.quotation.title} onChange={(event) => update({ title: event.target.value })} /></Field><ReviewField label="Scope summary" value={draft.quotation.scope} onChange={(value) => update({ scope: value })} />
    <div><div className="flex items-center justify-between"><div className="text-xs font-medium text-[#4e5a52]">Line items</div><Button variant="outline" size="sm" onClick={() => update({ items: [...draft.quotation.items, { id: id(), description: "", quantity: 1, unit: "item", unitPrice: 0 }] })}><Plus className="h-3.5 w-3.5" />Add item</Button></div><div className="mt-2 space-y-2">{draft.quotation.items.map((item, index) => <div key={item.id} className="grid gap-2 rounded-xl border bg-[#fbfaf7] p-3 sm:grid-cols-[minmax(0,1fr)_80px_90px_120px_auto]"><Input value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} placeholder="Description" /><Input type="number" min="0" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} /><Input value={item.unit} onChange={(event) => updateItem(index, { unit: event.target.value })} placeholder="unit" /><Input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(index, { unitPrice: Number(event.target.value) })} /><Button variant="ghost" size="icon" onClick={() => update({ items: draft.quotation.items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-4 w-4 text-red-500" /></Button></div>)}</div></div>
    <div className="rounded-xl border bg-[#202c25] p-4 text-white"><div className="text-[10px] uppercase tracking-wider text-white/45">Reviewed quotation total</div><div className="mt-1 text-2xl font-semibold">{money(quotationTotal)}</div><div className="mt-1 text-[10px] text-white/45">Calculated only from the editable line items above.</div></div><ReviewField label="Terms · one per line" value={fromLines(draft.quotation.terms)} onChange={(value) => update({ terms: toLines(value) })} /></div>;
}
function OnboardingReview({ draft, setDraft }: { draft: Draft; setDraft: (draft: Draft) => void }) {
  const update = (patch: Partial<Draft["onboarding"]>) => setDraft({ ...draft, onboarding: { ...draft.onboarding, ...patch } });
  return <div className="space-y-4"><Field label="Onboarding blueprint"><Input value={draft.onboarding.blueprint} onChange={(event) => update({ blueprint: event.target.value })} /></Field><ReviewField label="Internal notes" value={draft.onboarding.notes} onChange={(value) => update({ notes: value })} /><ReviewField label="Checklist · one step per line" value={fromLines(draft.onboarding.steps)} onChange={(value) => update({ steps: toLines(value) })} rows={12} /></div>;
}
function ProjectReview({ draft, setDraft }: { draft: Draft; setDraft: (draft: Draft) => void }) {
  const update = (patch: Partial<Draft["projectBrief"]>) => setDraft({ ...draft, projectBrief: { ...draft.projectBrief, ...patch } });
  return <div className="space-y-4"><Field label="Project name"><Input value={draft.projectBrief.title} onChange={(event) => update({ title: event.target.value })} /></Field><ReviewField label="Background" value={draft.projectBrief.background} onChange={(value) => update({ background: value })} /><ReviewField label="Objective" value={draft.projectBrief.objective} onChange={(value) => update({ objective: value })} /><ReviewField label="Deliverables · one per line" value={fromLines(draft.projectBrief.deliverables)} onChange={(value) => update({ deliverables: toLines(value) })} /><ReviewField label="Timeline" value={draft.projectBrief.timeline} onChange={(value) => update({ timeline: value })} /><ReviewField label="Responsibilities · one per line" value={fromLines(draft.projectBrief.responsibilities)} onChange={(value) => update({ responsibilities: toLines(value) })} /><ReviewField label="Risks · one per line" value={fromLines(draft.projectBrief.risks)} onChange={(value) => update({ risks: toLines(value) })} /><ReviewField label="Success metrics · one per line" value={fromLines(draft.projectBrief.successMetrics)} onChange={(value) => update({ successMetrics: toLines(value) })} /></div>;
}

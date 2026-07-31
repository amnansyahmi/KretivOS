"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, List, Pencil, Plus, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownPreview } from "@/components/markdown-preview";
import { WorkspacePage } from "@/components/workspace-page";
import { cn } from "@/lib/utils";

type Template = {
  id: string;
  name: string;
  category: string;
  client: string;
  description: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type GeneratedDocument = {
  id: string;
  templateId: string;
  templateName: string;
  title: string;
  content: string;
  createdAt: string;
};

const STORAGE_KEY = "kretivos-templates";
const DOC_KEY = "kretivos-generated-documents";

const starterTemplates: Template[] = [
  {
    id: "tpl-proposal",
    name: "Kretivco Marketing Proposal",
    category: "Proposal",
    client: "Reusable",
    description: "Structured campaign proposal with objective, scope, investment, timeline and approval.",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# CADANGAN KEMPEN PEMASARAN

**Reference No.:** {{reference_no}}  
**Tarikh:** {{date}}  
**Untuk:** {{client_name}}  
**Daripada:** Kretivco Mediaworks

## 1. Ringkasan Cadangan

{{executive_summary}}

## 2. Objektif

{{objectives}}

## 3. Strategi Kempen

{{strategy}}

## 4. Skop Kerja Kretivco

{{scope}}

## 5. Jadual Pelaksanaan

{{timeline}}

## 6. Pelaburan

**Yuran Kretivco:** {{management_fee}}  
**Bajet media:** {{media_budget}}  
**Jumlah:** {{total_investment}}

## 7. Langkah Seterusnya

{{next_steps}}

Yang benar,  
{{signatory_name}}  
{{signatory_title}}  
Kretivco Mediaworks`,
  },
  {
    id: "tpl-quotation",
    name: "Quotation",
    category: "Sales",
    client: "Reusable",
    description: "Commercial quotation with customer, line items, terms and validity.",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# QUOTATION

**Quotation No.:** {{quotation_no}}  
**Date:** {{date}}  
**Valid Until:** {{valid_until}}

## Bill To

**{{client_name}}**  
{{client_address}}  
Attn: {{client_contact}}

## Scope / Items

{{line_items}}

## Total

**Grand Total: {{grand_total}}**

## Terms

- Payment terms: {{payment_terms}}
- Delivery timeline: {{delivery_timeline}}
- Additional terms: {{additional_terms}}

Prepared by: {{prepared_by}}`,
  },
  {
    id: "tpl-invoice",
    name: "Invoice & Receipt",
    category: "Finance",
    client: "Reusable",
    description: "Invoice template suitable for project billing or weekly settlements.",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# INVOICE

**Invoice No.:** {{invoice_no}}  
**Invoice Date:** {{date}}  
**Due Date:** {{due_date}}

## Customer

{{client_name}}  
{{client_address}}

## Description

{{description}}

## Amount

**Subtotal:** {{subtotal}}  
**Tax:** {{tax}}  
**Total Due:** {{total_due}}

## Payment

{{payment_instructions}}

Status: {{payment_status}}`,
  },
  {
    id: "tpl-memo",
    name: "Internal Memo",
    category: "Internal",
    client: "Kretivco",
    description: "Approval-ready internal memo with decision and action sections.",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# INTERNAL MEMO

**Reference:** {{reference_no}}  
**Date:** {{date}}  
**To:** {{recipients}}  
**From:** {{sender}}  
**Subject:** {{subject}}

## Purpose

{{purpose}}

## Background

{{background}}

## Decision / Request

{{decision_request}}

## Required Actions

{{actions}}

## Approval

{{approval_section}}`,
  },
  {
    id: "tpl-marketing-plan",
    name: "Marketing Plan",
    category: "Strategy",
    client: "Reusable",
    description: "Complete plan covering audience, positioning, funnel, channels, KPIs and budget.",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# {{campaign_name}} — Marketing Plan

## Executive Summary

{{executive_summary}}

## Business Objective

{{business_objective}}

## Audience

{{audience}}

## Positioning & Message

{{positioning}}

## Funnel

### TOFU
{{tofu}}

### MOFU
{{mofu}}

### BOFU
{{bofu}}

### Retention
{{retention}}

## Channel Plan

{{channel_plan}}

## Budget

{{budget}}

## KPIs & Reporting

{{kpis}}`,
  },
  {
    id: "tpl-storyboard",
    name: "Video Storyboard",
    category: "Creative",
    client: "Reusable",
    description: "Scene-by-scene production structure for video planning.",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# {{video_title}} — Storyboard

**Client:** {{client_name}}  
**Campaign:** {{campaign_name}}  
**Duration:** {{duration}}  
**Aspect Ratio:** {{aspect_ratio}}

## Creative Direction

{{creative_direction}}

## Scene 1 — Hook

{{scene_1}}

## Scene 2 — Product / Problem

{{scene_2}}

## Scene 3 — Proof / Experience

{{scene_3}}

## Scene 4 — Offer

{{scene_4}}

## Scene 5 — CTA

{{scene_5}}

## Production Notes

{{production_notes}}`,
  },
];

const emptyTemplate: Template = {
  id: "",
  name: "",
  category: "General",
  client: "Reusable",
  description: "",
  content: "# {{document_title}}\n\n{{content}}",
  createdAt: "",
  updatedAt: "",
};

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function placeholders(content: string) {
  return Array.from(new Set(Array.from(content.matchAll(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g)).map((match) => match[1])));
}

function prettyLabel(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function replaceVariables(content: string, values: Record<string, string>) {
  return content.replace(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g, (_, key) => values[key] || `{{${key}}}`);
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>(starterTemplates);
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [selectedId, setSelectedId] = useState(starterTemplates[0].id);
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Template>(emptyTemplate);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [documentTitle, setDocumentTitle] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedDocs = localStorage.getItem(DOC_KEY);
    if (saved) { try { const parsed = JSON.parse(saved) as Template[]; if (Array.isArray(parsed)) { setTemplates(parsed); setSelectedId(parsed[0]?.id || ""); } } catch {} }
    if (savedDocs) { try { const parsed = JSON.parse(savedDocs) as GeneratedDocument[]; if (Array.isArray(parsed)) setDocuments(parsed); } catch {} }
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(templates)); }, [templates]);
  useEffect(() => { localStorage.setItem(DOC_KEY, JSON.stringify(documents)); }, [documents]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase();
    return templates.filter((template) => !term || [template.name, template.category, template.client, template.description, template.content].some((value) => value.toLowerCase().includes(term)));
  }, [templates, query]);
  const selected = templates.find((template) => template.id === selectedId) || filtered[0] || templates[0];
  const variables = selected ? placeholders(selected.content) : [];
  const generatedContent = selected ? replaceVariables(selected.content, values) : "";

  function openCreate() {
    setDraft({ ...emptyTemplate });
    setEditorOpen(true);
  }

  function openEdit() {
    if (!selected) return;
    setDraft({ ...selected });
    setEditorOpen(true);
  }

  function saveTemplate() {
    if (!draft.name.trim() || !draft.content.trim()) return;
    const now = new Date().toISOString();
    if (draft.id) {
      const updated = { ...draft, name: draft.name.trim(), category: draft.category.trim() || "General", client: draft.client.trim() || "Reusable", updatedAt: now };
      setTemplates((current) => current.map((template) => template.id === updated.id ? updated : template));
      setNotice("Template updated.");
    } else {
      const created: Template = { ...draft, id: uid(), name: draft.name.trim(), category: draft.category.trim() || "General", client: draft.client.trim() || "Reusable", createdAt: now, updatedAt: now };
      setTemplates((current) => [created, ...current]);
      setSelectedId(created.id);
      setShowList(false);
      setNotice("Template created.");
    }
    setEditorOpen(false);
  }

  function deleteTemplate() {
    if (!selected || !window.confirm(`Delete “${selected.name}”?`)) return;
    const remaining = templates.filter((template) => template.id !== selected.id);
    setTemplates(remaining);
    setSelectedId(remaining[0]?.id || "");
    setShowList(true);
    setNotice("Template deleted.");
  }

  function openBuilder() {
    if (!selected) return;
    const initial = Object.fromEntries(placeholders(selected.content).map((key) => [key, ""]));
    setValues(initial);
    setDocumentTitle(`${selected.name} · ${new Date().toLocaleDateString("en-MY")}`);
    setBuilderOpen(true);
  }

  function saveGeneratedDocument() {
    if (!selected || !documentTitle.trim()) return;
    const document: GeneratedDocument = { id: uid(), templateId: selected.id, templateName: selected.name, title: documentTitle.trim(), content: generatedContent, createdAt: new Date().toISOString() };
    setDocuments((current) => [document, ...current]);
    setNotice("Generated document saved locally.");
  }

  function downloadGenerated() {
    if (!selected) return;
    const blob = new Blob([generatedContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(documentTitle || selected.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <WorkspacePage
      eyebrow="Document engine"
      title="Templates"
      description="Create, edit, delete and reuse Kretivco templates. Placeholder fields are detected automatically and converted into a working document form."
      actions={<div className="flex flex-wrap gap-2"><button onClick={() => setShowList((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium xl:hidden"><List className="h-4 w-4" />{showList ? "Hide list" : "Show list"}</button><Button onClick={openCreate}><Plus className="h-4 w-4" />Create template</Button></div>}
    >
      {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}
      <div className="grid gap-5 xl:grid-cols-[370px_minmax(0,1fr)]">
        <Card className={cn("h-fit bg-white/80 xl:sticky xl:top-5 xl:block", !showList && "hidden")}>
          <CardHeader className="border-b p-4 sm:p-5"><div className="flex items-center justify-between"><div><CardTitle>Template library</CardTitle><p className="mt-1 text-xs text-muted-foreground">{templates.length} templates</p></div><FileText className="h-5 w-5 text-[#ba5c42]" /></div><div className="mt-4 flex h-10 items-center gap-2 rounded-lg border bg-white px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 text-sm outline-none" placeholder="Search templates" /></div></CardHeader>
          <CardContent className="max-h-[58vh] space-y-2 overflow-y-auto p-3 xl:max-h-[calc(100vh-250px)]">{filtered.map((template) => <button key={template.id} onClick={() => { setSelectedId(template.id); setShowList(false); }} className={cn("w-full rounded-xl border p-4 text-left", selected?.id === template.id ? "border-[#ba5c42] bg-[#fff8f4]" : "bg-white hover:bg-[#f8f5ee]")}><div className="text-[10px] font-semibold uppercase tracking-wider text-[#ba5c42]">{template.category} · {template.client}</div><div className="mt-1 text-sm font-semibold">{template.name}</div><div className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{template.description}</div><div className="mt-3 text-[10px] text-muted-foreground">{placeholders(template.content).length} fields</div></button>)}</CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          {selected ? <>
            <Card className="overflow-hidden bg-[#26342b] text-white"><CardContent className="p-5 sm:p-7"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start"><div><div className="text-[10px] uppercase tracking-[.18em] text-white/45">{selected.category} · {selected.client}</div><h2 className="mt-3 text-2xl font-semibold sm:text-3xl">{selected.name}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">{selected.description}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={openEdit}><Pencil className="h-3.5 w-3.5" />Edit</Button><Button variant="outline" size="sm" className="border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/20" onClick={deleteTemplate}><Trash2 className="h-3.5 w-3.5" />Delete</Button></div></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Placeholder fields" value={String(variables.length)} /><Metric label="Generated documents" value={String(documents.filter((document) => document.templateId === selected.id).length)} /><Metric label="Updated" value={new Date(selected.updatedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })} /></div><Button className="mt-6 w-full bg-[#ef7f5f] hover:bg-[#e56d4c] sm:w-auto" onClick={openBuilder}><Sparkles className="h-4 w-4" />Use template</Button></CardContent></Card>

            <Card className="bg-white/80"><CardHeader><CardTitle>Template preview</CardTitle><p className="mt-1 text-xs text-muted-foreground">Variables remain visible until the template is used.</p></CardHeader><CardContent><div className="rounded-xl border bg-white p-4 sm:p-6"><MarkdownPreview content={selected.content} /></div></CardContent></Card>
          </> : <Card className="bg-white/80"><CardContent className="p-12 text-center"><FileText className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-4 font-semibold">No templates yet</div><Button className="mt-4" onClick={openCreate}><Plus className="h-4 w-4" />Create template</Button></CardContent></Card>}
        </div>
      </div>

      {editorOpen && <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"><Card className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-b-none bg-[#f7f4ed] sm:rounded-xl"><CardHeader className="sticky top-0 z-10 flex-row items-start justify-between border-b bg-[#f7f4ed] p-4 sm:p-6"><div><CardTitle className="text-xl sm:text-2xl">{draft.id ? "Edit template" : "Create template"}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Use placeholders such as {"{{client_name}}"} to create generated fields.</p></div><Button variant="ghost" size="icon" onClick={() => setEditorOpen(false)}><X className="h-4 w-4" /></Button></CardHeader><CardContent className="p-4 sm:p-6"><div className="grid gap-4 md:grid-cols-2"><Field label="Template name"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="input" /></Field><Field label="Category"><input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="input" /></Field><Field label="Client / availability"><input value={draft.client} onChange={(event) => setDraft({ ...draft, client: event.target.value })} className="input" /></Field><Field label="Description"><input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="input" /></Field><Field label="Markdown template" wide><textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} className="min-h-[440px] w-full resize-y rounded-xl border bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-[#ba5c42]" /></Field></div><div className="mt-4 rounded-xl border bg-white p-4 text-xs text-muted-foreground">Detected fields: {placeholders(draft.content).length ? placeholders(draft.content).map((field) => `{{${field}}}`).join(", ") : "None"}</div><div className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button onClick={saveTemplate}><Save className="h-4 w-4" />Save template</Button></div></CardContent></Card></div>}

      {builderOpen && selected && <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"><Card className="max-h-[96vh] w-full max-w-6xl overflow-y-auto rounded-b-none bg-[#f7f4ed] sm:rounded-xl"><CardHeader className="sticky top-0 z-10 flex-row items-start justify-between border-b bg-[#f7f4ed] p-4 sm:p-6"><div><CardTitle className="text-xl sm:text-2xl">Generate from {selected.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Complete the detected fields and export the result as Markdown.</p></div><Button variant="ghost" size="icon" onClick={() => setBuilderOpen(false)}><X className="h-4 w-4" /></Button></CardHeader><CardContent className="p-4 sm:p-6"><div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]"><div className="space-y-4"><Field label="Generated document title"><input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} className="input" /></Field>{variables.map((variable) => <Field key={variable} label={prettyLabel(variable)}><textarea value={values[variable] || ""} onChange={(event) => setValues({ ...values, [variable]: event.target.value })} className="textarea" placeholder={`Enter ${prettyLabel(variable).toLowerCase()}`} /></Field>)}</div><div className="min-w-0"><div className="rounded-xl border bg-white p-4 sm:p-6"><MarkdownPreview content={generatedContent} /></div></div></div><div className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setBuilderOpen(false)}>Close</Button><Button variant="outline" onClick={downloadGenerated}><Download className="h-4 w-4" />Download .md</Button><Button onClick={saveGeneratedDocument}><Save className="h-4 w-4" />Save document</Button></div></CardContent></Card></div>}

      <style jsx global>{`.input { height: 2.75rem; width: 100%; border-radius: .65rem; border: 1px solid hsl(var(--border)); background: white; padding: 0 .8rem; font-size: .875rem; outline: none; } .textarea { min-height: 5.5rem; width: 100%; resize: vertical; border-radius: .65rem; border: 1px solid hsl(var(--border)); background: white; padding: .75rem .8rem; font-size: .875rem; outline: none; } .input:focus, .textarea:focus { box-shadow: 0 0 0 3px rgba(186,92,66,.12); border-color: rgba(186,92,66,.55); }`}</style>
    </WorkspacePage>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-white/5 p-4"><div className="text-[9px] uppercase tracking-wider text-white/40">{label}</div><div className="mt-2 text-sm font-semibold text-white/80">{value}</div></div>; }
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={cn("block text-xs font-medium", wide && "md:col-span-2")}>{label}<div className="mt-2">{children}</div></label>; }

"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, List, Pencil, Plus, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DocumentBrandProfile,
  DocumentComposer,
  DocumentLayout,
  DocumentSavePayload,
} from "@/components/document-composer";
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
  html: string;
  layout: DocumentLayout;
  brand: DocumentBrandProfile;
  values: Record<string, string>;
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
    description: "Campaign proposal using the approved Kretivco magenta-orange document identity.",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# CADANGAN KEMPEN PEMASARAN

**Reference No.:** {{reference_no}}  
**Tarikh:** {{date}}  
**Untuk:** {{client_name}}  
**Daripada:** Kretivco Mediaworks  
**Perkara:** {{subject}}  
**Tempoh Kempen:** {{campaign_period}}

## 1. Ringkasan Cadangan

{{executive_summary}}

## 2. Apa Yang Kami Perhatikan

{{observations}}

## 3. Objektif

{{objectives}}

## 4. Strategi Kempen

{{strategy}}

## 5. Skop Kerja Kretivco

{{scope}}

## 6. Bajet dan Pelaburan

**Yuran Kretivco:** {{management_fee}}  
**Bajet media:** {{media_budget}}  
**Jumlah:** {{total_investment}}

## 7. Jadual Pelaksanaan

{{timeline}}

## 8. Langkah Seterusnya

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
    description: "Interactive quotation with customer, scope, amount, validity and commercial terms.",
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

## Commercial Summary

**Subtotal:** {{subtotal}}  
**Tax / SST:** {{tax}}  
**Grand Total:** {{grand_total}}

## Terms

- Payment terms: {{payment_terms}}
- Delivery timeline: {{delivery_timeline}}
- Additional terms: {{additional_terms}}

Prepared by: {{prepared_by}}`,
  },
  {
    id: "tpl-invoice",
    name: "Invoice",
    category: "Finance",
    client: "Reusable",
    description: "Invoice suitable for project billing, campaign fees and weekly settlements.",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# INVOICE

**Invoice No.:** {{invoice_no}}  
**Invoice Date:** {{date}}  
**Due Date:** {{due_date}}

## Customer

**{{client_name}}**  
{{client_address}}

## Description

{{description}}

## Amount

**Subtotal:** {{subtotal}}  
**Tax / SST:** {{tax}}  
**Total Due:** {{total_due}}

## Payment Instructions

{{payment_instructions}}

**Payment Status:** {{payment_status}}`,
  },
  {
    id: "tpl-receipt",
    name: "Official Receipt",
    category: "Finance",
    client: "Reusable",
    description: "Receipt generated after an invoice or settlement is marked as paid.",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# OFFICIAL RECEIPT

**Receipt No.:** {{receipt_no}}  
**Date Received:** {{date}}  
**Received From:** {{client_name}}

## Payment Details

**Reference:** {{payment_reference}}  
**Payment Method:** {{payment_method}}  
**For:** {{description}}

## Amount Received

**{{amount_received}}**

This receipt confirms that the payment stated above has been received by Kretivco Mediaworks.

Issued by: {{issued_by}}`,
  },
  {
    id: "tpl-memo",
    name: "Internal Memo",
    category: "Internal Memo",
    client: "Kretivco",
    description: "Official memo using the current Kretivco letterhead while only replacing its content.",
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
    id: "tpl-letter",
    name: "Official Letter",
    category: "Letter",
    client: "Reusable",
    description: "Formal customer or partner letter using the reusable Kretivco letterhead.",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `{{date}}

{{recipient_name}}  
{{recipient_title}}  
{{recipient_company}}  
{{recipient_address}}

**Dear {{recipient_name}},**

## {{subject}}

{{body}}

Respectfully yours,

{{signatory_name}}  
{{signatory_title}}  
Kretivco Mediaworks`,
  },
  {
    id: "tpl-mou",
    name: "Memorandum of Understanding",
    category: "Agreement",
    client: "Reusable",
    description: "Structured MoU shell with party details, clauses, effective date and signatures.",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# MEMORANDUM PERSEFAHAMAN

**Versi:** {{version}}  
**Tarikh Berkuat Kuasa:** {{effective_date}}  
**Tempat:** {{place}}

## Antara

**KRETIVCO MEDIAWORKS**  
No. Pendaftaran: {{kretivco_registration}}

DAN

**{{second_party_name}}**  
No. Pendaftaran: {{second_party_registration}}

## 1. Tujuan

{{purpose}}

## 2. Skop Kerjasama

{{scope}}

## 3. Terma Komersial

{{commercial_terms}}

## 4. Tanggungjawab Pihak-Pihak

{{responsibilities}}

## 5. Tempoh dan Penamatan

{{term_and_termination}}

## 6. Kerahsiaan dan Harta Intelek

{{confidentiality_and_ip}}

## Tandatangan

{{signature_section}}`,
  },
  {
    id: "tpl-marketing-plan",
    name: "Marketing Plan",
    category: "Strategy Report",
    client: "Reusable",
    description: "Complete marketing plan covering audience, positioning, funnel, channels, KPIs and budget.",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# {{campaign_name}} — Marketing Plan

## Executive Summary

{{executive_summary}}

## Business Objective

{{business_objective}}

## Audience

{{audience}}

## Positioning and Message

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

## KPIs and Reporting

{{kpis}}`,
  },
  {
    id: "tpl-storyboard",
    name: "Video Storyboard",
    category: "Creative Report",
    client: "Reusable",
    description: "Scene-by-scene production structure for video planning and approvals.",
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
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function placeholders(content: string) {
  return Array.from(new Set(Array.from(content.matchAll(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g)).map((match) => match[1])));
}

function replaceVariables(content: string, values: Record<string, string>) {
  return content.replace(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g, (_, key) => values[key] || `{{${key}}}`);
}

function defaultValue(key: string) {
  const date = new Date().toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" });
  const defaults: Record<string, string> = {
    date,
    sender: "Kretivco Mediaworks",
    prepared_by: "Kretivco Mediaworks",
    issued_by: "Kretivco Mediaworks",
    signatory_name: "Amirul Hafiz Bin Zulkefly",
    signatory_title: "Creative Director",
    kretivco_registration: "201803023252 (SA0463354-A)",
    payment_status: "Pending",
  };
  return defaults[key] || "";
}

function loadTemplates() {
  if (typeof window === "undefined") return starterTemplates;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return starterTemplates;
  try {
    const parsed = JSON.parse(saved) as Template[];
    if (!Array.isArray(parsed)) return starterTemplates;
    const savedById = new Map(parsed.map((template) => [template.id, template]));
    const currentStarters = starterTemplates.map((template) => savedById.get(template.id) || template);
    const custom = parsed.filter((template) => !starterTemplates.some((starter) => starter.id === template.id));
    return [...currentStarters, ...custom];
  } catch {
    return starterTemplates;
  }
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const loaded = loadTemplates();
    setTemplates(loaded);
    setSelectedId((current) => loaded.some((template) => template.id === current) ? current : loaded[0]?.id || "");
    const savedDocs = localStorage.getItem(DOC_KEY);
    if (savedDocs) {
      try {
        const parsed = JSON.parse(savedDocs) as GeneratedDocument[];
        if (Array.isArray(parsed)) setDocuments(parsed);
      } catch {}
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  }, [templates, mounted]);

  useEffect(() => {
    if (mounted) localStorage.setItem(DOC_KEY, JSON.stringify(documents));
  }, [documents, mounted]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    return templates.filter((template) => !term || [template.name, template.category, template.client, template.description, template.content].some((value) => value.toLowerCase().includes(term)));
  }, [templates, query]);

  const selected = templates.find((template) => template.id === selectedId) || filtered[0] || templates[0];
  const variables = selected ? placeholders(selected.content) : [];
  const generatedContent = selected ? replaceVariables(selected.content, values) : "";
  const selectedDocuments = documents.filter((document) => document.templateId === selected?.id).slice(0, 6);

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
    const initial = Object.fromEntries(placeholders(selected.content).map((key) => [key, defaultValue(key)]));
    setValues(initial);
    setDocumentTitle(`${selected.name} · ${new Date().toLocaleDateString("en-MY")}`);
    setBuilderOpen(true);
  }

  function saveGeneratedDocument(payload: DocumentSavePayload) {
    if (!selected || !documentTitle.trim()) return;
    const document: GeneratedDocument = {
      id: uid(),
      templateId: selected.id,
      templateName: selected.name,
      title: documentTitle.trim(),
      content: generatedContent,
      html: payload.html,
      layout: payload.layout,
      brand: payload.brand,
      values: payload.values,
      createdAt: new Date().toISOString(),
    };
    setDocuments((current) => [document, ...current]);
    setNotice("Generated document saved with its layout, logo and editable field values.");
    window.dispatchEvent(new CustomEvent("kretivos-document-generated", { detail: document }));
  }

  return (
    <WorkspacePage
      eyebrow="Interactive document engine"
      title="Templates and Documents"
      description="Use approved Kretivco document designs, replace only the content, upload a reusable logo, preview the final A4 layout and export to PDF or Microsoft Word."
      actions={<div className="flex flex-wrap gap-2"><button onClick={() => setShowList((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium xl:hidden"><List className="h-4 w-4" />{showList ? "Hide list" : "Show list"}</button><Button onClick={openCreate}><Plus className="h-4 w-4" />Create template</Button></div>}
    >
      {notice && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}

      <div className="grid gap-5 xl:grid-cols-[370px_minmax(0,1fr)]">
        <Card className={cn("h-fit bg-white/80 xl:sticky xl:top-5 xl:block", !showList && "hidden")}>
          <CardHeader className="border-b p-4 sm:p-5">
            <div className="flex items-center justify-between"><div><CardTitle>Template library</CardTitle><p className="mt-1 text-xs text-muted-foreground">{templates.length} approved and reusable templates</p></div><FileText className="h-5 w-5 text-[#ba5c42]" /></div>
            <div className="mt-4 flex h-10 items-center gap-2 rounded-lg border bg-white px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search templates" /></div>
          </CardHeader>
          <CardContent className="max-h-[58vh] space-y-2 overflow-y-auto p-3 xl:max-h-[calc(100vh-250px)]">
            {filtered.map((template) => <button key={template.id} onClick={() => { setSelectedId(template.id); setShowList(false); }} className={cn("w-full rounded-xl border p-4 text-left transition", selected?.id === template.id ? "border-[#ba5c42] bg-[#fff8f4]" : "bg-white hover:bg-[#f8f5ee]")}><div className="text-[10px] font-semibold uppercase tracking-wider text-[#ba5c42]">{template.category} · {template.client}</div><div className="mt-1 text-sm font-semibold">{template.name}</div><div className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{template.description}</div><div className="mt-3 text-[10px] text-muted-foreground">{placeholders(template.content).length} editable fields</div></button>)}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          {selected ? <>
            <Card className="overflow-hidden bg-[#26342b] text-white">
              <CardContent className="p-5 sm:p-7">
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                  <div><div className="text-[10px] uppercase tracking-[.18em] text-white/45">{selected.category} · {selected.client}</div><h2 className="mt-3 text-2xl font-semibold sm:text-3xl">{selected.name}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">{selected.description}</p></div>
                  <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={openEdit}><Pencil className="h-3.5 w-3.5" />Edit</Button><Button variant="outline" size="sm" className="border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/20" onClick={deleteTemplate}><Trash2 className="h-3.5 w-3.5" />Delete</Button></div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Editable fields" value={String(variables.length)} /><Metric label="Saved documents" value={String(documents.filter((document) => document.templateId === selected.id).length)} /><Metric label="Exports" value="PDF + Word" /></div>
                <Button className="mt-6 w-full bg-[#ef7f5f] hover:bg-[#e56d4c] sm:w-auto" onClick={openBuilder}><Sparkles className="h-4 w-4" />Create document</Button>
              </CardContent>
            </Card>

            <Card className="bg-white/80"><CardHeader><CardTitle>Template content</CardTitle><p className="mt-1 text-xs text-muted-foreground">The document composer applies the selected approved design around this reusable content.</p></CardHeader><CardContent><div className="rounded-xl border bg-white p-4 sm:p-6"><MarkdownPreview content={selected.content} /></div></CardContent></Card>

            {selectedDocuments.length > 0 && <Card className="bg-white/80"><CardHeader><CardTitle>Recently generated</CardTitle><p className="mt-1 text-xs text-muted-foreground">Saved versions keep their logo, layout and field values for audit and future regeneration.</p></CardHeader><CardContent className="space-y-2">{selectedDocuments.map((document) => <div key={document.id} className="flex flex-col justify-between gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center"><div><div className="text-sm font-semibold">{document.title}</div><div className="mt-1 text-xs text-muted-foreground">{document.layout} · {new Date(document.createdAt).toLocaleString("en-MY")}</div></div><span className="rounded-full bg-[#eeeae0] px-3 py-1 text-[10px] font-medium text-[#5a605a]">Saved</span></div>)}</CardContent></Card>}
          </> : <Card className="bg-white/80"><CardContent className="p-12 text-center"><FileText className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-4 font-semibold">No templates yet</div><Button className="mt-4" onClick={openCreate}><Plus className="h-4 w-4" />Create template</Button></CardContent></Card>}
        </div>
      </div>

      {editorOpen && <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"><Card className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-b-none bg-[#f7f4ed] sm:rounded-xl"><CardHeader className="sticky top-0 z-10 flex-row items-start justify-between border-b bg-[#f7f4ed] p-4 sm:p-6"><div><CardTitle className="text-xl sm:text-2xl">{draft.id ? "Edit template" : "Create template"}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Use placeholders such as {"{{client_name}}"}; the composer converts them into interactive fields.</p></div><Button variant="ghost" size="icon" onClick={() => setEditorOpen(false)}><X className="h-4 w-4" /></Button></CardHeader><CardContent className="p-4 sm:p-6"><div className="grid gap-4 md:grid-cols-2"><Field label="Template name"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="template-input" /></Field><Field label="Category"><input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="template-input" /></Field><Field label="Client / availability"><input value={draft.client} onChange={(event) => setDraft({ ...draft, client: event.target.value })} className="template-input" /></Field><Field label="Description"><input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="template-input" /></Field><Field label="Markdown content template" wide><textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} className="min-h-[440px] w-full resize-y rounded-xl border bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-[#ba5c42]" /></Field></div><div className="mt-4 rounded-xl border bg-white p-4 text-xs text-muted-foreground">Detected fields: {placeholders(draft.content).length ? placeholders(draft.content).map((field) => `{{${field}}}`).join(", ") : "None"}</div><div className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button onClick={saveTemplate}><Save className="h-4 w-4" />Save template</Button></div></CardContent></Card></div>}

      {builderOpen && selected && <DocumentComposer template={selected} variables={variables} values={values} onValuesChange={setValues} documentTitle={documentTitle} onDocumentTitleChange={setDocumentTitle} generatedContent={generatedContent} onClose={() => setBuilderOpen(false)} onSave={saveGeneratedDocument} />}

      <style jsx global>{`
        .template-input { height: 2.75rem; width: 100%; border-radius: .65rem; border: 1px solid #ddd8cf; background: #fff; padding: 0 .85rem; font-size: .875rem; outline: none; }
        .template-input:focus { border-color: #ba5c42; box-shadow: 0 0 0 3px rgba(186,92,66,.10); }
      `}</style>
    </WorkspacePage>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 p-4"><div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div><div className="mt-2 text-lg font-semibold">{value}</div></div>;
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={cn("block", wide && "md:col-span-2")}><span className="mb-2 block text-xs font-medium">{label}</span>{children}</label>;
}

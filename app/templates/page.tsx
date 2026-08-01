"use client";

import { isValidElement, useEffect, useMemo, useState } from "react";
import {
  Download, FileText, Loader2, Pencil, Plus, RefreshCw, Save, Search,
  Sparkles, Trash2, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea, isTextField } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AIWritingButton } from "@/components/ai-writing-button";
import {
  DocumentBrandProfile,
  DocumentComposer,
  DocumentLayout,
  DocumentSavePayload,
} from "@/components/document-composer";
import {
  DOCUMENTS_NAV_ITEMS,
  DocumentsShell,
  type DocumentsTab,
} from "@/components/documents-shell";
import { PrintTemplateSettings } from "@/components/print-template-settings";
import { cn } from "@/lib/utils";

type Template = {
  id: string;
  name: string;
  category: string;
  description: string;
  layout: DocumentLayout;
  content: string;
  variables: string[];
  brandSettings: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type GeneratedDocument = {
  id: string;
  customerId: string;
  customerName: string;
  templateId: string;
  templateName: string;
  title: string;
  documentType: string;
  reference: string;
  status: string;
  values: Record<string, string>;
  brand: DocumentBrandProfile;
  html: string;
  content: string;
  pdfUrl: string;
  wordUrl: string;
  createdAt: string;
  updatedAt: string;
};

type Customer = { id: string; name: string };
type Draft = { id: string; name: string; category: string; description: string; layout: DocumentLayout; content: string; status: string };

const TEMPLATE_CACHE = "kretivos-templates-cache";
const DOC_CACHE = "kretivos-generated-documents-cache";
const LEGACY_TEMPLATE_KEY = "kretivos-templates";
const LEGACY_DOC_KEY = "kretivos-generated-documents";
const MIGRATED_KEY = "kretivos-templates-neon-migrated";

function parseLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function variables(content: string) {
  return Array.from(new Set(Array.from(content.matchAll(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g)).map((match) => match[1])));
}

function replaceVariables(content: string, values: Record<string, string>) {
  return content.replace(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g, (_, key) => values[key] || `{{${key}}}`);
}

function emptyDraft(): Draft {
  return { id: "", name: "", category: "General", description: "", layout: "plain", content: "# New Template\n\n{{content}}", status: "Active" };
}

function downloadHtml(document: GeneratedDocument) {
  const blob = new Blob([document.html || document.content], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `${document.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document"}.html`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function DocumentsPage() {
  const [tab, setTab] = useState<DocumentsTab>("templates");
  const [templates, setTemplates] = useState<Template[]>(parseLocal(TEMPLATE_CACHE, []));
  const [documents, setDocuments] = useState<GeneratedDocument[]>(parseLocal(DOC_CACHE, []));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [templateForDocument, setTemplateForDocument] = useState<Template | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [templateBrief, setTemplateBrief] = useState("");
  const [documentBrief, setDocumentBrief] = useState("");
  const [aiBusy, setAiBusy] = useState<"template" | "document" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadData(migrateLegacy = false) {
    setLoading(true);
    setError("");
    try {
      const [templateData, businessData] = await Promise.all([
        jsonRequest("/api/templates", { cache: "no-store" }),
        jsonRequest("/api/business", { cache: "no-store" }).catch(() => ({ customers: [] })),
      ]);
      let serverTemplates = templateData.templates as Template[];
      let serverDocuments = templateData.documents as GeneratedDocument[];

      if (migrateLegacy && !localStorage.getItem(MIGRATED_KEY)) {
        const templateIds = new Set(serverTemplates.map((item) => item.id));
        for (const legacy of parseLocal<any[]>(LEGACY_TEMPLATE_KEY, [])) {
          if (templateIds.has(legacy.id)) continue;
          try {
            const created = await jsonRequest("/api/templates", {
              method: "POST",
              body: JSON.stringify({
                resource: "template",
                id: legacy.id,
                name: legacy.name,
                category: legacy.category,
                description: legacy.description,
                layout: legacy.layout || "plain",
                content: legacy.content,
                variables: variables(legacy.content || ""),
                status: "Active",
              }),
            });
            serverTemplates = [created.template, ...serverTemplates];
            templateIds.add(created.template.id);
          } catch {}
        }

        const documentIds = new Set(serverDocuments.map((item) => item.id));
        for (const legacy of parseLocal<any[]>(LEGACY_DOC_KEY, [])) {
          if (documentIds.has(legacy.id)) continue;
          try {
            const created = await jsonRequest("/api/templates", {
              method: "POST",
              body: JSON.stringify({
                resource: "document",
                id: legacy.id,
                templateId: legacy.templateId,
                title: legacy.title,
                documentType: legacy.templateName,
                values: legacy.values || {},
                brand: legacy.brand || {},
                html: legacy.html || "",
                content: legacy.content || "",
                status: "Draft",
              }),
            });
            serverDocuments = [created.document, ...serverDocuments];
            documentIds.add(created.document.id);
          } catch {}
        }
        localStorage.setItem(MIGRATED_KEY, "true");
      }

      setTemplates(serverTemplates);
      setDocuments(serverDocuments);
      setCustomers((businessData.customers || []).map((item: any) => ({ id: item.id, name: item.name })));
      localStorage.setItem(TEMPLATE_CACHE, JSON.stringify(serverTemplates));
      localStorage.setItem(DOC_CACHE, JSON.stringify(serverDocuments));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load shared templates.");
      setTemplates(parseLocal(TEMPLATE_CACHE, []));
      setDocuments(parseLocal(DOC_CACHE, []));
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("section") as DocumentsTab | null;
    if (requested && DOCUMENTS_NAV_ITEMS.some((item) => item.id === requested)) setTab(requested);
    void loadData(true);
  }, []);
  function changeTab(next: DocumentsTab) {
    setTab(next);
    setQuery("");
    const url = new URL(window.location.href);
    url.searchParams.set("section", next);
    window.history.replaceState({}, "", url);
  }

  const filteredTemplates = useMemo(() => {
    const term = query.trim().toLowerCase();
    return templates.filter((item) => !term || [item.name, item.category, item.description, item.content].join(" ").toLowerCase().includes(term));
  }, [templates, query]);
  const filteredDocuments = useMemo(() => {
    const term = query.trim().toLowerCase();
    return documents.filter((item) => !term || [item.title, item.customerName, item.templateName, item.reference, item.status].join(" ").toLowerCase().includes(term));
  }, [documents, query]);

  async function saveTemplate() {
    if (!draft || !draft.name.trim() || !draft.content.trim()) { setError("Template name and content are required."); return; }
    setSaving(true);
    setError("");
    try {
      const payload = { resource: "template", ...draft, variables: variables(draft.content) };
      const data = await jsonRequest("/api/templates", { method: draft.id ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setTemplates((current) => draft.id ? current.map((item) => item.id === data.template.id ? data.template : item) : [data.template, ...current]);
      setDraft(null);
      setNotice(draft.id ? "Template updated in Neon." : "Template created in Neon.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save template."); }
    finally { setSaving(false); }
  }

  async function deleteTemplate(template: Template) {
    if (!window.confirm(`Delete template “${template.name}”? Existing generated documents will remain.`)) return;
    setSaving(true);
    try {
      await jsonRequest(`/api/templates?resource=template&id=${encodeURIComponent(template.id)}`, { method: "DELETE" });
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      setNotice("Template deleted.");
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Unable to delete template."); }
    finally { setSaving(false); }
  }

  async function deleteDocument(document: GeneratedDocument) {
    if (!window.confirm(`Delete generated document “${document.title}”?`)) return;
    setSaving(true);
    try {
      await jsonRequest(`/api/templates?resource=document&id=${encodeURIComponent(document.id)}`, { method: "DELETE" });
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setNotice("Generated document deleted.");
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Unable to delete document."); }
    finally { setSaving(false); }
  }

  function prepareDocument(template: Template) {
    const customer = customers.find((item) => item.id === customerId);
    const initialValues = Object.fromEntries(template.variables.map((key) => [key, key === "client_name" ? customer?.name || "" : key.includes("date") ? new Date().toISOString().slice(0, 10) : ""]));
    setTemplateForDocument(template);
    setDocumentTitle(`${template.name} · ${new Date().toLocaleDateString("en-MY")}`);
    setValues(initialValues);
    setDocumentBrief("");
    setSetupOpen(true);
  }

  async function assistTemplate(action: "draft_template" | "improve_template") {
    if (!draft) return;
    if (action === "draft_template" && templateBrief.trim().length < 8) {
      setError("Add a short document brief first.");
      return;
    }
    setAiBusy("template");
    setError("");
    try {
      const data = await jsonRequest("/api/documents/assist", {
        method: "POST",
        body: JSON.stringify({ action, brief: templateBrief, template: draft }),
      });
      setDraft((current) => current ? { ...current, ...data.template } : current);
      setNotice(data.source === "ai-nonymauz-cloud"
        ? "AI draft applied. Review the wording and variables before saving."
        : "Starter structure applied. AI was unavailable, so review before saving.");
    } catch (assistError) {
      setError(assistError instanceof Error ? assistError.message : "Unable to assist this template.");
    } finally {
      setAiBusy(null);
    }
  }

  async function assistDocument() {
    if (!templateForDocument) return;
    if (documentBrief.trim().length < 8) {
      setError("Add a short document brief first.");
      return;
    }
    setAiBusy("document");
    setError("");
    try {
      const customer = customers.find((item) => item.id === customerId);
      const data = await jsonRequest("/api/documents/assist", {
        method: "POST",
        body: JSON.stringify({
          action: "fill_document",
          brief: documentBrief,
          customerName: customer?.name || "Kretivco / Internal",
          title: documentTitle,
          template: templateForDocument,
          currentValues: values,
        }),
      });
      setDocumentTitle(data.document.title);
      setValues(data.document.values);
      setNotice(data.source === "ai-nonymauz-cloud"
        ? "AI filled the document fields it could verify. Review blanks and facts in the composer."
        : "AI was unavailable. Existing values were kept for manual completion.");
    } catch (assistError) {
      setError(assistError instanceof Error ? assistError.message : "Unable to assist this document.");
    } finally {
      setAiBusy(null);
    }
  }

  function openComposer() {
    if (!templateForDocument) return;
    const customer = customers.find((item) => item.id === customerId);
    setValues((current) => ({ ...current, client_name: current.client_name || customer?.name || "" }));
    setSetupOpen(false);
    setComposerOpen(true);
  }

  async function saveGeneratedDocument(payload: DocumentSavePayload) {
    if (!templateForDocument) return;
    setSaving(true);
    setError("");
    try {
      const generatedContent = replaceVariables(templateForDocument.content, payload.values);
      const data = await jsonRequest("/api/templates", {
        method: "POST",
        body: JSON.stringify({
          resource: "document",
          customerId: customerId || undefined,
          templateId: templateForDocument.id,
          title: documentTitle,
          documentType: templateForDocument.category,
          reference: payload.values.reference_no || payload.values.invoice_no || payload.values.quotation_no || payload.values.receipt_no || "",
          status: "Draft",
          values: payload.values,
          brand: payload.brand,
          html: payload.html,
          content: generatedContent,
        }),
      });
      setDocuments((current) => [data.document, ...current]);
      setNotice("Generated document saved to Neon. PDF and Word export remain available in the composer.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save generated document."); }
    finally { setSaving(false); }
  }

  function reopenDocument(document: GeneratedDocument) {
    const template = templates.find((item) => item.id === document.templateId);
    if (!template) { setError("The original template no longer exists."); return; }
    setTemplateForDocument(template);
    setCustomerId(document.customerId || "");
    setDocumentTitle(document.title);
    setValues(document.values || {});
    setComposerOpen(true);
  }

  return (
    <DocumentsShell
      activeId={tab}
      title={(DOCUMENTS_NAV_ITEMS.find((item) => item.id === tab) || DOCUMENTS_NAV_ITEMS[0]).label}
      description={(DOCUMENTS_NAV_ITEMS.find((item) => item.id === tab) || DOCUMENTS_NAV_ITEMS[0]).description}
      documentCount={documents.length}
      onNavigate={changeTab}
      onNewTemplate={() => { changeTab("templates"); setTemplateBrief(""); setDraft(emptyDraft()); }}
      actions={<div className="flex gap-2">{tab !== "print" && <Button variant="outline" size="icon" className="bg-white" onClick={() => loadData(false)} disabled={loading} aria-label="Refresh documents"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Button>}{tab === "templates" && <Button onClick={() => { setTemplateBrief(""); setDraft(emptyDraft()); }}><Plus className="h-4 w-4" /><span className="hidden sm:inline">New template</span></Button>}</div>}
    >
      {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}
      {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}

      {tab !== "print" && <div className="mb-4 flex h-11 items-center gap-2 rounded-xl border bg-white px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 text-sm outline-none" placeholder={tab === "templates" ? "Search templates..." : "Search generated documents..."} /></div>}

      {tab === "templates" ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredTemplates.map((template) => <Card key={template.id} className="bg-white/80"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eee9df]"><FileText className="h-5 w-5 text-[#ba5c42]" /></div><span className="rounded-full bg-[#eeeae0] px-2.5 py-1 text-[10px] text-[#5a605a]">{template.category}</span></div><h2 className="mt-5 text-lg font-semibold">{template.name}</h2><p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">{template.description || "Reusable KretivOS document template."}</p><div className="mt-4 flex flex-wrap gap-1.5">{template.variables.slice(0, 5).map((item) => <span key={item} className="rounded-md border bg-white px-2 py-1 font-mono text-[9px] text-muted-foreground">{`{{${item}}}`}</span>)}{template.variables.length > 5 && <span className="rounded-md bg-[#f3efe7] px-2 py-1 text-[9px] text-muted-foreground">+{template.variables.length - 5}</span>}</div><div className="mt-5 grid grid-cols-[1fr_auto_auto] gap-2"><Button onClick={() => prepareDocument(template)}><Sparkles className="h-4 w-4" />Create document</Button><Button variant="outline" size="icon" onClick={() => setDraft({ id: template.id, name: template.name, category: template.category, description: template.description, layout: template.layout, content: template.content, status: template.status })}><Pencil className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => deleteTemplate(template)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>)}{!filteredTemplates.length && <Card className="bg-white/80 md:col-span-2 xl:col-span-3"><CardContent className="p-12 text-center text-sm text-muted-foreground">No templates match the search.</CardContent></Card>}</div>
      : tab === "documents" ? <div className="space-y-3">{filteredDocuments.map((document) => <Card key={document.id} className="bg-white/80"><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eee9df]"><FileText className="h-5 w-5 text-[#ba5c42]" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{document.title}</h2><span className="rounded-full bg-[#eeeae0] px-2.5 py-1 text-[10px] text-[#5a605a]">{document.status}</span></div><div className="mt-1 text-xs text-muted-foreground">{document.customerName} · {document.templateName}{document.reference ? ` · ${document.reference}` : ""}</div><div className="mt-2 text-[10px] text-muted-foreground">Saved {new Date(document.updatedAt).toLocaleString("en-MY")}</div></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => reopenDocument(document)}><Pencil className="h-3.5 w-3.5" />Reopen</Button><Button variant="outline" size="sm" onClick={() => downloadHtml(document)}><Download className="h-3.5 w-3.5" />HTML</Button><Button variant="outline" size="icon" onClick={() => deleteDocument(document)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>)}{!filteredDocuments.length && <Card className="bg-white/80"><CardContent className="p-12 text-center"><FileText className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-4 font-semibold">No generated documents yet</div><p className="mt-2 text-sm text-muted-foreground">Open a template and save a composed document.</p></CardContent></Card>}</div>
      : <PrintTemplateSettings />}

      {draft && <Modal
        title={draft.id ? "Edit template" : "Create template"}
        subtitle="AI drafts remain editable. Variables use double braces, for example {{client_name}}."
        onClose={() => setDraft(null)}
        footer={<><Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button onClick={saveTemplate} disabled={saving || aiBusy === "template"}><Save className="h-4 w-4" />Save template</Button></>}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 rounded-2xl border border-[#d9b9a9] bg-[#fff8f4] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ba5c42] text-white"><Sparkles className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1"><div className="text-sm font-semibold">AI document assistant</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Describe what this reusable document needs. AI creates editable Markdown and variables without inventing prices, dates or claims.</p></div>
            </div>
            <Textarea value={templateBrief} onChange={(event) => setTemplateBrief(event.target.value)} className="mt-4" placeholder="Example: Bilingual social media proposal for an F&B client, including objectives, scope, timeline, deliverables and approval section." />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={() => assistTemplate("draft_template")} disabled={aiBusy === "template" || templateBrief.trim().length < 8}>{aiBusy === "template" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Generate from brief</Button>
              <Button type="button" variant="outline" className="bg-white" onClick={() => assistTemplate("improve_template")} disabled={aiBusy === "template" || draft.content.trim().length < 8}><Sparkles className="h-4 w-4" />Improve current template</Button>
            </div>
          </div>
          <Field label="Template name"><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field label="Category"><Input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></Field>
          <Field label="Layout"><Select value={draft.layout} onChange={(event) => setDraft({ ...draft, layout: event.target.value as DocumentLayout })} ><option value="proposal">Kretivco Proposal</option><option value="letterhead">Kretivco Letterhead</option><option value="commercial">Commercial Document</option><option value="report">Corporate Report</option><option value="plain">Clean Document</option></Select></Field>
          <Field label="Status"><Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} ><option>Active</option><option>Draft</option><option>Archived</option></Select></Field>
          <Field label="Description" wide><Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
          <Field label="Markdown template content" wide><textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} className="min-h-[360px] w-full resize-y rounded-xl border bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-[#ba5c42]" /></Field>
          <div className="md:col-span-2 rounded-xl border bg-[#f7f4ed] p-4 text-xs text-muted-foreground">Detected variables: {variables(draft.content).length ? variables(draft.content).map((item) => `{{${item}}}`).join(", ") : "None"}</div>
        </div>
      </Modal>}

      {setupOpen && templateForDocument && <Modal
        title={`Create from ${templateForDocument.name}`}
        subtitle="Use AI to fill verifiable fields from your brief, then review everything in the composer."
        onClose={() => setSetupOpen(false)}
        footer={<><Button variant="outline" onClick={() => setSetupOpen(false)}>Cancel</Button><Button onClick={openComposer} disabled={aiBusy === "document"}><Sparkles className="h-4 w-4" />Open composer</Button></>}
      >
        <div className="space-y-4">
          <Field label="Customer / workspace"><Select value={customerId} onChange={(event) => setCustomerId(event.target.value)} ><option value="">Kretivco / Internal</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <Field label="Document title"><Input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} /></Field>
          <div className="rounded-2xl border border-[#d9b9a9] bg-[#fff8f4] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-[#ba5c42]" />AI-fill document</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Paste the approved facts or rough brief. Unknown prices, dates, terms and reference numbers stay blank.</p>
            <Textarea value={documentBrief} onChange={(event) => setDocumentBrief(event.target.value)} className="mt-3" placeholder="Example: Proposal for Chef Ammar marketplace launch. Scope includes product photography, Shopee and TikTok Shop setup, and monthly reporting. Timeline and fees are not confirmed yet." />
            <Button type="button" className="mt-3" onClick={assistDocument} disabled={aiBusy === "document" || documentBrief.trim().length < 8}>{aiBusy === "document" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Fill verified fields with AI</Button>
          </div>
          <div className="rounded-xl border bg-[#f7f4ed] p-4 text-xs leading-6 text-muted-foreground">Nothing is saved or sent automatically. Review every AI-assisted field in the composer before saving to Neon or exporting.</div>
        </div>
      </Modal>}

      {composerOpen && templateForDocument && <DocumentComposer template={{ id: templateForDocument.id, name: templateForDocument.name, category: templateForDocument.category, content: templateForDocument.content }} variables={templateForDocument.variables} values={values} onValuesChange={setValues} documentTitle={documentTitle} onDocumentTitleChange={setDocumentTitle} generatedContent={replaceVariables(templateForDocument.content, values)} onClose={() => setComposerOpen(false)} onSave={saveGeneratedDocument} />}
    </DocumentsShell>
  );
}

function Modal({ title, subtitle, onClose, footer, children }: { title: string; subtitle: string; onClose: () => void; footer: React.ReactNode; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"><div className="max-h-[94dvh] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-[#f7f4ed] shadow-2xl sm:rounded-2xl"><div className="sticky top-0 z-10 flex items-start justify-between border-b bg-[#f7f4ed]/95 p-5 backdrop-blur"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p></div><button onClick={onClose} className="rounded-xl p-2 hover:bg-black/5"><X className="h-4 w-4" /></button></div><div className="p-5">{children}</div><div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">{footer}</div></div></div>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  const control = isValidElement<{ value?: unknown; onChange?: (event: any) => void }>(children) ? children : null;
  const value = typeof control?.props.value === "string" ? control.props.value : "";
  const canImprove = control !== null && isTextField(control.type) && typeof control.props.onChange === "function";
  return <div className={cn("block text-xs font-medium text-[#4e5a52]", wide && "md:col-span-2")}><div className="flex min-h-8 items-center justify-between gap-2"><span>{label}</span>{canImprove && <AIWritingButton value={value} field={label} context="KretivOS reusable document template. Preserve variables in double curly braces, names, dates, figures and legal or commercial meaning." onApply={(next) => control.props.onChange?.({ target: { value: next }, currentTarget: { value: next } })} />}</div><div className="mt-2">{children}</div></div>;
}

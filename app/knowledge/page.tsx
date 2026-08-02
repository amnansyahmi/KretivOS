"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Bot, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Download, ExternalLink,
  FileCode2, Library, Pencil, Plus, RefreshCw, Save, Search, Send,
  SlidersHorizontal, Sparkles, Tag, Trash2, Upload, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MarkdownPreview } from "@/components/markdown-preview";
import { DateInput } from "@/components/date-input";
import { builtInKnowledge, KNOWLEDGE_STORAGE_KEY, KnowledgeEntry, slugifyFilename } from "@/lib/knowledge";
import { cn } from "@/lib/utils";

type CustomerOption = { id: string; name: string };
type BrandOption = { id: string; customerId: string; name: string };
type Screen = "library" | "document";

function cachedEntries(): KnowledgeEntry[] {
  if (typeof window === "undefined") return builtInKnowledge;
  try {
    const parsed = JSON.parse(localStorage.getItem(KNOWLEDGE_STORAGE_KEY) || "null");
    return Array.isArray(parsed) && parsed.length ? parsed : builtInKnowledge;
  } catch {
    return builtInKnowledge;
  }
}

function excerpt(content: string) {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function formatDate(value?: string) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

const freshnessOptions = ["All freshness", "Current", "Review soon", "Overdue", "Unscheduled"];

function freshnessTone(status?: KnowledgeEntry["freshnessStatus"]) {
  if (status === "Current") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "Review soon") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "Overdue") return "bg-red-50 text-red-700 border-red-200";
  return "bg-muted text-foreground-soft border-black/5";
}

function FreshnessBadge({ status }: { status?: KnowledgeEntry["freshnessStatus"] }) {
  return <span className={cn("inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold", freshnessTone(status))}>{status || "Unscheduled"}</span>;
}

function sourceLabel(source: KnowledgeEntry["source"]) {
  if (source === "markdown") return "Uploaded Markdown";
  if (source === "automation") return "Automation";
  if (source === "built-in") return "Curated knowledge";
  return "Knowledge editor";
}

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export default function KnowledgeLibraryPage() {
  const confirm = useConfirm();
  const [entries, setEntries] = useState<KnowledgeEntry[]>(cachedEntries);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [selectedId, setSelectedId] = useState(cachedEntries()[0]?.id || "");
  const [screen, setScreen] = useState<Screen>("library");
  const [query, setQuery] = useState("");
  const [client, setClient] = useState("All clients");
  const [category, setCategory] = useState("All");
  const [freshnessFilter, setFreshnessFilter] = useState("All freshness");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<KnowledgeEntry | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerSources, setAnswerSources] = useState<{ index: number; id: string; title: string; category: string; customerName: string; freshnessStatus?: KnowledgeEntry["freshnessStatus"]; nextReviewAt?: string; sourceUrl?: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadData(migrateCache = false) {
    setSyncing(true);
    setError("");
    try {
      const [knowledgeData, businessData] = await Promise.all([
        jsonRequest("/api/knowledge", { cache: "no-store" }),
        jsonRequest("/api/business", { cache: "no-store" }).catch(() => ({ customers: [], brands: [] })),
      ]);
      let serverEntries = knowledgeData.entries as KnowledgeEntry[];

      if (migrateCache) {
        const cache = cachedEntries();
        const serverIds = new Set(serverEntries.map((entry) => entry.id));
        const pending = cache.filter((entry) => !serverIds.has(entry.id) && entry.source !== "built-in");
        for (const entry of pending) {
          try {
            const created = await jsonRequest("/api/knowledge", {
              method: "POST",
              body: JSON.stringify(entry),
            });
            serverEntries = [created.entry, ...serverEntries];
          } catch {
            // Keep the local copy available if one legacy record cannot be migrated.
          }
        }
      }

      setEntries(serverEntries);
      localStorage.setItem(KNOWLEDGE_STORAGE_KEY, JSON.stringify(serverEntries));
      setCustomers((businessData.customers || []).map((item: any) => ({ id: item.id, name: item.name })));
      setBrands((businessData.brands || []).map((item: any) => ({ id: item.id, customerId: item.customerId, name: item.name })));
      setSelectedId((current) => serverEntries.some((entry) => entry.id === current) ? current : serverEntries[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to connect to shared knowledge.");
      setEntries(cachedEntries());
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadData(true);
  }, []);

  const clients = useMemo(() => ["All clients", ...Array.from(new Set(entries.map((entry) => entry.client))).sort()], [entries]);
  const categories = useMemo(() => ["All", ...Array.from(new Set(entries.map((entry) => entry.category))).sort()], [entries]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const clientMatch = client === "All clients" || entry.client === client;
      const categoryMatch = category === "All" || entry.category === category;
      const freshnessMatch = freshnessFilter === "All freshness" || entry.freshnessStatus === freshnessFilter;
      const haystack = [entry.title, entry.client, entry.brandName, entry.category, entry.tags.join(" "), entry.content].join(" ").toLowerCase();
      return clientMatch && categoryMatch && freshnessMatch && (!term || haystack.includes(term));
    });
  }, [entries, query, client, category, freshnessFilter]);

  const selected = entries.find((entry) => entry.id === selectedId) || filtered[0] || entries[0];
  const draftBrands = brands.filter((brand) => brand.customerId === editDraft?.customerId);

  function openEntry(id: string) {
    setSelectedId(id);
    setScreen("document");
    setEditing(false);
    setEditDraft(null);
    setNotice("");
  }

  function beginEdit() {
    if (!selected) return;
    setEditDraft({ ...selected, tags: [...selected.tags] });
    setEditing(true);
  }

  async function saveEdit() {
    if (!editDraft || !editDraft.title.trim() || !editDraft.content.trim()) return;
    setSyncing(true);
    setError("");
    try {
      const selectedCustomer = customers.find((item) => item.id === editDraft.customerId);
      const payload = {
        ...editDraft,
        client: selectedCustomer?.name || editDraft.client || "Kretivco",
        filename: editDraft.filename.trim() || slugifyFilename(editDraft.title),
        source: editDraft.source === "built-in" ? "editor" : editDraft.source,
      };
      const data = await jsonRequest("/api/knowledge", { method: "PATCH", body: JSON.stringify(payload) });
      setEntries((current) => current.map((entry) => entry.id === data.entry.id ? data.entry : entry));
      setEditDraft(data.entry);
      setEditing(false);
      setNotice("Knowledge updated in Neon.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save knowledge.");
    } finally {
      setSyncing(false);
    }
  }

  async function markReviewed() {
    if (!selected) return;
    setSyncing(true);
    setError("");
    try {
      const reviewedAt = new Date().toISOString();
      const next = new Date(reviewedAt);
      next.setUTCDate(next.getUTCDate() + Number(selected.reviewIntervalDays || 90));
      const data = await jsonRequest("/api/knowledge", {
        method: "PATCH",
        body: JSON.stringify({ ...selected, lastReviewedAt: reviewedAt, nextReviewAt: next.toISOString().slice(0, 10) }),
      });
      setEntries((current) => current.map((entry) => entry.id === data.entry.id ? data.entry : entry));
      setNotice(`Knowledge reviewed. Next review: ${formatDate(data.entry.nextReviewAt)}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to mark this knowledge as reviewed.");
    } finally {
      setSyncing(false);
    }
  }

  async function deleteEntry() {
    if (!selected || !await confirm({ title: `Delete “${selected.title}”?`, description: "This removes the shared record for the whole team.", destructive: true })) return;
    setSyncing(true);
    setError("");
    try {
      await jsonRequest(`/api/knowledge?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      const remaining = entries.filter((entry) => entry.id !== selected.id);
      setEntries(remaining);
      localStorage.setItem(KNOWLEDGE_STORAGE_KEY, JSON.stringify(remaining));
      setSelectedId(remaining[0]?.id || "");
      setScreen("library");
      setEditing(false);
      setNotice("Knowledge deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete knowledge.");
    } finally {
      setSyncing(false);
    }
  }

  function downloadEntry() {
    if (!selected) return;
    const blob = new Blob([selected.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = selected.filename || slugifyFilename(selected.title);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Retrieval runs server-side across the whole library rather than over whatever
   * happens to be filtered on screen, and returns the entries it cited.
   */
  async function askKnowledge() {
    if (!ask.trim() || asking) return;
    setAsking(true);
    setAnswer("");
    setAnswerSources([]);
    try {
      const data = await jsonRequest("/api/knowledge/ask", {
        method: "POST",
        body: JSON.stringify({ question: ask }),
      });
      setAnswer(data.answer);
      setAnswerSources(data.sources || []);
    } catch (askError) {
      setAnswer(askError instanceof Error ? askError.message : "AI is unavailable.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 md:h-auto md:min-h-24 md:px-8 md:py-6">
          <Link href="/" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground-soft hover:bg-black/5" aria-label="Back to KretivOS"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0 flex-1">
            <div className="hidden text-[10px] font-semibold uppercase tracking-[.2em] text-accent md:block">Shared company memory</div>
            <h1 className="truncate text-lg font-semibold tracking-tight md:mt-1 md:text-3xl">Knowledge</h1>
            <p className="mt-1 hidden max-w-3xl text-sm leading-6 text-muted-foreground md:block">Shared Markdown knowledge from Neon with owners, source links, review schedules and freshness-aware AI answers.</p>
          </div>
          <Button variant="outline" size="icon" className="bg-card" onClick={() => loadData(false)} disabled={syncing} aria-label="Refresh knowledge"><RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} /></Button>
          <Button variant="outline" size="icon" className="bg-card md:hidden" onClick={() => setAiOpen(true)} aria-label="Ask Kretiv AI"><Bot className="h-4 w-4" /></Button>
          <Button variant="outline" className="hidden bg-card md:inline-flex" onClick={() => setAiOpen(true)}><Sparkles className="h-4 w-4" />Ask Kretiv AI</Button>
          <Button asChild size="icon" className="md:hidden" aria-label="Add"><Link href="/knowledge/add" aria-label="Add knowledge"><Plus className="h-5 w-5" /></Link></Button>
          <Button asChild className="hidden md:inline-flex"><Link href="/knowledge/add"><Upload className="h-4 w-4" />Add knowledge</Link></Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-4 md:px-8 md:py-7">
        {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")} className="rounded-md p-1 hover:bg-emerald-100"><X className="h-4 w-4" /></button></div>}
        {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><span>{error} Showing the latest offline cache where available.</span><button onClick={() => setError("")} className="rounded-md p-1 hover:bg-amber-100"><X className="h-4 w-4" /></button></div>}

        <div className="grid min-w-0 gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <section className={cn("min-w-0", screen === "document" && "hidden lg:block")}>
            <Card className="overflow-hidden border-black/8 bg-white/85 shadow-sm lg:sticky lg:top-[116px]"><CardContent className="p-0">
              <div className="z-20 border-b bg-white/95 p-3 backdrop-blur md:p-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} className="kretivos-search-control h-11 w-full rounded-xl border bg-card pl-11 pr-12 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10" placeholder="Search knowledge..." />
                  <button onClick={() => setFiltersOpen((value) => !value)} className={cn("absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg", filtersOpen || client !== "All clients" || freshnessFilter !== "All freshness" ? "bg-foreground text-white" : "text-muted-foreground hover:bg-black/5")} aria-label="Show filters"><SlidersHorizontal className="h-4 w-4" /></button>
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition", category === item ? "border-foreground bg-foreground text-white" : "border-black/8 bg-card text-muted-foreground hover:bg-background")}>{item}</button>)}</div>
                {filtersOpen && <div className="mt-3 grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-1"><label className="text-xs font-medium text-foreground-soft">Client / workspace<select value={client} onChange={(event) => setClient(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:border-accent">{clients.map((name) => <option key={name}>{name}</option>)}</select></label><label className="text-xs font-medium text-foreground-soft">Freshness<select value={freshnessFilter} onChange={(event) => setFreshnessFilter(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:border-accent">{freshnessOptions.map((name) => <option key={name}>{name}</option>)}</select></label></div>}
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{loading ? "Loading…" : `${filtered.length} of ${entries.length} files`}</span>{(query || client !== "All clients" || category !== "All" || freshnessFilter !== "All freshness") && <button onClick={() => { setQuery(""); setClient("All clients"); setCategory("All"); setFreshnessFilter("All freshness"); }} className="font-medium text-accent">Clear filters</button>}</div>
              </div>
              <div className="space-y-2 p-3 lg:max-h-[calc(100vh-270px)] lg:overflow-y-auto">
                {filtered.map((entry) => <button key={entry.id} onClick={() => openEntry(entry.id)} className={cn("group w-full rounded-2xl border p-3.5 text-left transition", selected?.id === entry.id ? "border-accent bg-card shadow-sm" : "border-black/8 bg-card hover:border-black/15 hover:bg-card")}>
                  <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-accent"><FileCode2 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h2 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{entry.title}</h2><ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" /></div><div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"><span>{entry.client}</span>{entry.brandName && <><span>•</span><span>{entry.brandName}</span></>}<span>•</span><span>{entry.category}</span></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{excerpt(entry.content) || "No summary available."}</p><div className="mt-2.5 flex items-center justify-between gap-2"><span className="text-[10px] text-muted-foreground">Updated {formatDate(entry.updatedAt)}</span><FreshnessBadge status={entry.freshnessStatus} /></div></div></div>
                </button>)}
                {!filtered.length && <div className="rounded-2xl border border-dashed p-8 text-center"><Search className="mx-auto h-6 w-6 text-muted-foreground" /><div className="mt-3 text-sm font-medium">No matching knowledge</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Try a different keyword, client or category.</p></div>}
              </div>
            </CardContent></Card>
          </section>

          <section className={cn("min-w-0", screen === "library" && "hidden lg:block")}>
            {selected ? <div className="space-y-4">
              <Card className="overflow-hidden border-black/8 bg-white/90 shadow-sm">
                <div className="border-b bg-card p-4 md:p-6">
                  <div className="flex items-start gap-3 lg:hidden"><button onClick={() => setScreen("library")} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-card" aria-label="Back to knowledge list"><ChevronLeft className="h-4 w-4" /></button><div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-accent">{selected.category}</div><h2 className="mt-1 line-clamp-2 text-lg font-semibold leading-6">{selected.title}</h2></div></div>
                  <div className="hidden items-start justify-between gap-6 lg:flex"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-accent"><span>{selected.client}</span>{selected.brandName && <><span>•</span><span>{selected.brandName}</span></>}<span>•</span><span>{selected.category}</span></div><h2 className="mt-2 break-words text-3xl font-semibold tracking-tight">{selected.title}</h2><div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Updated {formatDate(selected.updatedAt)}</span><span>{sourceLabel(selected.source)}</span><span>{selected.filename}</span></div></div><div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={downloadEntry}><Download className="h-3.5 w-3.5" />Download</Button><Button variant="outline" size="sm" onClick={beginEdit}><Pencil className="h-3.5 w-3.5" />Edit</Button><Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={deleteEntry}><Trash2 className="h-3.5 w-3.5" />Delete</Button></div></div>
                  <div className="mt-4 flex flex-wrap gap-2">{selected.tags.map((item) => <span key={item} className="inline-flex items-center gap-1 rounded-full border border-black/5 bg-card px-2.5 py-1 text-[10px] text-foreground-soft"><Tag className="h-3 w-3" />{item}</span>)}</div>
                  <div className="mt-4 flex flex-col justify-between gap-3 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><FreshnessBadge status={selected.freshnessStatus} /><span>Owner: <strong className="font-medium text-foreground-soft">{selected.owner || "Unassigned"}</strong></span><span>Next review: <strong className="font-medium text-foreground-soft">{formatDate(selected.nextReviewAt)}</strong></span>{selected.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">Open source<ExternalLink className="h-3 w-3" /></a>}</div><Button variant="outline" size="sm" onClick={markReviewed} disabled={syncing}><CheckCircle2 className="h-3.5 w-3.5" />Mark reviewed</Button></div>
                  <div className="mt-4 grid grid-cols-3 gap-2 lg:hidden"><Button variant="outline" size="sm" onClick={downloadEntry}><Download className="h-3.5 w-3.5" />Download</Button><Button variant="outline" size="sm" onClick={beginEdit}><Pencil className="h-3.5 w-3.5" />Edit</Button><Button variant="outline" size="sm" onClick={() => setAiOpen(true)}><Bot className="h-3.5 w-3.5" />Ask AI</Button></div>
                </div>
                <CardContent className="p-4 md:p-7">
                  {editing && editDraft ? <div className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Title"><Input value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} /></Field>
                      <Field label="Filename"><Input value={editDraft.filename} onChange={(event) => setEditDraft({ ...editDraft, filename: event.target.value })} /></Field>
                      <Field label="Customer / workspace"><Select value={editDraft.customerId || ""} onChange={(event) => { const customerId = event.target.value; const customer = customers.find((item) => item.id === customerId); setEditDraft({ ...editDraft, customerId: customerId || undefined, brandId: undefined, brandName: undefined, client: customer?.name || "Kretivco" }); }} ><option value="">Kretivco / Internal</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
                      <Field label="Brand"><Select value={editDraft.brandId || ""} onChange={(event) => { const brand = draftBrands.find((item) => item.id === event.target.value); setEditDraft({ ...editDraft, brandId: brand?.id, brandName: brand?.name }); }} disabled={!editDraft.customerId}><option value="">No specific brand</option>{draftBrands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
                      <Field label="Category"><Input value={editDraft.category} onChange={(event) => setEditDraft({ ...editDraft, category: event.target.value })} /></Field>
                      <Field label="Tags (comma separated)"><Input value={editDraft.tags.join(", ")} onChange={(event) => setEditDraft({ ...editDraft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></Field>
                      <Field label="Knowledge owner"><Input value={editDraft.owner || ""} onChange={(event) => setEditDraft({ ...editDraft, owner: event.target.value })} placeholder="Person or team responsible" /></Field>
                      <Field label="Source URL"><Input type="url" value={editDraft.sourceUrl || ""} onChange={(event) => setEditDraft({ ...editDraft, sourceUrl: event.target.value })} placeholder="https://…" /></Field>
                      <Field label="Review interval"><Select value={String(editDraft.reviewIntervalDays || 90)} onChange={(event) => setEditDraft({ ...editDraft, reviewIntervalDays: Number(event.target.value) })} ><option value="30">Every 30 days</option><option value="60">Every 60 days</option><option value="90">Every 90 days</option><option value="180">Every 180 days</option><option value="365">Every year</option></Select></Field>
                      <Field label="Next review"><DateInput value={editDraft.nextReviewAt?.slice(0, 10) || ""} onChange={(event) => setEditDraft({ ...editDraft, nextReviewAt: event.target.value })} /></Field>
                    </div>
                    <Field label="Markdown content"><textarea value={editDraft.content} onChange={(event) => setEditDraft({ ...editDraft, content: event.target.value })} className="min-h-[52vh] w-full resize-y rounded-xl border bg-card p-4 font-mono text-sm leading-6 outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 md:min-h-[520px]" /></Field>
                    <div className="sticky bottom-3 flex justify-end gap-2 rounded-2xl border bg-white/95 p-3 shadow-lg backdrop-blur"><Button variant="outline" onClick={() => { setEditing(false); setEditDraft(null); }}>Cancel</Button><Button onClick={saveEdit} disabled={syncing}><Save className="h-4 w-4" />Save changes</Button></div>
                  </div> : <article className="mx-auto max-w-4xl"><MarkdownPreview content={selected.content} /></article>}
                </CardContent>
              </Card>
              <button onClick={() => setAiOpen(true)} className="hidden w-full items-center justify-between rounded-2xl border border-foreground/10 bg-foreground p-5 text-left text-white transition hover:bg-foreground-soft lg:flex"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10"><Sparkles className="h-5 w-5 text-accent-muted" /></div><div><div className="font-semibold">Ask Kretiv AI about this document</div><div className="mt-1 text-xs text-white/50">Uses this file and up to three related shared records as grounded context.</div></div></div><ChevronRight className="h-5 w-5 text-white/40" /></button>
            </div> : <Card className="border-black/8 bg-white/85"><CardContent className="p-12 text-center"><Library className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-4 font-semibold">No knowledge files yet</div><Button asChild className="mt-4"><Link href="/knowledge/add"><Plus className="h-4 w-4" />Add knowledge</Link></Button></CardContent></Card>}
          </section>
        </div>
      </div>

      {aiOpen && <div className="fixed inset-0 z-[140]"><button className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setAiOpen(false)} aria-label="Close AI drawer" /><section role="dialog" aria-modal="true" aria-label="Ask Kretiv AI" className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[470px] md:rounded-none">
        <div className="flex items-start justify-between border-b bg-white/70 p-4 md:p-5"><div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-white"><Bot className="h-5 w-5" /></div><div><h2 className="font-semibold">Ask Kretiv AI</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Grounded in {selected ? `“${selected.title}”` : "the filtered library"}.</p></div></div><button onClick={() => setAiOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-black/5" aria-label="Close"><X className="h-4 w-4" /></button></div>
        <div className="flex-1 overflow-y-auto p-4 md:p-5">{!answer && <div className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-accent" />Suggested questions</div><div className="mt-3 space-y-2">{["Summarise the key decisions.", "What actions or deadlines are mentioned?", "Which commercial terms should the team remember?"].map((prompt) => <button key={prompt} onClick={() => setAsk(prompt)} className="w-full rounded-xl border bg-card px-3 py-3 text-left text-xs leading-5 hover:border-accent/40 hover:bg-card">{prompt}</button>)}</div></div>}{answer && <div className="space-y-3"><div className="whitespace-pre-wrap rounded-2xl border bg-card p-4 text-sm leading-7 text-foreground-soft">{answer}</div>{answerSources.length > 0 && <div className="rounded-2xl border bg-card p-3"><div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Sources used</div><div className="space-y-1.5">{answerSources.map((source) => <button key={source.index} onClick={() => { openEntry(source.id); setAiOpen(false); }} className="flex w-full items-start gap-2 rounded-lg border bg-card px-2.5 py-2 text-left text-[11px] transition hover:bg-card"><span className="font-semibold text-accent">[{source.index}]</span><span className="min-w-0"><span className="block truncate font-medium">{source.title}</span><span className="text-muted-foreground">{[source.customerName, source.category].filter(Boolean).join(" · ")}</span></span></button>)}</div></div>}</div>}</div>
        <div className="border-t bg-white/85 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur md:p-4"><div className="flex items-end gap-2 rounded-2xl border bg-card p-2 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10"><textarea value={ask} onChange={(event) => setAsk(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); askKnowledge(); } }} rows={2} className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none" placeholder="Ask about this knowledge..." /><Button size="icon" onClick={askKnowledge} disabled={asking || !ask.trim()} aria-label="Send question"><Send className="h-4 w-4" /></Button></div><p className="mt-2 px-1 text-[10px] text-muted-foreground">Verify important commercial or legal information against the source document.</p></div>
      </section></div>}

      <style jsx>{`
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { scrollbar-width: none; }
      `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <Label className="block text-foreground-soft">{label}<div className="mt-2">{children}</div></Label>;
}

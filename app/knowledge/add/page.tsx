"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Eye, FileCode2, RotateCcw, Save, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownPreview } from "@/components/markdown-preview";
import { KNOWLEDGE_STORAGE_KEY, KnowledgeEntry, slugifyFilename } from "@/lib/knowledge";
import { cn } from "@/lib/utils";

const starterContent = `# New Knowledge

## Summary

Write the key facts, decisions, rules or reusable learning here.

## Details

- Add important information
- Include dates, owners or references where useful
- Keep the content clear enough for KretivOS AI to use
`;

const categoryOptions = ["General", "Agreement", "Proposal", "Marketing", "Finance", "Technology", "Operations", "SOP", "Research", "Meeting Notes", "Template", "Brand", "Campaign"];

type Customer = { id: string; name: string };
type Brand = { id: string; customerId: string; name: string };

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export default function AddKnowledgePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [title, setTitle] = useState("New Knowledge");
  const [customerId, setCustomerId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [category, setCategory] = useState("General");
  const [tags, setTags] = useState("");
  const [filename, setFilename] = useState("new-knowledge.md");
  const [owner, setOwner] = useState("Kretivco Team");
  const [sourceUrl, setSourceUrl] = useState("");
  const [reviewIntervalDays, setReviewIntervalDays] = useState("90");
  const [content, setContent] = useState(starterContent);
  const [tab, setTab] = useState<"editor" | "preview">("editor");
  const [savedEntry, setSavedEntry] = useState<KnowledgeEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    jsonRequest("/api/business", { cache: "no-store" })
      .then((data) => {
        setCustomers((data.customers || []).map((item: any) => ({ id: item.id, name: item.name })));
        setBrands((data.brands || []).map((item: any) => ({ id: item.id, customerId: item.customerId, name: item.name })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (filename === "new-knowledge.md" || !filename.trim()) setFilename(slugifyFilename(title));
  }, [title, filename]);

  const availableBrands = useMemo(() => brands.filter((brand) => brand.customerId === customerId), [brands, customerId]);
  const wordCount = useMemo(() => content.trim().split(/\s+/).filter(Boolean).length, [content]);

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".md") && file.type !== "text/markdown" && file.type !== "text/plain") {
      setError("Please upload a Markdown (.md) file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Markdown file must be smaller than 2 MB.");
      return;
    }
    const text = await file.text();
    const firstHeading = text.split("\n").find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim();
    setTitle(firstHeading || file.name.replace(/\.md$/i, ""));
    setFilename(file.name);
    setContent(text);
    setError("");
    setSavedEntry(null);
  }

  async function saveKnowledge() {
    if (!title.trim() || !content.trim()) {
      setError("Title and Markdown content are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const customer = customers.find((item) => item.id === customerId);
      const data = await jsonRequest("/api/knowledge", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          customerId: customerId || undefined,
          brandId: brandId || undefined,
          client: customer?.name || "Kretivco",
          category,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          content,
          filename: filename.trim().endsWith(".md") ? filename.trim() : `${filename.trim() || slugifyFilename(title)}.md`,
          source: filename !== slugifyFilename(title) ? "markdown" : "editor",
          owner,
          sourceUrl,
          reviewIntervalDays: Number(reviewIntervalDays),
          lastReviewedAt: new Date().toISOString(),
        }),
      });
      setSavedEntry(data.entry);
      try {
        const cached = JSON.parse(localStorage.getItem(KNOWLEDGE_STORAGE_KEY) || "[]") as KnowledgeEntry[];
        const next = [data.entry, ...cached.filter((entry) => entry.id !== data.entry.id)];
        localStorage.setItem(KNOWLEDGE_STORAGE_KEY, JSON.stringify(next));
      } catch {}
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save knowledge.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setTitle("New Knowledge");
    setCustomerId("");
    setBrandId("");
    setCategory("General");
    setTags("");
    setFilename("new-knowledge.md");
    setOwner("Kretivco Team");
    setSourceUrl("");
    setReviewIntervalDays("90");
    setContent(starterContent);
    setTab("editor");
    setSavedEntry(null);
    setError("");
  }

  return (
    <main className="min-h-screen bg-[#f5f2ea] pb-24 text-[#202820]">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f5f2ea]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 md:h-auto md:min-h-24 md:px-8 md:py-6">
          <Button asChild variant="ghost" size="icon"><Link href="/knowledge" aria-label="Back to Knowledge"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div className="min-w-0 flex-1"><div className="hidden text-[10px] font-semibold uppercase tracking-[.2em] text-[#ba5c42] md:block">Shared knowledge ingestion</div><h1 className="truncate text-lg font-semibold tracking-tight md:mt-1 md:text-3xl">Add Knowledge</h1><p className="mt-1 hidden text-sm text-muted-foreground md:block">Upload Markdown or create a record that becomes available to the whole team through Neon.</p></div>
          <Button variant="outline" className="hidden bg-white md:inline-flex" onClick={reset}><RotateCcw className="h-4 w-4" />Reset</Button>
          <Button onClick={saveKnowledge} disabled={saving}><Save className="h-4 w-4" /><span className="hidden sm:inline">{saving ? "Saving…" : "Save knowledge"}</span></Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-4 md:px-8 md:py-7">
        {savedEntry && <div className="mb-4 flex flex-col justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 sm:flex-row sm:items-center"><div className="flex items-center gap-2"><Check className="h-4 w-4" /><span>Knowledge saved to the shared Neon library.</span></div><Link href="/knowledge" className="font-semibold underline underline-offset-4">View in library</Link></div>}
        {error && <div className="mb-4 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")} className="rounded-lg p-1 hover:bg-red-100"><X className="h-4 w-4" /></button></div>}

        <div className="mb-4 flex rounded-xl border bg-white p-1 md:hidden"><button onClick={() => setTab("editor")} className={cn("flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium", tab === "editor" ? "bg-[#202c25] text-white" : "text-muted-foreground")}><FileCode2 className="h-4 w-4" />Editor</button><button onClick={() => setTab("preview")} className={cn("flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium", tab === "preview" ? "bg-[#202c25] text-white" : "text-muted-foreground")}><Eye className="h-4 w-4" />Preview</button></div>

        <div className="grid min-w-0 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className={cn("space-y-4", tab === "preview" && "hidden lg:block")}>
            <Card className="border-black/8 bg-white/90 shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Import Markdown</h2><p className="mt-1 text-xs text-muted-foreground">Maximum 2 MB</p></div><Upload className="h-5 w-5 text-[#ba5c42]" /></div><input ref={inputRef} type="file" accept=".md,text/markdown,text/plain" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} /><button onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files?.[0]); }} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed bg-[#fbfaf7] p-4 text-left transition hover:border-[#ba5c42]/60 hover:bg-[#fff8f3]"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f1ece2]"><Upload className="h-5 w-5 text-[#ba5c42]" /></div><div><div className="text-sm font-semibold">Choose or drop .md</div><div className="mt-1 text-xs text-muted-foreground">Title is detected from the first H1.</div></div></button></CardContent></Card>

            <Card className="border-black/8 bg-white/90 shadow-sm"><CardContent className="space-y-4 p-4"><div><h2 className="font-semibold">Knowledge details</h2><p className="mt-1 text-xs text-muted-foreground">Used by filters, relationships and AI grounding.</p></div>
              <Field label="Title"><input value={title} onChange={(event) => { setTitle(event.target.value); setSavedEntry(null); }} className="field-control" /></Field>
              <Field label="Customer / workspace"><select value={customerId} onChange={(event) => { setCustomerId(event.target.value); setBrandId(""); setSavedEntry(null); }} className="field-control"><option value="">Kretivco / Internal</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Brand"><select value={brandId} onChange={(event) => { setBrandId(event.target.value); setSavedEntry(null); }} className="field-control" disabled={!customerId}><option value="">No specific brand</option>{availableBrands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Category"><select value={category} onChange={(event) => { setCategory(event.target.value); setSavedEntry(null); }} className="field-control">{categoryOptions.map((name) => <option key={name}>{name}</option>)}</select></Field>
              <Field label="Tags"><input value={tags} onChange={(event) => { setTags(event.target.value); setSavedEntry(null); }} className="field-control" placeholder="campaign, SOP, finance" /></Field>
              <Field label="Filename"><input value={filename} onChange={(event) => { setFilename(event.target.value); setSavedEntry(null); }} className="field-control" /></Field>
              <Field label="Knowledge owner"><input value={owner} onChange={(event) => { setOwner(event.target.value); setSavedEntry(null); }} className="field-control" placeholder="Marketing, Finance or a team member" /></Field>
              <Field label="Original source URL"><input type="url" value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); setSavedEntry(null); }} className="field-control" placeholder="https://…" /></Field>
              <Field label="Review every"><select value={reviewIntervalDays} onChange={(event) => { setReviewIntervalDays(event.target.value); setSavedEntry(null); }} className="field-control"><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option></select></Field>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f7f4ed] p-3 text-xs"><div><div className="text-muted-foreground">Words</div><div className="mt-1 font-semibold">{wordCount}</div></div><div><div className="text-muted-foreground">Storage</div><div className="mt-1 font-semibold">Neon</div></div></div>
            </CardContent></Card>
          </aside>

          <Card className="min-w-0 overflow-hidden border-black/8 bg-white/90 shadow-sm"><div className="hidden items-center justify-between border-b bg-[#fbfaf7] p-4 md:flex"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ece2]"><FileCode2 className="h-5 w-5 text-[#ba5c42]" /></div><div><h2 className="font-semibold">Markdown workspace</h2><p className="mt-1 text-xs text-muted-foreground">Edit and preview before saving.</p></div></div><div className="flex rounded-xl border bg-white p-1"><button onClick={() => setTab("editor")} className={cn("rounded-lg px-3 py-2 text-xs font-medium", tab === "editor" ? "bg-[#202c25] text-white" : "text-muted-foreground")}>Editor</button><button onClick={() => setTab("preview")} className={cn("rounded-lg px-3 py-2 text-xs font-medium", tab === "preview" ? "bg-[#202c25] text-white" : "text-muted-foreground")}>Preview</button></div></div><CardContent className="p-3 md:p-5">{tab === "editor" ? <textarea value={content} onChange={(event) => { setContent(event.target.value); setSavedEntry(null); }} className="min-h-[64dvh] w-full resize-y rounded-xl border bg-[#fcfbf8] p-4 font-mono text-sm leading-6 outline-none focus:border-[#ba5c42] focus:ring-4 focus:ring-[#ba5c42]/10 md:min-h-[650px]" /> : <div className="min-h-[64dvh] rounded-xl border bg-white p-4 md:min-h-[650px] md:p-7"><div className="mx-auto max-w-4xl"><MarkdownPreview content={content} /></div></div>}</CardContent></Card>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/90 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"><div className="mx-auto flex max-w-lg gap-2"><Button variant="outline" className="flex-1" onClick={reset}><RotateCcw className="h-4 w-4" />Reset</Button><Button className="flex-[1.5]" onClick={saveKnowledge} disabled={saving}><Save className="h-4 w-4" />{saving ? "Saving…" : "Save knowledge"}</Button></div></div>
      </div>

      <style jsx>{`
        .field-control { height: 2.75rem; width: 100%; border-radius: .75rem; border: 1px solid hsl(var(--border)); background: white; padding: 0 .8rem; font-size: .875rem; outline: none; }
        .field-control:focus { box-shadow: 0 0 0 4px rgba(186,92,66,.1); border-color: rgba(186,92,66,.6); }
      `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-[#4e5a52]">{label}<div className="mt-2">{children}</div></label>;
}

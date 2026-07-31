"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Eye, FileCode2, Library, RotateCcw, Save, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownPreview } from "@/components/markdown-preview";
import { builtInKnowledge, KNOWLEDGE_STORAGE_KEY, KnowledgeEntry, makeKnowledgeId, slugifyFilename } from "@/lib/knowledge";
import { cn } from "@/lib/utils";

const starterContent = `# New Knowledge

## Summary

Write the key facts, decisions, rules or reusable learning here.

## Details

- Add important information
- Include dates, owners or references where useful
- Keep the content clear enough for KretivOS AI to use
`;

const categoryOptions = [
  "General", "Agreement", "Proposal", "Marketing", "Finance", "Operations",
  "Technology", "Brand", "SOP", "Meeting Notes", "Research", "Template",
];

function loadEntries(): KnowledgeEntry[] {
  if (typeof window === "undefined") return builtInKnowledge;
  const saved = localStorage.getItem(KNOWLEDGE_STORAGE_KEY);
  if (!saved) return builtInKnowledge;
  try {
    const parsed = JSON.parse(saved) as KnowledgeEntry[];
    return Array.isArray(parsed) ? parsed : builtInKnowledge;
  } catch {
    return builtInKnowledge;
  }
}

export default function AddKnowledgePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("New Knowledge");
  const [client, setClient] = useState("Kretivco");
  const [category, setCategory] = useState("General");
  const [tags, setTags] = useState("");
  const [filename, setFilename] = useState("new-knowledge.md");
  const [content, setContent] = useState(starterContent);
  const [tab, setTab] = useState<"editor" | "preview">("editor");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [customerOptions, setCustomerOptions] = useState<string[]>(["Kretivco"]);

  useEffect(() => {
    if (filename === "new-knowledge.md" || !filename.trim()) setFilename(slugifyFilename(title));
  }, [title, filename]);

  useEffect(() => {
    const localClients = Array.from(new Set(loadEntries().map((entry) => entry.client)));
    setCustomerOptions(Array.from(new Set(["Kretivco", ...localClients])).sort());
    fetch("/api/business")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const names = Array.isArray(data?.customers) ? data.customers.map((item: any) => item.name).filter(Boolean) : [];
        if (names.length) setCustomerOptions(Array.from(new Set(["Kretivco", ...localClients, ...names])).sort());
      })
      .catch(() => {});
  }, []);

  const wordCount = useMemo(() => content.trim() ? content.trim().split(/\s+/).length : 0, [content]);

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
    setSaved(false);
  }

  function saveKnowledge() {
    if (!title.trim() || !content.trim()) {
      setError("Title and Markdown content are required.");
      return;
    }
    const now = new Date().toISOString();
    const record: KnowledgeEntry = {
      id: makeKnowledgeId(),
      title: title.trim(),
      client: client.trim() || "General",
      category: category.trim() || "General",
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      content,
      filename: filename.trim().endsWith(".md") ? filename.trim() : `${filename.trim() || slugifyFilename(title)}.md`,
      createdAt: now,
      updatedAt: now,
      source: filename !== slugifyFilename(title) ? "markdown" : "editor",
    };
    const current = loadEntries();
    localStorage.setItem(KNOWLEDGE_STORAGE_KEY, JSON.stringify([record, ...current]));
    setSaved(true);
    setError("");
  }

  function reset() {
    setTitle("New Knowledge");
    setClient("Kretivco");
    setCategory("General");
    setTags("");
    setFilename("new-knowledge.md");
    setContent(starterContent);
    setTab("editor");
    setSaved(false);
    setError("");
  }

  return (
    <main className="min-h-screen bg-[#f5f2ea] pb-24 text-[#202820]">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f5f2ea]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 md:h-auto md:min-h-24 md:px-8 md:py-6">
          <Button asChild variant="ghost" size="icon"><Link href="/knowledge" aria-label="Back to Knowledge"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div className="min-w-0 flex-1">
            <div className="hidden text-[10px] font-semibold uppercase tracking-[.2em] text-[#ba5c42] md:block">Knowledge ingestion</div>
            <h1 className="truncate text-lg font-semibold tracking-tight md:mt-1 md:text-3xl">Add Knowledge</h1>
            <p className="mt-1 hidden text-sm text-muted-foreground md:block">Upload Markdown or create a structured knowledge record for search and AI context.</p>
          </div>
          <Button variant="outline" className="hidden bg-white md:inline-flex" onClick={reset}><RotateCcw className="h-4 w-4" />Reset</Button>
          <Button onClick={saveKnowledge}><Save className="h-4 w-4" /><span className="hidden sm:inline">Save knowledge</span></Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-4 md:px-8 md:py-7">
        {saved && (
          <div className="mb-4 flex flex-col justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2"><Check className="h-4 w-4" /><span>Knowledge saved successfully.</span></div>
            <Link href="/knowledge" className="font-semibold underline underline-offset-4">View in library</Link>
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <span>{error}</span><button onClick={() => setError("")} className="rounded-lg p-1 hover:bg-red-100"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="mb-4 flex rounded-xl border bg-white p-1 md:hidden">
          <button onClick={() => setTab("editor")} className={cn("flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium", tab === "editor" ? "bg-[#202c25] text-white" : "text-muted-foreground")}><FileCode2 className="h-4 w-4" />Editor</button>
          <button onClick={() => setTab("preview")} className={cn("flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium", tab === "preview" ? "bg-[#202c25] text-white" : "text-muted-foreground")}><Eye className="h-4 w-4" />Preview</button>
        </div>

        <div className="grid min-w-0 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className={cn("space-y-4", tab === "preview" && "hidden lg:block")}>
            <Card className="border-black/8 bg-white/90 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between"><div><h2 className="font-semibold">Import Markdown</h2><p className="mt-1 text-xs text-muted-foreground">Maximum 2 MB</p></div><Upload className="h-5 w-5 text-[#ba5c42]" /></div>
                <input ref={inputRef} type="file" accept=".md,text/markdown,text/plain" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
                <button onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files?.[0]); }} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed bg-[#fbfaf7] p-4 text-left transition hover:border-[#ba5c42]/60 hover:bg-[#fff8f3]">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f1ece2]"><Upload className="h-5 w-5 text-[#ba5c42]" /></div>
                  <div><div className="text-sm font-semibold">Choose or drop .md</div><div className="mt-1 text-xs text-muted-foreground">Metadata will be detected automatically.</div></div>
                </button>
              </CardContent>
            </Card>

            <Card className="border-black/8 bg-white/90 shadow-sm">
              <CardContent className="space-y-4 p-4">
                <div><h2 className="font-semibold">Knowledge details</h2><p className="mt-1 text-xs text-muted-foreground">Used by filters, search and AI grounding.</p></div>
                <Field label="Title"><input value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false); }} className="field-control" /></Field>
                <Field label="Client / workspace"><select value={client} onChange={(event) => { setClient(event.target.value); setSaved(false); }} className="field-control">{customerOptions.map((name) => <option key={name}>{name}</option>)}</select></Field>
                <Field label="Category"><select value={category} onChange={(event) => { setCategory(event.target.value); setSaved(false); }} className="field-control">{categoryOptions.map((name) => <option key={name}>{name}</option>)}</select></Field>
                <Field label="Tags"><input value={tags} onChange={(event) => { setTags(event.target.value); setSaved(false); }} className="field-control" placeholder="campaign, SOP, finance" /></Field>
                <Field label="Filename"><input value={filename} onChange={(event) => { setFilename(event.target.value); setSaved(false); }} className="field-control" /></Field>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f7f4ed] p-3 text-xs"><div><div className="text-muted-foreground">Words</div><div className="mt-1 font-semibold">{wordCount}</div></div><div><div className="text-muted-foreground">Format</div><div className="mt-1 font-semibold">Markdown</div></div></div>
              </CardContent>
            </Card>
          </aside>

          <Card className="min-w-0 overflow-hidden border-black/8 bg-white/90 shadow-sm">
            <div className="hidden items-center justify-between border-b bg-[#fbfaf7] p-4 md:flex">
              <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ece2]"><FileCode2 className="h-5 w-5 text-[#ba5c42]" /></div><div><h2 className="font-semibold">Markdown workspace</h2><p className="mt-1 text-xs text-muted-foreground">Edit and preview before saving.</p></div></div>
              <div className="flex rounded-xl border bg-white p-1"><button onClick={() => setTab("editor")} className={cn("rounded-lg px-3 py-2 text-xs font-medium", tab === "editor" ? "bg-[#202c25] text-white" : "text-muted-foreground")}>Editor</button><button onClick={() => setTab("preview")} className={cn("rounded-lg px-3 py-2 text-xs font-medium", tab === "preview" ? "bg-[#202c25] text-white" : "text-muted-foreground")}>Preview</button></div>
            </div>
            <CardContent className="p-3 md:p-5">
              {tab === "editor" ? (
                <textarea value={content} onChange={(event) => { setContent(event.target.value); setSaved(false); }} className="min-h-[64dvh] w-full resize-y rounded-xl border bg-[#fcfbf8] p-4 font-mono text-sm leading-6 outline-none focus:border-[#ba5c42] focus:ring-4 focus:ring-[#ba5c42]/10 md:min-h-[650px]" />
              ) : (
                <div className="min-h-[64dvh] rounded-xl border bg-white p-4 md:min-h-[650px] md:p-7"><div className="mx-auto max-w-4xl"><MarkdownPreview content={content} /></div></div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/90 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-lg gap-2"><Button variant="outline" className="flex-1" onClick={reset}><RotateCcw className="h-4 w-4" />Reset</Button><Button className="flex-[1.5]" onClick={saveKnowledge}><Save className="h-4 w-4" />Save knowledge</Button></div>
        </div>
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

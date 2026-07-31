"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, FileCode2, Library, Save, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownPreview } from "@/components/markdown-preview";
import { WorkspacePage } from "@/components/workspace-page";
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

function loadEntries(): KnowledgeEntry[] {
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

  useEffect(() => {
    if (filename === "new-knowledge.md" || !filename.trim()) setFilename(slugifyFilename(title));
  }, [title, filename]);

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".md") && file.type !== "text/markdown") {
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
    setSaved(false);
    setError("");
  }

  return (
    <WorkspacePage
      eyebrow="Knowledge ingestion"
      title="Add Knowledge"
      description="Upload an existing .md file or write structured Markdown directly. The record is saved into the mobile PWA Knowledge Library and becomes available for search and AI context."
      actions={<Link href="/knowledge" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium hover:bg-secondary"><Library className="h-4 w-4" />Open library</Link>}
    >
      {saved && <div className="mb-5 flex flex-col justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 sm:flex-row sm:items-center"><div className="flex items-center gap-2"><Check className="h-4 w-4" /><span>Knowledge saved successfully.</span></div><Link href="/knowledge" className="font-semibold underline underline-offset-4">View in library</Link></div>}
      {error && <div className="mb-5 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}

      <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card className="bg-white/80">
            <CardHeader><CardTitle>Import Markdown</CardTitle><p className="mt-1 text-xs text-muted-foreground">Upload a .md file. Its first H1 heading becomes the title.</p></CardHeader>
            <CardContent>
              <input ref={inputRef} type="file" accept=".md,text/markdown,text/plain" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
              <button onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files?.[0]); }} className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed bg-[#faf8f2] px-5 py-10 text-center transition hover:border-[#ba5c42] hover:bg-[#fff8f4]">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#eee9df]"><Upload className="h-5 w-5 text-[#ba5c42]" /></div>
                <div className="mt-4 text-sm font-semibold">Choose or drop a .md file</div>
                <div className="mt-1 text-xs text-muted-foreground">Maximum 2 MB</div>
              </button>
            </CardContent>
          </Card>

          <Card className="bg-white/80">
            <CardHeader><CardTitle>Knowledge details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Title"><input value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false); }} className="input" /></Field>
              <Field label="Client / workspace"><input value={client} onChange={(event) => { setClient(event.target.value); setSaved(false); }} className="input" placeholder="Chef Ammar, Kretivco, Smart Selangor" /></Field>
              <Field label="Category"><input value={category} onChange={(event) => { setCategory(event.target.value); setSaved(false); }} className="input" placeholder="Agreement, Marketing, Technology" /></Field>
              <Field label="Tags"><input value={tags} onChange={(event) => { setTags(event.target.value); setSaved(false); }} className="input" placeholder="campaign, SOP, finance" /></Field>
              <Field label="Filename"><input value={filename} onChange={(event) => { setFilename(event.target.value); setSaved(false); }} className="input" /></Field>
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0 bg-white/80">
          <CardHeader className="border-b p-4 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div><div className="flex items-center gap-2"><FileCode2 className="h-5 w-5 text-[#ba5c42]" /><CardTitle>Markdown workspace</CardTitle></div><p className="mt-1 text-xs text-muted-foreground">Edit and preview before saving.</p></div>
              <div className="flex rounded-lg border bg-white p-1"><button onClick={() => setTab("editor")} className={cn("flex-1 rounded-md px-3 py-2 text-xs font-medium sm:flex-none", tab === "editor" ? "bg-[#202c25] text-white" : "text-muted-foreground")}>Editor</button><button onClick={() => setTab("preview")} className={cn("flex-1 rounded-md px-3 py-2 text-xs font-medium sm:flex-none", tab === "preview" ? "bg-[#202c25] text-white" : "text-muted-foreground")}>Preview</button></div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {tab === "editor" ? <textarea value={content} onChange={(event) => { setContent(event.target.value); setSaved(false); }} className="min-h-[56vh] w-full resize-y rounded-xl border bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-[#ba5c42] sm:min-h-[620px]" /> : <div className="min-h-[56vh] rounded-xl border bg-white p-4 sm:min-h-[620px] sm:p-6"><MarkdownPreview content={content} /></div>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={reset}>Reset</Button><Button onClick={saveKnowledge}><Save className="h-4 w-4" />Save knowledge</Button></div>
          </CardContent>
        </Card>
      </div>

      <style jsx>{`
        .input { height: 2.75rem; width: 100%; border-radius: .65rem; border: 1px solid hsl(var(--border)); background: white; padding: 0 .8rem; font-size: .875rem; outline: none; }
        .input:focus { box-shadow: 0 0 0 3px rgba(186,92,66,.12); border-color: rgba(186,92,66,.55); }
      `}</style>
    </WorkspacePage>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium">{label}<div className="mt-2">{children}</div></label>;
}

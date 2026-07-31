"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bot, CalendarDays, Download, FileCode2, Library, Pencil, Plus, Save, Search, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownPreview } from "@/components/markdown-preview";
import { WorkspacePage } from "@/components/workspace-page";
import { builtInKnowledge, KNOWLEDGE_STORAGE_KEY, KnowledgeEntry, slugifyFilename } from "@/lib/knowledge";
import { cn } from "@/lib/utils";

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

export default function KnowledgeLibraryPage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>(builtInKnowledge);
  const [selectedId, setSelectedId] = useState(builtInKnowledge[0]?.id || "");
  const [query, setQuery] = useState("");
  const [client, setClient] = useState("All clients");
  const [mobileListOpen, setMobileListOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<KnowledgeEntry | null>(null);
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const loaded = loadEntries();
    setEntries(loaded);
    setSelectedId((current) => loaded.some((entry) => entry.id === current) ? current : loaded[0]?.id || "");
  }, []);

  useEffect(() => {
    localStorage.setItem(KNOWLEDGE_STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const clients = useMemo(() => ["All clients", ...Array.from(new Set(entries.map((entry) => entry.client))).sort()], [entries]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const clientMatch = client === "All clients" || entry.client === client;
      const haystack = [entry.title, entry.client, entry.category, entry.tags.join(" "), entry.content].join(" ").toLowerCase();
      return clientMatch && (!term || haystack.includes(term));
    });
  }, [entries, query, client]);

  const selected = entries.find((entry) => entry.id === selectedId) || filtered[0] || entries[0];

  function openEntry(id: string) {
    setSelectedId(id);
    setMobileListOpen(false);
    setEditing(false);
    setNotice("");
  }

  function beginEdit() {
    if (!selected) return;
    setEditDraft({ ...selected, tags: [...selected.tags] });
    setEditing(true);
  }

  function saveEdit() {
    if (!editDraft || !editDraft.title.trim() || !editDraft.content.trim()) return;
    const updated = {
      ...editDraft,
      title: editDraft.title.trim(),
      client: editDraft.client.trim() || "General",
      category: editDraft.category.trim() || "General",
      filename: editDraft.filename.trim() || slugifyFilename(editDraft.title),
      updatedAt: new Date().toISOString(),
      source: editDraft.source === "built-in" ? "editor" as const : editDraft.source,
    };
    setEntries((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    setEditDraft(updated);
    setEditing(false);
    setNotice("Knowledge updated.");
  }

  function deleteEntry() {
    if (!selected) return;
    const confirmed = window.confirm(`Delete “${selected.title}”? This removes it from this PWA browser.`);
    if (!confirmed) return;
    const remaining = entries.filter((entry) => entry.id !== selected.id);
    setEntries(remaining);
    setSelectedId(remaining[0]?.id || "");
    setMobileListOpen(true);
    setEditing(false);
    setNotice("Knowledge deleted.");
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

  async function askKnowledge() {
    if (!ask.trim() || asking) return;
    setAsking(true);
    setAnswer("");
    try {
      const contextEntries = selected ? [selected, ...filtered.filter((entry) => entry.id !== selected.id).slice(0, 3)] : filtered.slice(0, 4);
      const context = contextEntries.map((entry) => `SOURCE: ${entry.title}\nCLIENT: ${entry.client}\n${entry.content.slice(0, 6000)}`).join("\n\n---\n\n");
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "Knowledge Library",
          messages: [{ role: "user", content: `Answer the question only from the supplied KretivOS knowledge. Cite the source titles used. If the answer is not present, say so.\n\nQUESTION:\n${ask}\n\nKNOWLEDGE:\n${context}` }],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI request failed");
      setAnswer(data.content);
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : "AI is unavailable.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <WorkspacePage
      eyebrow="Company memory"
      title="Knowledge Library"
      description="Upload, create, search, edit and delete Markdown knowledge by client. Selected records can be used as grounded context for ai-nonymauz-cloud."
      actions={
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setMobileListOpen((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium xl:hidden"><Library className="h-4 w-4" />{mobileListOpen ? "Hide files" : "Show files"}</button>
          <Link href="/knowledge/add" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" />Add knowledge</Link>
        </div>
      }
    >
      {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className={cn("h-fit bg-white/80 xl:sticky xl:top-5 xl:block", !mobileListOpen && "hidden")}>
          <CardHeader className="border-b p-4 sm:p-5">
            <div className="flex items-center justify-between"><div><CardTitle>Knowledge files</CardTitle><p className="mt-1 text-xs text-muted-foreground">{entries.length} Markdown records</p></div><Library className="h-5 w-5 text-[#ba5c42]" /></div>
            <div className="mt-4 space-y-2">
              <div className="flex h-10 items-center gap-2 rounded-lg border bg-white px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 text-sm outline-none" placeholder="Search title or content" /></div>
              <select value={client} onChange={(event) => setClient(event.target.value)} className="h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none">{clients.map((name) => <option key={name}>{name}</option>)}</select>
            </div>
          </CardHeader>
          <CardContent className="max-h-[58vh] space-y-2 overflow-y-auto p-3 xl:max-h-[calc(100vh-260px)]">
            {filtered.map((entry) => (
              <button key={entry.id} onClick={() => openEntry(entry.id)} className={cn("w-full rounded-xl border p-4 text-left transition", selected?.id === entry.id ? "border-[#ba5c42] bg-[#fff8f4]" : "bg-white hover:bg-[#f8f5ee]") }>
                <div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eee9df]"><FileCode2 className="h-4 w-4 text-[#ba5c42]" /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{entry.title}</div><div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground"><span>{entry.client}</span><span>•</span><span>{entry.category}</span></div><div className="mt-2 truncate text-[10px] text-muted-foreground">{entry.filename}</div></div></div>
              </button>
            ))}
            {!filtered.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No knowledge matches your search.</div>}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          {selected ? (
            <>
              <Card className="bg-white/80">
                <CardHeader className="border-b p-4 sm:p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[.15em] text-[#ba5c42]"><span>{selected.client}</span><span>•</span><span>{selected.category}</span></div><CardTitle className="mt-2 break-words text-2xl">{selected.title}</CardTitle><div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />Updated {new Date(selected.updatedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}</span><span>{selected.filename}</span></div></div>
                    <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={downloadEntry}><Download className="h-3.5 w-3.5" />Download</Button><Button variant="outline" size="sm" onClick={beginEdit}><Pencil className="h-3.5 w-3.5" />Edit</Button><Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={deleteEntry}><Trash2 className="h-3.5 w-3.5" />Delete</Button></div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">{selected.tags.map((item) => <span key={item} className="inline-flex items-center gap-1 rounded-full bg-[#eeeae0] px-2.5 py-1 text-[10px] text-[#5a605a]"><Tag className="h-3 w-3" />{item}</span>)}</div>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  {editing && editDraft ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Title"><input value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} className="input" /></Field>
                        <Field label="Filename"><input value={editDraft.filename} onChange={(event) => setEditDraft({ ...editDraft, filename: event.target.value })} className="input" /></Field>
                        <Field label="Client"><input value={editDraft.client} onChange={(event) => setEditDraft({ ...editDraft, client: event.target.value })} className="input" /></Field>
                        <Field label="Category"><input value={editDraft.category} onChange={(event) => setEditDraft({ ...editDraft, category: event.target.value })} className="input" /></Field>
                        <Field label="Tags (comma separated)" wide><input value={editDraft.tags.join(", ")} onChange={(event) => setEditDraft({ ...editDraft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} className="input" /></Field>
                      </div>
                      <Field label="Markdown content"><textarea value={editDraft.content} onChange={(event) => setEditDraft({ ...editDraft, content: event.target.value })} className="min-h-[420px] w-full resize-y rounded-xl border bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-[#ba5c42]" /></Field>
                      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => { setEditing(false); setEditDraft(null); }}>Cancel</Button><Button onClick={saveEdit}><Save className="h-4 w-4" />Save changes</Button></div>
                    </div>
                  ) : (
                    <div className="mx-auto max-w-4xl"><MarkdownPreview content={selected.content} /></div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-[#26342b] text-white">
                <CardHeader className="p-4 sm:p-6"><div className="flex items-center gap-2"><Bot className="h-5 w-5 text-[#ef9a75]" /><CardTitle>Ask Kretiv AI</CardTitle></div><p className="mt-1 text-xs text-white/45">The selected knowledge file and up to three relevant filtered files are supplied as context.</p></CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <div className="flex flex-col gap-2 sm:flex-row"><textarea value={ask} onChange={(event) => setAsk(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); askKnowledge(); } }} className="min-h-12 flex-1 resize-none rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35" placeholder="Ask a question from this knowledge..." /><Button variant="secondary" className="shrink-0" onClick={askKnowledge} disabled={asking}>{asking ? "Thinking…" : "Ask AI"}</Button></div>
                  {answer && <div className="mt-4 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/10 p-4 text-sm leading-7 text-white/70">{answer}</div>}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="bg-white/80"><CardContent className="p-12 text-center"><Library className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-4 font-semibold">No knowledge files yet</div><Link href="/knowledge/add" className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" />Add knowledge</Link></CardContent></Card>
          )}
        </div>
      </div>

      <style jsx>{`
        .input { height: 2.75rem; width: 100%; border-radius: .65rem; border: 1px solid hsl(var(--border)); background: white; padding: 0 .8rem; font-size: .875rem; outline: none; }
        .input:focus { box-shadow: 0 0 0 3px rgba(186,92,66,.12); border-color: rgba(186,92,66,.55); }
      `}</style>
    </WorkspacePage>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={cn("block text-xs font-medium", wide && "md:col-span-2")}>{label}<div className="mt-2">{children}</div></label>;
}

"use client";

import { isValidElement, useEffect, useMemo, useState } from "react";
import {
  Bot, Check, ChevronLeft, Copy, Palette, Plus, RefreshCw, Save,
  Search, ShieldCheck, Sparkles, Trash2, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea, isTextField } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { AIWritingButton } from "@/components/ai-writing-button";
import { WorkspacePage } from "@/components/workspace-page";
import { cn } from "@/lib/utils";

type Profile = {
  id: string;
  brandId: string;
  status: string;
  positioning: string;
  audience: string;
  personality: string;
  voice: string;
  messaging: Record<string, any>;
  colours: string[];
  typography: Record<string, any>;
  photographyDirection: string;
  approvedClaims: string[];
  avoidList: string[];
  evidence: any[];
  aiSuggestions: Suggestion[];
  completenessScore: number;
  approvedAt: string;
  createdAt: string;
  updatedAt: string;
};

type Brand = {
  id: string;
  customerId: string;
  customerName: string;
  name: string;
  description: string;
  status: string;
  websiteUrl: string;
  profiles: Profile[];
};

type Suggestion = { field: string; label: string; value: any; reason?: string };
type KnowledgeEntry = { id: string; title: string; customerId?: string; brandId?: string; content: string; category: string };

const emptyProfile = (brandId: string): Profile => ({
  id: "",
  brandId,
  status: "Draft",
  positioning: "",
  audience: "",
  personality: "",
  voice: "",
  messaging: { valueProposition: "", coreMessages: "", preferredWords: "" },
  colours: [],
  typography: { heading: "", body: "" },
  photographyDirection: "",
  approvedClaims: [],
  avoidList: [],
  evidence: [],
  aiSuggestions: [],
  completenessScore: 0,
  approvedAt: "",
  createdAt: "",
  updatedAt: "",
});

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function parseLines(value: string) {
  return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

function formatDate(value?: string) {
  if (!value) return "Not saved";
  return new Date(value).toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function BrandDNAWorkspace() {
  const confirm = useConfirm();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [draft, setDraft] = useState<Profile | null>(null);
  const [query, setQuery] = useState("");
  const [mobileDetail, setMobileDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [brandData, knowledgeData] = await Promise.all([
        jsonRequest("/api/brand-dna", { cache: "no-store" }),
        jsonRequest("/api/knowledge", { cache: "no-store" }).catch(() => ({ entries: [] })),
      ]);
      const nextBrands = brandData.brands as Brand[];
      setBrands(nextBrands);
      setKnowledge(knowledgeData.entries || []);
      setSelectedBrandId((current) => nextBrands.some((brand) => brand.id === current) ? current : nextBrands[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Brand DNA.");
    } finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  const filteredBrands = useMemo(() => {
    const term = query.trim().toLowerCase();
    return brands.filter((brand) => !term || [brand.name, brand.customerName, brand.description].join(" ").toLowerCase().includes(term));
  }, [brands, query]);

  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId) || filteredBrands[0];
  const selectedProfile = selectedBrand?.profiles.find((profile) => profile.id === selectedProfileId) || selectedBrand?.profiles[0];
  const linkedKnowledge = useMemo(() => knowledge.filter((entry) => entry.brandId === selectedBrand?.id || entry.customerId === selectedBrand?.customerId), [knowledge, selectedBrand]);

  useEffect(() => {
    if (!selectedBrand) return;
    const profile = selectedBrand.profiles.find((item) => item.id === selectedProfileId) || selectedBrand.profiles[0];
    setSelectedProfileId(profile?.id || "");
    setDraft(profile ? JSON.parse(JSON.stringify(profile)) : emptyProfile(selectedBrand.id));
  }, [selectedBrandId, selectedProfileId, brands]);

  function selectBrand(id: string) {
    setSelectedBrandId(id);
    setSelectedProfileId("");
    setMobileDetail(true);
    setNotice("");
  }

  async function saveProfile(nextStatus?: string) {
    if (!draft || !selectedBrand) return;
    setSaving(true);
    setError("");
    try {
      const payload = { ...draft, brandId: selectedBrand.id, status: nextStatus || draft.status };
      const data = await jsonRequest("/api/brand-dna", { method: draft.id ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setBrands((current) => current.map((brand) => brand.id === selectedBrand.id ? {
        ...brand,
        profiles: draft.id ? brand.profiles.map((profile) => profile.id === data.profile.id ? data.profile : profile) : [data.profile, ...brand.profiles],
      } : brand));
      setSelectedProfileId(data.profile.id);
      setDraft(data.profile);
      setNotice(nextStatus === "Approved" ? "Brand DNA approved and published." : "Brand DNA saved to Neon.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save Brand DNA."); }
    finally { setSaving(false); }
  }

  async function createVersion() {
    if (!selectedBrand) return;
    const source = selectedProfile || emptyProfile(selectedBrand.id);
    setDraft({ ...JSON.parse(JSON.stringify(source)), id: "", status: "Draft", approvedAt: "", aiSuggestions: [], createdAt: "", updatedAt: "" });
    setSelectedProfileId("");
    setNotice("New draft version created. Save when ready.");
  }

  async function deleteProfile() {
    if (!draft?.id || draft.status === "Approved" || !selectedBrand) return;
    if (!await confirm({ title: "Delete this draft Brand DNA version?", description: "Published versions are not affected.", destructive: true })) return;
    setSaving(true);
    try {
      await jsonRequest(`/api/brand-dna?id=${encodeURIComponent(draft.id)}`, { method: "DELETE" });
      setBrands((current) => current.map((brand) => brand.id === selectedBrand.id ? { ...brand, profiles: brand.profiles.filter((profile) => profile.id !== draft.id) } : brand));
      setSelectedProfileId("");
      setNotice("Draft version deleted.");
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Unable to delete profile."); }
    finally { setSaving(false); }
  }

  async function generateSuggestions() {
    if (!draft || !selectedBrand) return;
    setGenerating(true);
    setError("");
    try {
      const evidence = linkedKnowledge.slice(0, 8).map((entry) => `SOURCE: ${entry.title}\n${entry.content.slice(0, 3500)}`).join("\n\n---\n\n");
      const data = await jsonRequest("/api/ai", {
        method: "POST",
        body: JSON.stringify({
          module: "Brand DNA",
          messages: [{ role: "user", content: `Analyse the brand evidence and current Brand DNA. Return only a JSON array. Each array item must have field, label, value and reason. Use only these fields: positioning, audience, personality, voice, valueProposition, coreMessages, preferredWords, colours, headingFont, bodyFont, photographyDirection, approvedClaims, avoidList. Do not invent factual product claims; suggestions without evidence must be phrased as positioning direction, not facts.\n\nCUSTOMER: ${selectedBrand.customerName}\nBRAND: ${selectedBrand.name}\nDESCRIPTION: ${selectedBrand.description}\nCURRENT DNA: ${JSON.stringify(draft)}\nEVIDENCE:\n${evidence || "No linked knowledge is currently available."}` }],
        }),
      });
      const raw = String(data.content || "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const suggestions = JSON.parse(raw) as Suggestion[];
      if (!Array.isArray(suggestions)) throw new Error("AI did not return a suggestion list.");
      setDraft({ ...draft, aiSuggestions: suggestions, evidence: linkedKnowledge.map((entry) => ({ id: entry.id, title: entry.title, category: entry.category })) });
      setNotice("AI suggestions generated. Review each field before applying or approving.");
    } catch (suggestionError) { setError(suggestionError instanceof Error ? suggestionError.message : "Unable to generate suggestions."); }
    finally { setGenerating(false); }
  }

  function applySuggestion(suggestion: Suggestion) {
    if (!draft) return;
    const value = suggestion.value;
    const next = { ...draft, aiSuggestions: draft.aiSuggestions.filter((item) => item !== suggestion) };
    if (suggestion.field === "valueProposition") next.messaging = { ...next.messaging, valueProposition: String(value ?? "") };
    else if (suggestion.field === "coreMessages") next.messaging = { ...next.messaging, coreMessages: Array.isArray(value) ? value.join("\n") : String(value ?? "") };
    else if (suggestion.field === "preferredWords") next.messaging = { ...next.messaging, preferredWords: Array.isArray(value) ? value.join(", ") : String(value ?? "") };
    else if (suggestion.field === "headingFont") next.typography = { ...next.typography, heading: String(value ?? "") };
    else if (suggestion.field === "bodyFont") next.typography = { ...next.typography, body: String(value ?? "") };
    else if (suggestion.field === "approvedClaims") next.approvedClaims = Array.isArray(value) ? value.map(String) : parseLines(String(value ?? ""));
    else if (suggestion.field === "avoidList") next.avoidList = Array.isArray(value) ? value.map(String) : parseLines(String(value ?? ""));
    else if (suggestion.field === "colours") next.colours = Array.isArray(value) ? value.map(String) : parseLines(String(value ?? ""));
    else if (suggestion.field === "photographyDirection") next.photographyDirection = String(value ?? "");
    else if (["positioning", "audience", "personality", "voice"].includes(suggestion.field)) (next as any)[suggestion.field] = String(value ?? "");
    setDraft(next);
  }

  function rejectSuggestion(suggestion: Suggestion) {
    if (!draft) return;
    setDraft({ ...draft, aiSuggestions: draft.aiSuggestions.filter((item) => item !== suggestion) });
  }

  return (
    <WorkspacePage eyebrow="Multi-brand source of truth" title="Brand DNA" description="Create a separate, versioned identity for every customer brand. AI may suggest missing fields, but only human-reviewed values can be approved." actions={<div className="flex gap-2"><Button variant="outline" className="bg-card" onClick={loadData} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Button>{selectedBrand && <Button onClick={createVersion}><Copy className="h-4 w-4" />New version</Button>}</div>}>
      {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}
      {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}

      <div className="grid gap-5 xl:grid-cols-[350px_minmax(0,1fr)]">
        <Card className={cn("overflow-hidden bg-white/80", mobileDetail && "hidden xl:block")}><CardHeader className="border-b p-4"><div className="flex items-center justify-between"><div><CardTitle>Customer brands</CardTitle><p className="mt-1 text-xs text-muted-foreground">{brands.length} brands</p></div><Palette className="h-5 w-5 text-accent" /></div><div className="kretivos-search-control mt-4 flex h-11 items-center gap-2 rounded-xl border bg-card px-3"><Search className="h-5 w-5 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 text-sm outline-none" placeholder="Search customer or brand" /></div></CardHeader><CardContent className="max-h-[68vh] space-y-2 overflow-y-auto p-3">{filteredBrands.map((brand) => { const latest = brand.profiles[0]; return <button key={brand.id} onClick={() => selectBrand(brand.id)} className={cn("w-full rounded-2xl border p-4 text-left", selectedBrand?.id === brand.id ? "border-accent bg-card" : "bg-card hover:bg-background")}><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Palette className="h-4 w-4 text-accent" /></div><div className="min-w-0 flex-1"><div className="font-semibold">{brand.name}</div><div className="mt-1 text-[11px] text-muted-foreground">{brand.customerName}</div><div className="mt-3 flex items-center justify-between"><span className="text-[10px] text-muted-foreground">{brand.profiles.length} version{brand.profiles.length === 1 ? "" : "s"}</span><span className={cn("rounded-full px-2 py-1 text-[10px]", latest?.status === "Approved" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-foreground-soft")}>{latest?.status || "Not started"}</span></div></div></div></button>; })}{!filteredBrands.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No brands found. Add the customer in Sales first, then create its Brand DNA here.</div>}</CardContent></Card>

        <div className={cn("min-w-0", !mobileDetail && "hidden xl:block")}>
          {selectedBrand && draft ? <div className="space-y-5">
            <Card className="bg-white/80"><CardHeader className="border-b p-4 sm:p-6"><div className="flex items-start gap-3 xl:hidden"><button onClick={() => setMobileDetail(false)} className="flex h-9 w-9 items-center justify-center rounded-xl border bg-card" aria-label="Back to the list"><ChevronLeft className="h-4 w-4" /></button><div className="min-w-0 flex-1"><CardTitle>{selectedBrand.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{selectedBrand.customerName}</p></div></div><div className="hidden items-start justify-between gap-4 xl:flex"><div><div className="text-[10px] font-semibold uppercase tracking-[.15em] text-accent">{selectedBrand.customerName}</div><CardTitle className="mt-2 text-2xl">{selectedBrand.name}</CardTitle><p className="mt-2 text-sm text-muted-foreground">{selectedBrand.description || "No brand description yet."}</p></div><div className="text-right"><div className="text-3xl font-semibold">{draft.completenessScore}%</div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Completeness</div></div></div><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)} className="h-10 rounded-xl border bg-card px-3 text-sm"><option value="">Unsaved new draft</option>{selectedBrand.profiles.map((profile, index) => <option key={profile.id} value={profile.id}>Version {selectedBrand.profiles.length - index} · {profile.status} · {formatDate(profile.updatedAt)}</option>)}</select><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={generateSuggestions} disabled={generating}><Bot className="h-3.5 w-3.5" />{generating ? "Analysing…" : "AI suggestions"}</Button><Button variant="outline" size="sm" onClick={() => saveProfile()} disabled={saving}><Save className="h-3.5 w-3.5" />Save draft</Button><Button size="sm" onClick={() => saveProfile("Approved")} disabled={saving || !draft.id}><ShieldCheck className="h-3.5 w-3.5" />Approve</Button>{draft.id && draft.status !== "Approved" && <Button variant="outline" size="icon" onClick={deleteProfile} aria-label="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button>}</div></div></CardHeader><CardContent className="p-4 sm:p-6"><div className="grid gap-4 md:grid-cols-2"><Field label="Positioning" wide><Textarea value={draft.positioning} onChange={(event) => setDraft({ ...draft, positioning: event.target.value })} placeholder="How the brand should be understood relative to alternatives" /></Field><Field label="Primary audience"><Textarea value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value })} /></Field><Field label="Brand personality"><Textarea value={draft.personality} onChange={(event) => setDraft({ ...draft, personality: event.target.value })} /></Field><Field label="Tone of voice" wide><Textarea value={draft.voice} onChange={(event) => setDraft({ ...draft, voice: event.target.value })} /></Field><Field label="Value proposition" wide><Textarea value={String(draft.messaging.valueProposition || "")} onChange={(event) => setDraft({ ...draft, messaging: { ...draft.messaging, valueProposition: event.target.value } })} /></Field><Field label="Core messages"><Textarea value={String(draft.messaging.coreMessages || "")} onChange={(event) => setDraft({ ...draft, messaging: { ...draft.messaging, coreMessages: event.target.value } })} placeholder="One message per line" /></Field><Field label="Preferred words"><Textarea value={String(draft.messaging.preferredWords || "")} onChange={(event) => setDraft({ ...draft, messaging: { ...draft.messaging, preferredWords: event.target.value } })} /></Field><Field label="Colour palette"><Input value={draft.colours.join(", ")} onChange={(event) => setDraft({ ...draft, colours: parseLines(event.target.value) })} placeholder="#202C25, #EF7F5F" /><div className="mt-3 flex flex-wrap gap-2">{draft.colours.map((colour) => <div key={colour} className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5 text-[10px]"><span className="h-5 w-5 rounded border" style={{ background: colour }} />{colour}</div>)}</div></Field><Field label="Heading typeface"><Input value={String(draft.typography.heading || "")} onChange={(event) => setDraft({ ...draft, typography: { ...draft.typography, heading: event.target.value } })} /></Field><Field label="Body typeface"><Input value={String(draft.typography.body || "")} onChange={(event) => setDraft({ ...draft, typography: { ...draft.typography, body: event.target.value } })} /></Field><Field label="Photography direction" wide><Textarea value={draft.photographyDirection} onChange={(event) => setDraft({ ...draft, photographyDirection: event.target.value })} className="min-h-28" /></Field><Field label="Approved factual claims" noGenerate><Textarea value={draft.approvedClaims.join("\n")} onChange={(event) => setDraft({ ...draft, approvedClaims: parseLines(event.target.value) })} placeholder="One verified claim per line" /></Field><Field label="Avoid / restricted language"><Textarea value={draft.avoidList.join("\n")} onChange={(event) => setDraft({ ...draft, avoidList: parseLines(event.target.value) })} placeholder="Words, claims or visual directions to avoid" /></Field></div></CardContent></Card>

            <Card className="bg-white/80"><CardHeader className="border-b p-4"><div className="flex items-center justify-between"><div><CardTitle>Evidence</CardTitle><p className="mt-1 text-xs text-muted-foreground">Linked customer and brand knowledge used during review.</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-[10px]">{linkedKnowledge.length} sources</span></div></CardHeader><CardContent className="grid gap-2 p-4 sm:grid-cols-2">{linkedKnowledge.map((entry) => <div key={entry.id} className="rounded-xl border bg-card p-3"><div className="text-sm font-medium">{entry.title}</div><div className="mt-1 text-[10px] text-muted-foreground">{entry.category}</div></div>)}{!linkedKnowledge.length && <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground sm:col-span-2">No linked knowledge yet. Add customer or brand knowledge first for stronger AI suggestions.</div>}</CardContent></Card>

            {draft.aiSuggestions.length > 0 && <Card className="border-accent/30 bg-card"><CardHeader className="border-b border-accent/15 p-4"><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-accent" /><CardTitle>AI suggestions awaiting review</CardTitle></div><p className="mt-1 text-xs text-muted-foreground">Nothing is applied automatically. Review evidence and apply or reject each suggestion.</p></CardHeader><CardContent className="space-y-3 p-4">{draft.aiSuggestions.map((suggestion, index) => <div key={`${suggestion.field}-${index}`} className="rounded-xl border bg-card p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><div className="text-sm font-semibold">{suggestion.label || suggestion.field}</div><div className="mt-2 whitespace-pre-wrap text-xs leading-6 text-foreground-soft">{Array.isArray(suggestion.value) ? suggestion.value.join("\n") : String(suggestion.value ?? "")}</div>{suggestion.reason && <div className="mt-2 text-[10px] leading-5 text-muted-foreground">Why: {suggestion.reason}</div>}</div><div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => rejectSuggestion(suggestion)}><X className="h-3.5 w-3.5" />Reject</Button><Button size="sm" onClick={() => applySuggestion(suggestion)}><Check className="h-3.5 w-3.5" />Apply</Button></div></div></div>)}</CardContent></Card>}
          </div> : <Card className="bg-white/80"><CardContent className="p-12 text-center"><Palette className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-4 font-semibold">No brand selected</div><p className="mt-2 text-sm text-muted-foreground">Select a customer brand to create its Brand DNA.</p></CardContent></Card>}
        </div>
      </div>
    </WorkspacePage>
  );
}

/**
 * `noGenerate` on a field where writing from nothing is the wrong offer: an
 * approved claim is approved because a human verified it, so the only honest
 * source for that box is a person.
 */
function Field({ label, wide, noGenerate, children }: { label: string; wide?: boolean; noGenerate?: boolean; children: React.ReactNode }) {
  const control = isValidElement<{ value?: unknown; onChange?: (event: any) => void }>(children) ? children : null;
  const value = typeof control?.props.value === "string" ? control.props.value : "";
  const canImprove = control !== null && isTextField(control.type) && typeof control.props.onChange === "function";
  return <div className={cn("block text-xs font-medium text-foreground-soft", wide && "md:col-span-2")}><div className="flex min-h-8 items-center justify-between gap-2"><span>{label}</span>{canImprove && <AIWritingButton value={value} field={label} context="KretivOS Brand DNA. Preserve evidence, factual claims and the intended brand voice." allowGenerate={!noGenerate} onApply={(next) => control.props.onChange?.({ target: { value: next }, currentTarget: { value: next } })} />}</div><div className="mt-2">{children}</div></div>;
}

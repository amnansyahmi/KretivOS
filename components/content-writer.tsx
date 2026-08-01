"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarPlus, Check, Clipboard, Loader2, MessageSquareText,
  Send, Sparkles, WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/date-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Customer = { id: string; name: string };
type Brand = { id: string; customerId: string; customerName?: string; name: string; profiles?: { status: string }[] };
type WriterForm = {
  customerId: string;
  brandId: string;
  platform: string;
  objective: string;
  format: string;
  language: string;
  tone: string;
  topic: string;
  audience: string;
  keyFacts: string;
  cta: string;
  useCurrentResearch: boolean;
};
type ContentVariant = {
  label: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  notes: string;
};
type WriterResult = { source: "ai-nonymauz-cloud" | "starter"; summary: string; variants: ContentVariant[] };

const FORM_KEY = "kretivos-content-writer-form";
const defaultForm: WriterForm = {
  customerId: "",
  brandId: "",
  platform: "Threads",
  objective: "Engagement",
  format: "Single post",
  language: "Natural BM",
  tone: "Natural conversation",
  topic: "",
  audience: "",
  keyFacts: "",
  cta: "",
  useCurrentResearch: false,
};

const platforms = ["Threads", "Instagram", "Facebook", "TikTok", "LinkedIn", "X", "WhatsApp", "Email", "Blog"];
const objectives = ["Engagement", "Awareness", "Community", "Education", "Leads", "Conversion", "Launch", "Retention"];
const formats = ["Single post", "Thread", "Caption", "Carousel copy", "Short video script", "Ad copy", "Long-form article"];
const languages = ["Natural BM", "English", "BM + English"];
const tones = ["Natural conversation", "Community-driven", "Friendly expert", "Premium editorial", "Direct sales", "Witty"];

function localToday() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function combinedCopy(variant: ContentVariant) {
  return [variant.hook, variant.body, variant.cta, variant.hashtags.join(" ")].filter((value) => value.trim()).join("\n\n");
}

export function ContentWriter({ onOpenPlanner }: { onOpenPlanner: () => void }) {
  const [form, setForm] = useState<WriterForm>(defaultForm);
  const [hydrated, setHydrated] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState("");
  const [result, setResult] = useState<WriterResult | null>(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [scheduleDate, setScheduleDate] = useState(localToday());
  const [scheduleState, setScheduleState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [scheduleMessage, setScheduleMessage] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FORM_KEY);
      if (stored) setForm({ ...defaultForm, ...JSON.parse(stored) });
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(FORM_KEY, JSON.stringify(form));
  }, [form, hydrated]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/business", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load clients.");
        return payload;
      }),
      fetch("/api/brand-dna", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load brands.");
        return payload;
      }),
    ]).then(([business, brandData]) => {
      if (cancelled) return;
      setCustomers(business.customers || []);
      setBrands(brandData.brands || business.brands || []);
    }).catch((cause) => {
      if (!cancelled) setContextError(cause instanceof Error ? cause.message : "Client context is unavailable.");
    }).finally(() => { if (!cancelled) setContextLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const availableBrands = useMemo(
    () => brands.filter((brand) => !form.customerId || brand.customerId === form.customerId),
    [brands, form.customerId],
  );
  const selectedCustomer = customers.find((customer) => customer.id === form.customerId);
  const selectedBrand = brands.find((brand) => brand.id === form.brandId);
  const activeVariant = result?.variants[active] || null;

  function set<K extends keyof WriterForm>(key: K, value: WriterForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function requestWriter(action: "generate" | "refine", refineInstruction = "") {
    if (loading || (action === "generate" && !form.topic.trim())) return;
    setLoading(true);
    setError("");
    setScheduleState("idle");
    try {
      const response = await fetch("/api/marketing/content-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          action,
          instruction: refineInstruction,
          draft: action === "refine" ? activeVariant : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to generate content.");
      if (action === "refine" && activeVariant) {
        const refined = payload.variants?.[0];
        if (!refined) throw new Error("AI returned no revised draft.");
        setResult((current) => current ? {
          ...current,
          source: payload.source,
          summary: payload.summary,
          variants: current.variants.map((item, index) => index === active ? refined : item),
        } : current);
      } else {
        setResult(payload);
        setActive(0);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Content Writer is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  function updateVariant(patch: Partial<ContentVariant>) {
    setResult((current) => current ? {
      ...current,
      variants: current.variants.map((item, index) => index === active ? { ...item, ...patch } : item),
    } : current);
  }

  async function copyDraft() {
    if (!activeVariant) return;
    await navigator.clipboard.writeText(combinedCopy(activeVariant));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function addToPlanner() {
    if (!activeVariant || !scheduleDate || scheduleState === "saving") return;
    setScheduleState("saving");
    setScheduleMessage("");
    try {
      const response = await fetch("/api/planner", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: scheduleDate,
          title: form.topic.trim().slice(0, 600) || activeVariant.hook.slice(0, 600),
          channel: form.platform,
          status: "Review",
          notes: combinedCopy(activeVariant).slice(0, 2000),
          customerId: form.customerId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to add this draft to the planner.");
      setScheduleState("saved");
      setScheduleMessage(`Added to ${new Date(`${scheduleDate}T00:00:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}.`);
    } catch (cause) {
      setScheduleState("error");
      setScheduleMessage(cause instanceof Error ? cause.message : "Unable to update the planner.");
    }
  }

  function submitInstruction() {
    const value = instruction.trim();
    if (!value) return;
    setInstruction("");
    void requestWriter("refine", value);
  }

  return <div>
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><div className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-[#ba5c42]">AI content production</div><h1 className="text-3xl font-semibold tracking-tight md:text-[38px]">Content Writer</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Choose the brand, platform and intended response. ai-nonymauz-cloud produces three editable directions grounded in Brand DNA and client knowledge.</p></div>
      <Button onClick={() => void requestWriter("generate")} disabled={loading || !form.topic.trim()}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{loading ? "Writing…" : result ? "Generate new versions" : "Write with AI"}</Button>
    </div>

    <div className="grid gap-5 xl:grid-cols-[.78fr_1.22fr]">
      <Card className="bg-white/80"><CardHeader className="border-b"><CardTitle className="text-lg">Content brief</CardTitle></CardHeader><CardContent className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client">
            <Select value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value, brandId: "" }))} disabled={contextLoading}>
              <option value="">Kretivco / General</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </Select>
          </Field>
          <Field label="Brand">
            <Select value={form.brandId} onChange={(event) => set("brandId", event.target.value)} disabled={!form.customerId || contextLoading}>
              <option value="">{form.customerId ? "Client-wide" : "Select client first"}</option>{availableBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </Select>
          </Field>
        </div>
        {(selectedCustomer || selectedBrand) && <div className="rounded-xl border bg-[#f7f4ed] px-4 py-3 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Context:</span> {selectedCustomer?.name}{selectedBrand ? ` · ${selectedBrand.name}` : " · all client records"}{selectedBrand?.profiles?.some((profile) => profile.status === "Approved") ? " · Approved Brand DNA" : selectedBrand ? " · latest Brand DNA draft" : ""}</div>}
        {contextError && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">{contextError} You can still write using general context.</div>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Platform"><Select value={form.platform} onChange={(event) => set("platform", event.target.value)}>{platforms.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          <Field label="Goal"><Select value={form.objective} onChange={(event) => set("objective", event.target.value)}>{objectives.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          <Field label="Format"><Select value={form.format} onChange={(event) => set("format", event.target.value)}>{formats.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          <Field label="Language"><Select value={form.language} onChange={(event) => set("language", event.target.value)}>{languages.map((item) => <option key={item}>{item}</option>)}</Select></Field>
        </div>
        <Field label="Tone"><Select value={form.tone} onChange={(event) => set("tone", event.target.value)}>{tones.map((item) => <option key={item}>{item}</option>)}</Select></Field>
        <Field label="Topic / what should this be about?" required><Textarea value={form.topic} onChange={(event) => set("topic", event.target.value)} className="min-h-28" placeholder="Example: Ask companies around Shah Alam and Subang if they are looking for interns" /></Field>
        <Field label="Audience"><Input value={form.audience} onChange={(event) => set("audience", event.target.value)} placeholder="Companies and students around Shah Alam / Subang" /></Field>
        <Field label="Facts that must stay accurate"><Textarea value={form.keyFacts} onChange={(event) => set("keyFacts", event.target.value)} placeholder="Names, price, location, offer, dates or approved product facts. AI will not invent missing details." /></Field>
        <Field label="Preferred CTA"><Input value={form.cta} onChange={(event) => set("cta", event.target.value)} placeholder="Optional — e.g. Drop the company, role and location below" /></Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3"><input type="checkbox" checked={form.useCurrentResearch} onChange={(event) => set("useCurrentResearch", event.target.checked)} className="mt-1" /><span><span className="block text-sm font-medium">Use current web context</span><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">Slower deep mode. Useful for current topics; external facts are used for framing, not added as unverified brand claims.</span></span></label>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
        <Button className="w-full" onClick={() => void requestWriter("generate")} disabled={loading || !form.topic.trim()}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}{loading ? "ai-nonymauz-cloud is writing…" : "Generate 3 directions"}</Button>
      </CardContent></Card>

      <Card className="overflow-hidden bg-white/85"><CardHeader className="border-b bg-[#26342b] text-white"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#ef9a75]">Writing desk</div><CardTitle className="mt-2">{result ? result.summary : "Your content will appear here"}</CardTitle></div>{result && <span className={cn("w-fit rounded-full px-2.5 py-1 text-[10px]", result.source === "ai-nonymauz-cloud" ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-100")}>{result.source}</span>}</div></CardHeader><CardContent className="p-4 sm:p-5">
        {!result && !loading && <div className="flex min-h-[560px] flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center"><MessageSquareText className="h-8 w-8 text-[#ba5c42]" /><div className="mt-4 text-lg font-semibold">Start with a simple topic</div><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Content Writer will use the selected client, Brand DNA, platform behaviour and goal to produce editable copy—not a generic template.</p></div>}
        {loading && !result && <div className="flex min-h-[560px] flex-col items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#ba5c42]" /><div className="mt-4 text-sm font-medium">Building three different directions…</div><p className="mt-2 text-xs text-muted-foreground">Grounding the draft in your selected context.</p></div>}
        {result && activeVariant && <div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">{result.variants.map((variant, index) => <button key={`${variant.label}-${index}`} onClick={() => setActive(index)} className={cn("shrink-0 rounded-lg border px-3 py-2 text-xs font-medium", active === index ? "border-[#26342b] bg-[#26342b] text-white" : "bg-white text-muted-foreground hover:bg-[#f7f4ed]")}>{index + 1}. {variant.label}</button>)}</div>
          <div className={cn("space-y-4 transition-opacity", loading && "pointer-events-none opacity-55")}>
            <Field label="Hook"><Textarea value={activeVariant.hook} onChange={(event) => updateVariant({ hook: event.target.value })} className="min-h-24 text-base font-medium" /></Field>
            <Field label="Writing"><Textarea value={activeVariant.body} onChange={(event) => updateVariant({ body: event.target.value })} className="min-h-[260px] text-base leading-8" /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Call to action"><Textarea value={activeVariant.cta} onChange={(event) => updateVariant({ cta: event.target.value })} /></Field><Field label="Hashtags"><Textarea value={activeVariant.hashtags.join(" ")} onChange={(event) => updateVariant({ hashtags: event.target.value.split(/\s+/).filter(Boolean) })} placeholder="Left empty when the platform does not need them" /></Field></div>
            {activeVariant.notes && <div className="rounded-xl border bg-[#f7f4ed] p-4 text-xs leading-6 text-muted-foreground"><span className="font-semibold text-foreground">Why this angle:</span> {activeVariant.notes}</div>}

            <div><div className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Quick edits</div><div className="flex flex-wrap gap-2">{[
              ["More natural", "Make it sound more natural and human. Remove any phrases that feel AI-written."],
              ["Stronger hook", "Rewrite the hook so it is more specific and immediately reply-worthy without becoming clickbait."],
              ["Shorter", "Make the entire draft shorter while preserving every fact and the core idea."],
              ["Less salesy", "Make this feel community-driven and less promotional while preserving the intended objective."],
            ].map(([label, prompt]) => <Button key={label} variant="outline" size="sm" className="bg-white" onClick={() => void requestWriter("refine", prompt)} disabled={loading}>{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}{label}</Button>)}</div></div>

            <div className="flex items-end gap-2 rounded-2xl border bg-[#faf8f3] p-2"><Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitInstruction(); } }} className="min-h-16 flex-1 resize-none border-0 bg-transparent focus-visible:ring-0" placeholder="Ask AI to revise this version…" /><Button size="icon" onClick={submitInstruction} disabled={!instruction.trim() || loading} aria-label="Send revision instruction"><Send className="h-4 w-4" /></Button></div>

            <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><div className="mb-2 text-xs font-medium">Send to planner</div><DateInput value={scheduleDate} onChange={(event) => { setScheduleDate(event.target.value); setScheduleState("idle"); }} /></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={copyDraft}>{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Clipboard className="h-4 w-4" />}{copied ? "Copied" : "Copy"}</Button><Button onClick={addToPlanner} disabled={!scheduleDate || scheduleState === "saving"}>{scheduleState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : scheduleState === "saved" ? <Check className="h-4 w-4" /> : <CalendarPlus className="h-4 w-4" />}{scheduleState === "saved" ? "Added" : "Add to planner"}</Button></div></div>
            {scheduleMessage && <div className={cn("flex items-center justify-between rounded-xl px-4 py-3 text-xs", scheduleState === "error" ? "border border-red-200 bg-red-50 text-red-700" : "border border-emerald-200 bg-emerald-50 text-emerald-800")}><span>{scheduleMessage}</span>{scheduleState === "saved" && <button className="font-semibold underline underline-offset-2" onClick={onOpenPlanner}>Open planner</button>}</div>}
          </div>
        </div>}
      </CardContent></Card>
    </div>
  </div>;
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-[#4e5a52]"><span>{label}{required && <span className="ml-1 text-[#ba5c42]">*</span>}</span><div className="mt-2">{children}</div></label>;
}

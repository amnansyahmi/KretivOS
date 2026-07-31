"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, CalendarDays, Check, ChevronRight, Filter, MoreHorizontal, Plus, Search, Sparkles, Target, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspacePage } from "@/components/workspace-page";
import { cn } from "@/lib/utils";

type StageKey = "TOFU" | "MOFU" | "BOFU" | "RETENTION";
type FunnelItem = { id: string; title: string; channel: string; format: string; cta: string };
type FunnelStage = { key: StageKey; title: string; objective: string; kpi: string; items: FunnelItem[] };
type Funnel = {
  id: string;
  client: string;
  name: string;
  objective: string;
  audience: string;
  offer: string;
  channels: string;
  summary: string;
  status: "Draft" | "Active" | "Review" | "Completed";
  source: "example" | "manual" | "ai-nonymauz-cloud" | "starter";
  createdAt: string;
  updatedAt: string;
  stages: FunnelStage[];
};

type FunnelForm = {
  client: string;
  name: string;
  objective: string;
  audience: string;
  offer: string;
  channels: string;
  useAI: boolean;
};

const stageMeta: Record<StageKey, { label: string; metric: string }> = {
  TOFU: { label: "Awareness", metric: "Reach" },
  MOFU: { label: "Consideration", metric: "Engagement" },
  BOFU: { label: "Conversion", metric: "Sales" },
  RETENTION: { label: "Retention", metric: "Repeat" },
};

const exampleStages: FunnelStage[] = [
  {
    key: "TOFU",
    title: "Awareness",
    objective: "Introduce Pizza Mania to people around Subang and USJ who have not seen the offer.",
    kpi: "Unique reach, video views and profile visits",
    items: [
      { id: "ca-t1", title: "Geo-targeted Pizza Mania launch video", channel: "Meta Ads", format: "15-second vertical video", cta: "Discover Pizza Mania" },
      { id: "ca-t2", title: "Subang pizza conversation thread", channel: "Threads", format: "Conversation post", cta: "Tell us your favourite" },
      { id: "ca-t3", title: "Wagyu pizza macro reel", channel: "Instagram / TikTok", format: "Food reel", cta: "Follow the launch" },
    ],
  },
  {
    key: "MOFU",
    title: "Consideration",
    objective: "Build confidence among people who engaged but have not visited the restaurant.",
    kpi: "Saves, comments, map views and menu visits",
    items: [
      { id: "ca-m1", title: "Behind-the-scenes pizza preparation", channel: "TikTok / Reels", format: "Kitchen BTS", cta: "See how it is made" },
      { id: "ca-m2", title: "Pizza menu and USJ 4 location explainer", channel: "Instagram", format: "Carousel", cta: "Save the location" },
      { id: "ca-m3", title: "First-customer reactions", channel: "Meta / TikTok", format: "Testimonial video", cta: "Plan your visit" },
    ],
  },
  {
    key: "BOFU",
    title: "Conversion",
    objective: "Drive restaurant visits before the launch offer ends.",
    kpi: "Offer redemptions, directions and WhatsApp actions",
    items: [
      { id: "ca-b1", title: "First 100 customers Wagyu offer", channel: "Meta Ads", format: "Conversion creative", cta: "Visit today" },
      { id: "ca-b2", title: "Retarget engaged Pizza Mania viewers", channel: "Meta Ads", format: "Retargeting video", cta: "Get directions" },
      { id: "ca-b3", title: "Restaurant map, hours and parking CTA", channel: "Stories / WhatsApp", format: "Action card", cta: "Open map" },
    ],
  },
  {
    key: "RETENTION",
    title: "Retention & Referral",
    objective: "Turn launch visitors into reviewers, repeat diners and a reusable audience.",
    kpi: "Reviews, repeat visits and customer list growth",
    items: [
      { id: "ca-r1", title: "Post-visit Google review request", channel: "Counter / WhatsApp", format: "QR and message", cta: "Leave a review" },
      { id: "ca-r2", title: "Pizza customer audience segment", channel: "Meta / CRM", format: "Audience workflow", cta: "Add to retention list" },
      { id: "ca-r3", title: "Next-month dining offer", channel: "WhatsApp / Social", format: "Return offer", cta: "Come back this month" },
    ],
  },
];

const starterFunnels: Funnel[] = [
  {
    id: "chef-ammar-pizza-mania",
    client: "Chef Ammar",
    name: "Pizza Mania · August 2026",
    objective: "Bring new customers into Chef Ammar USJ 4 and increase table spend.",
    audience: "Residents and food audiences around Subang Jaya and USJ.",
    offer: "Pizza Mania launch and first-customer Wagyu offer.",
    channels: "Meta Ads, Instagram, TikTok, Threads, WhatsApp",
    summary: "A three-phase restaurant acquisition funnel supported by a retention and review layer.",
    status: "Active",
    source: "example",
    createdAt: "2026-07-24T09:00:00.000Z",
    updatedAt: "2026-07-31T09:00:00.000Z",
    stages: exampleStages,
  },
  {
    id: "chef-ammar-paste-launch",
    client: "Chef Ammar",
    name: "Cooking Paste Marketplace Launch",
    objective: "Generate product discovery and first purchases across the sales page, Shopee and TikTok Shop.",
    audience: "Malaysian households that want convenient Middle Eastern meals.",
    offer: "Kabsah, Mandy and Beriani paste bundles.",
    channels: "TikTok, Threads, Meta, Sales Page, Shopee",
    summary: "Product education, cooking proof, bundle conversion and repeat-meal retention.",
    status: "Draft",
    source: "example",
    createdAt: "2026-07-28T09:00:00.000Z",
    updatedAt: "2026-07-30T09:00:00.000Z",
    stages: exampleStages.map((stage) => ({ ...stage, items: stage.items.slice(0, 2).map((item) => ({ ...item, id: `paste-${item.id}` })) })),
  },
  {
    id: "smart-selangor-awareness",
    client: "Smart Selangor",
    name: "Website Revamp Stakeholder Funnel",
    objective: "Build stakeholder confidence and communicate the value of the website transformation.",
    audience: "State stakeholders, partners, residents and programme users.",
    offer: "A modern, accessible and information-rich Smart Selangor digital experience.",
    channels: "Website, LinkedIn, Facebook, Email",
    summary: "A public-sector communication funnel from awareness to service adoption.",
    status: "Review",
    source: "example",
    createdAt: "2026-07-20T09:00:00.000Z",
    updatedAt: "2026-07-29T09:00:00.000Z",
    stages: exampleStages.map((stage) => ({ ...stage, items: stage.items.slice(0, 2).map((item) => ({ ...item, id: `ss-${item.id}` })) })),
  },
  {
    id: "restu-vendor-acquisition",
    client: "Restu.ai",
    name: "Wedding Vendor Acquisition",
    objective: "Recruit verified Malaysian and Singaporean wedding vendors to the platform.",
    audience: "Wedding planners, photographers, venues, caterers and bridal vendors.",
    offer: "Early vendor visibility and qualified couple enquiries.",
    channels: "Instagram, Email, WhatsApp, Landing Page",
    summary: "B2B acquisition funnel for vendor education, verification and onboarding.",
    status: "Draft",
    source: "example",
    createdAt: "2026-07-18T09:00:00.000Z",
    updatedAt: "2026-07-27T09:00:00.000Z",
    stages: exampleStages.map((stage) => ({ ...stage, items: stage.items.slice(0, 2).map((item) => ({ ...item, id: `restu-${item.id}` })) })),
  },
];

const emptyForm: FunnelForm = {
  client: "Chef Ammar",
  name: "",
  objective: "",
  audience: "",
  offer: "",
  channels: "Instagram, TikTok, Threads, Website, WhatsApp",
  useAI: true,
};

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function normaliseStages(stages: any[]): FunnelStage[] {
  const keys: StageKey[] = ["TOFU", "MOFU", "BOFU", "RETENTION"];
  return keys.map((key, index) => {
    const source = stages?.[index] || {};
    return {
      key,
      title: String(source.title || stageMeta[key].label),
      objective: String(source.objective || "Define the objective for this stage."),
      kpi: String(source.kpi || stageMeta[key].metric),
      items: Array.isArray(source.items)
        ? source.items.map((item: any) => ({
            id: id(),
            title: String(item.title || "New funnel activity"),
            channel: String(item.channel || "To be selected"),
            format: String(item.format || "Content"),
            cta: String(item.cta || "Take action"),
          }))
        : [],
    };
  });
}

function statusTone(status: Funnel["status"]) {
  if (status === "Active") return "bg-emerald-50 text-emerald-700";
  if (status === "Review") return "bg-amber-50 text-amber-700";
  if (status === "Completed") return "bg-blue-50 text-blue-700";
  return "bg-[#eeeae0] text-[#5a605a]";
}

export default function FunnelLibraryPage() {
  const [funnels, setFunnels] = useState<Funnel[]>(starterFunnels);
  const [selectedId, setSelectedId] = useState(starterFunnels[0].id);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("All clients");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FunnelForm>(emptyForm);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [addingStage, setAddingStage] = useState<StageKey | null>(null);
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("kretivos-funnels");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Funnel[];
        if (Array.isArray(parsed) && parsed.length) {
          setFunnels(parsed);
          setSelectedId(parsed[0].id);
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("kretivos-funnels", JSON.stringify(funnels));
  }, [funnels]);

  const clients = useMemo(() => ["All clients", ...Array.from(new Set(funnels.map((funnel) => funnel.client)))], [funnels]);
  const filtered = useMemo(() => funnels.filter((funnel) => {
    const matchesClient = clientFilter === "All clients" || funnel.client === clientFilter;
    const term = search.toLowerCase();
    const matchesSearch = !term || [funnel.client, funnel.name, funnel.objective, funnel.offer].some((value) => value.toLowerCase().includes(term));
    return matchesClient && matchesSearch;
  }), [funnels, clientFilter, search]);
  const selected = funnels.find((funnel) => funnel.id === selectedId) || filtered[0] || funnels[0];

  async function createFunnel() {
    if (!form.client.trim() || !form.name.trim() || !form.objective.trim()) {
      setError("Client, funnel name and objective are required.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      let generated: { source: Funnel["source"]; summary: string; stages: any[] };
      if (form.useAI) {
        const response = await fetch("/api/funnels/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to generate funnel");
        generated = data;
      } else {
        generated = {
          source: "manual",
          summary: `Editable starter funnel for ${form.client}.`,
          stages: ["TOFU", "MOFU", "BOFU", "RETENTION"].map((key) => ({ key, title: stageMeta[key as StageKey].label, objective: "", kpi: stageMeta[key as StageKey].metric, items: [] })),
        };
      }

      const now = new Date().toISOString();
      const funnel: Funnel = {
        id: id(),
        client: form.client.trim(),
        name: form.name.trim(),
        objective: form.objective.trim(),
        audience: form.audience.trim(),
        offer: form.offer.trim(),
        channels: form.channels.trim(),
        summary: generated.summary,
        status: "Draft",
        source: generated.source,
        createdAt: now,
        updatedAt: now,
        stages: normaliseStages(generated.stages),
      };
      setFunnels((current) => [funnel, ...current]);
      setSelectedId(funnel.id);
      setShowCreate(false);
      setForm(emptyForm);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create funnel.");
    } finally {
      setGenerating(false);
    }
  }

  function addContent(stageKey: StageKey) {
    if (!selected || !newItem.trim()) return;
    setFunnels((current) => current.map((funnel) => funnel.id !== selected.id ? funnel : {
      ...funnel,
      updatedAt: new Date().toISOString(),
      stages: funnel.stages.map((stage) => stage.key !== stageKey ? stage : {
        ...stage,
        items: [...stage.items, { id: id(), title: newItem.trim(), channel: "To be selected", format: "Content", cta: "Take action" }],
      }),
    }));
    setNewItem("");
    setAddingStage(null);
  }

  function removeItem(stageKey: StageKey, itemId: string) {
    if (!selected) return;
    setFunnels((current) => current.map((funnel) => funnel.id !== selected.id ? funnel : {
      ...funnel,
      updatedAt: new Date().toISOString(),
      stages: funnel.stages.map((stage) => stage.key !== stageKey ? stage : { ...stage, items: stage.items.filter((item) => item.id !== itemId) }),
    }));
  }

  return (
    <WorkspacePage
      eyebrow="AI Marketing Studio"
      title="Funnel Library"
      description="View every client funnel, open a complete example, and create new TOFU–MOFU–BOFU–Retention plans manually or through ai-nonymauz-cloud."
      actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Add funnel</Button>}
    >
      <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
        <Card className="h-fit bg-white/80 xl:sticky xl:top-5">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Built funnels</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{funnels.length} across {clients.length - 1} clients</p>
              </div>
              <Target className="h-5 w-5 text-[#ba5c42]" />
            </div>
            <div className="mt-4 flex gap-2">
              <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border bg-white px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 text-sm outline-none" placeholder="Search funnels" />
              </div>
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} className="h-10 max-w-[155px] rounded-lg border bg-white pl-9 pr-3 text-xs outline-none">
                  {clients.map((client) => <option key={client}>{client}</option>)}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="max-h-[calc(100vh-260px)] space-y-2 overflow-y-auto p-3">
            {filtered.map((funnel) => (
              <button key={funnel.id} onClick={() => setSelectedId(funnel.id)} className={cn("w-full rounded-xl border p-4 text-left transition", selected?.id === funnel.id ? "border-[#ba5c42] bg-[#fff8f4]" : "bg-white hover:bg-[#f8f5ee]") }>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#ba5c42]">{funnel.client}</div>
                    <div className="mt-1 text-sm font-semibold leading-snug">{funnel.name}</div>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", statusTone(funnel.status))}>{funnel.status}</span>
                  <span className="text-[10px] text-muted-foreground">{funnel.stages.reduce((total, stage) => total + stage.items.length, 0)} activities</span>
                </div>
                <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground"><CalendarDays className="h-3 w-3" />Updated {new Date(funnel.updatedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}</div>
              </button>
            ))}
            {!filtered.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No funnels match this filter.</div>}
          </CardContent>
        </Card>

        {selected && (
          <div className="min-w-0">
            <Card className="mb-5 overflow-hidden bg-[#26342b] text-white">
              <CardContent className="p-6 md:p-7">
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[.18em] text-white/45">
                      <span>{selected.client}</span><span>•</span><span>{selected.source === "ai-nonymauz-cloud" ? "AI generated" : selected.source === "example" ? "Example funnel" : "Editable funnel"}</span>
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold md:text-3xl">{selected.name}</h2>
                    <p className="mt-3 text-sm leading-6 text-white/65">{selected.summary}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className={cn("h-fit rounded-full px-3 py-1.5 text-[10px] font-medium", statusTone(selected.status))}>{selected.status}</span>
                    <Button variant="outline" size="icon" className="border-white/15 bg-white/5 text-white hover:bg-white/10"><MoreHorizontal className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[["Objective", selected.objective], ["Audience", selected.audience || "Not set"], ["Offer", selected.offer || "Not set"], ["Channels", selected.channels || "Not set"]].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-[9px] uppercase tracking-wider text-white/40">{label}</div>
                      <div className="mt-2 text-xs leading-5 text-white/75">{value}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 2xl:grid-cols-4">
              {selected.stages.map((stage, stageIndex) => (
                <Card key={stage.key} className="min-w-0 bg-white/75">
                  <CardHeader className="border-b pb-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#202c25] text-xs font-semibold text-white">{stageIndex + 1}</span>
                      <div className="min-w-0">
                        <div className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#ba5c42]">{stage.key}</div>
                        <CardTitle className="mt-1 text-base">{stage.title}</CardTitle>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">{stage.objective}</p>
                    <div className="mt-3 inline-flex w-fit rounded-full bg-[#eeeae0] px-2.5 py-1 text-[10px] font-medium text-[#5a605a]">KPI: {stage.kpi}</div>
                  </CardHeader>
                  <CardContent className="space-y-3 p-3">
                    {stage.items.map((item) => (
                      <div key={item.id} className="group rounded-xl border bg-white p-3.5">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1 text-sm font-medium leading-5">{item.title}</div>
                          <button onClick={() => removeItem(stage.key, item.id)} className="opacity-0 transition group-hover:opacity-100" aria-label="Remove activity"><Trash2 className="h-3.5 w-3.5 text-red-500" /></button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                          <div className="rounded-lg bg-[#f7f4ed] p-2"><span className="block text-[8px] uppercase tracking-wider">Channel</span><span className="mt-1 block text-[#3f4841]">{item.channel}</span></div>
                          <div className="rounded-lg bg-[#f7f4ed] p-2"><span className="block text-[8px] uppercase tracking-wider">Format</span><span className="mt-1 block text-[#3f4841]">{item.format}</span></div>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[10px]"><Check className="h-3 w-3 text-emerald-600" /><span>CTA: {item.cta}</span></div>
                      </div>
                    ))}

                    {addingStage === stage.key ? (
                      <div className="rounded-xl border border-dashed bg-white p-3">
                        <input autoFocus value={newItem} onChange={(event) => setNewItem(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addContent(stage.key); }} className="h-9 w-full rounded-lg border px-3 text-sm outline-none" placeholder="New activity title" />
                        <div className="mt-2 flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => { setAddingStage(null); setNewItem(""); }}>Cancel</Button>
                          <Button size="sm" onClick={() => addContent(stage.key)}>Add</Button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAddingStage(stage.key)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-xs text-muted-foreground hover:border-[#ba5c42] hover:text-[#ba5c42]"><Plus className="h-3.5 w-3.5" />Add content</button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
          <Card className="max-h-[94vh] w-full max-w-3xl overflow-y-auto bg-[#f7f4ed] shadow-2xl">
            <CardHeader className="sticky top-0 z-10 flex-row items-start justify-between border-b bg-[#f7f4ed]">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#ba5c42]"><Bot className="h-3.5 w-3.5" />ai-nonymauz-cloud ready</div>
                <CardTitle className="mt-2 text-2xl">Create a new funnel</CardTitle>
                <p className="mt-2 text-xs text-muted-foreground">KretivOS will build all four funnel stages and save them to the client library.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowCreate(false)}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Client"><select value={form.client} onChange={(event) => setForm({ ...form, client: event.target.value })} className="input"><option>Chef Ammar</option><option>Smart Selangor</option><option>Restu.ai</option><option>Kretivco</option><option>New client</option></select></Field>
                <Field label="Funnel name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input" placeholder="e.g. Product launch August 2026" /></Field>
                <Field label="Objective" wide><textarea value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} className="textarea" placeholder="What business result should this funnel produce?" /></Field>
                <Field label="Target audience"><textarea value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} className="textarea" placeholder="Who should move through the funnel?" /></Field>
                <Field label="Offer / proposition"><textarea value={form.offer} onChange={(event) => setForm({ ...form, offer: event.target.value })} className="textarea" placeholder="What are we asking them to consider or buy?" /></Field>
                <Field label="Channels" wide><input value={form.channels} onChange={(event) => setForm({ ...form, channels: event.target.value })} className="input" placeholder="Meta, TikTok, Threads, Website, WhatsApp" /></Field>
              </div>
              <label className="mt-5 flex items-start gap-3 rounded-xl border bg-white p-4">
                <input type="checkbox" checked={form.useAI} onChange={(event) => setForm({ ...form, useAI: event.target.checked })} className="mt-1 accent-[#ba5c42]" />
                <div><div className="text-sm font-semibold">Generate using ai-nonymauz-cloud</div><div className="mt-1 text-xs leading-5 text-muted-foreground">Creates specific activities, channels, formats, CTAs, stage objectives and KPIs. Turn off for an empty manual structure.</div></div>
              </label>
              {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={createFunnel} disabled={generating}>{generating ? <><Sparkles className="h-4 w-4 animate-pulse" />Building funnel…</> : <><Sparkles className="h-4 w-4" />Create funnel</>}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <style jsx>{`
        .input { height: 2.75rem; width: 100%; border-radius: .65rem; border: 1px solid hsl(var(--border)); background: white; padding: 0 .8rem; font-size: .875rem; outline: none; }
        .textarea { min-height: 6.5rem; width: 100%; resize: vertical; border-radius: .65rem; border: 1px solid hsl(var(--border)); background: white; padding: .75rem .8rem; font-size: .875rem; outline: none; }
        .input:focus, .textarea:focus { box-shadow: 0 0 0 3px rgba(186,92,66,.12); border-color: rgba(186,92,66,.55); }
      `}</style>
    </WorkspacePage>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={cn("block text-xs font-medium", wide && "md:col-span-2")}>{label}<div className="mt-2">{children}</div></label>;
}

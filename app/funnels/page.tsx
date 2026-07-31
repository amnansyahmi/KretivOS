"use client";

import { isValidElement, useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Bot, ChevronLeft, FlaskConical, Layers3, List,
  Loader2, Pencil, Plus, RefreshCw, Save, Search, Sparkles, Target, Trash2, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AIWritingButton } from "@/components/ai-writing-button";
import { WorkspacePage } from "@/components/workspace-page";
import { FUNNEL_PLAYBOOKS, FunnelPlaybook, PlaybookStageKey } from "@/lib/funnel-playbooks";
import { cn } from "@/lib/utils";

type Customer = { id: string; name: string; industry?: string };
type Brand = { id: string; customerId: string; name: string };
type Channel = { id: string; name: string; category: string; status: string };
type ContentTemplate = { id: string; name: string; stageKey: string; format: string; channelCategory: string; description: string; content: string; status: string };
type FunnelActivity = {
  id: string;
  title: string;
  format: string;
  cta: string;
  contentTemplateId: string;
  marketingChannelIds: string[];
  channelNames?: string[];
  content: Record<string, unknown>;
  status: string;
  sortOrder: number;
};
type FunnelStage = { id?: string; key: PlaybookStageKey; title: string; objective: string; kpi: string; sortOrder: number; items: FunnelActivity[] };
type Funnel = {
  id: string;
  customerId: string;
  client: string;
  brandId: string;
  brandName: string;
  playbookKey: string;
  name: string;
  objective: string;
  audience: string;
  offer: string;
  summary: string;
  status: "Draft" | "Review" | "Active" | "Completed";
  source: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  stages: FunnelStage[];
  sandbox?: boolean;
};
type CreateForm = { customerId: string; brandId: string; playbookKey: string; name: string; objective: string; audience: string; offer: string; useAI: boolean };
type ActivityEditor = { stageKey: PlaybookStageKey; item: FunnelActivity; isNew: boolean } | null;
type ChannelVersion = { channelId: string; channelName: string; copy: string };
type GeneratedActivityContent = {
  activityId: string;
  stageKey: string;
  title: string;
  hook: string;
  primaryCopy: string;
  cta: string;
  visualDirection: string;
  productionNotes: string;
  channelVersions: ChannelVersion[];
};
type ContentReview = { source: "ai-nonymauz-cloud" | "starter"; summary: string; contents: GeneratedActivityContent[] };

type Mode = "production" | "sandbox";
const CACHE_KEY = "kretivos-funnels-cache";
const LEGACY_KEY = "kretivos-funnels";
const MIGRATED_KEY = "kretivos-funnels-neon-migrated";
const SANDBOX_KEY = "kretivos-funnel-sandbox";

const emptyStages = (): FunnelStage[] => [
  { key: "TOFU", title: "Awareness", objective: "Reach the right new audience.", kpi: "Reach and attention", sortOrder: 0, items: [] },
  { key: "MOFU", title: "Consideration", objective: "Build trust and help the audience evaluate the offer.", kpi: "Engagement and qualified intent", sortOrder: 1, items: [] },
  { key: "BOFU", title: "Conversion", objective: "Remove friction and drive the required action.", kpi: "Leads, sales or bookings", sortOrder: 2, items: [] },
  { key: "RETENTION", title: "Retention", objective: "Create repeat value, advocacy and referrals.", kpi: "Repeat, reviews and referrals", sortOrder: 3, items: [] },
];

/** Lifecycle an activity moves through; the chip on each card cycles this list. */
const ACTIVITY_STATUSES: string[] = ["Draft", "In progress", "Ready", "Live"];
const STAGE_KEYS: PlaybookStageKey[] = ["TOFU", "MOFU", "BOFU", "RETENTION"];

const uid = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();

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

function channelsForSuggestions(suggestions: string[], channels: Channel[]) {
  const terms = suggestions.map((item) => item.toLowerCase());
  return channels
    .filter((channel) => terms.some((term) => channel.name.toLowerCase().includes(term) || channel.category.toLowerCase().includes(term) || term.includes(channel.name.toLowerCase()) || term.includes(channel.category.toLowerCase())))
    .map((channel) => channel.id);
}

function funnelFromPlaybook(playbook: FunnelPlaybook | undefined, form: CreateForm, channels: Channel[], customer?: Customer, brand?: Brand, sandbox = false): Funnel {
  const stamp = now();
  const stages = playbook
    ? playbook.stages.map((stage, stageIndex) => ({
        key: stage.key,
        title: stage.title,
        objective: stage.objective,
        kpi: stage.kpi,
        sortOrder: stageIndex,
        items: stage.activities.map((item, itemIndex) => ({
          id: uid(),
          title: item.title,
          format: item.format,
          cta: item.cta,
          contentTemplateId: "",
          marketingChannelIds: channelsForSuggestions(item.channelSuggestions, channels),
          content: {},
          status: "Draft",
          sortOrder: itemIndex,
        })),
      }))
    : emptyStages();

  return {
    id: uid(),
    customerId: sandbox ? "" : form.customerId,
    client: sandbox ? "Sandbox" : customer?.name || "Unknown customer",
    brandId: sandbox ? "" : form.brandId,
    brandName: sandbox ? "" : brand?.name || "",
    playbookKey: playbook?.key || "custom",
    name: form.name.trim() || playbook?.name || "Untitled funnel",
    objective: form.objective.trim() || playbook?.description || "",
    audience: form.audience.trim(),
    offer: form.offer.trim(),
    summary: playbook ? `${playbook.description} Best for: ${playbook.bestFor.join(", ")}.` : "Custom funnel created in KretivOS.",
    status: "Draft",
    source: form.useAI ? "ai-nonymauz-cloud" : playbook ? "playbook" : "manual",
    metadata: { buyingCycle: playbook?.buyingCycle, risks: playbook?.risks || [] },
    createdAt: stamp,
    updatedAt: stamp,
    stages,
    sandbox,
  };
}

function normaliseLegacy(item: any, customers: Customer[], channels: Channel[]): Funnel | null {
  const customer = customers.find((candidate) => candidate.name.toLowerCase() === String(item.client || "").toLowerCase());
  if (!customer) return null;
  const channelText = String(item.channels || "").toLowerCase();
  const channelIds = channels.filter((channel) => channelText.includes(channel.name.toLowerCase())).map((channel) => channel.id);
  return {
    id: item.id || uid(),
    customerId: customer.id,
    client: customer.name,
    brandId: "",
    brandName: "",
    playbookKey: "custom",
    name: item.name || "Imported funnel",
    objective: item.objective || "",
    audience: item.audience || "",
    offer: item.offer || "",
    summary: item.summary || "Imported from the previous PWA browser store.",
    status: item.status || "Draft",
    source: item.source || "legacy-import",
    createdAt: item.createdAt || now(),
    updatedAt: item.updatedAt || now(),
    stages: (item.stages || emptyStages()).map((stage: any, stageIndex: number) => ({
      key: stage.key,
      title: stage.title,
      objective: stage.objective || "",
      kpi: stage.kpi || "",
      sortOrder: stageIndex,
      items: (stage.items || []).map((activity: any, activityIndex: number) => ({
        id: activity.id || uid(),
        title: activity.title || "Untitled activity",
        format: activity.format || "",
        cta: activity.cta || "",
        contentTemplateId: "",
        marketingChannelIds: channelIds.length ? channelIds : channels.filter((channel) => String(activity.channel || "").toLowerCase().includes(channel.name.toLowerCase())).map((channel) => channel.id),
        content: {},
        status: "Draft",
        sortOrder: activityIndex,
      })),
    })),
  };
}

function activityCount(funnel: Funnel) {
  return funnel.stages.reduce((sum, stage) => sum + stage.items.length, 0);
}

export default function FunnelLibraryPage() {
  const [mode, setMode] = useState<Mode>("production");
  const [funnels, setFunnels] = useState<Funnel[]>(parseLocal(CACHE_KEY, []));
  const [sandboxFunnels, setSandboxFunnels] = useState<Funnel[]>(parseLocal(SANDBOX_KEY, []));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [contentTemplates, setContentTemplates] = useState<ContentTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("All customers");
  const [mobileDetail, setMobileDetail] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailDraft, setDetailDraft] = useState<Funnel | null>(null);
  const [activityEditor, setActivityEditor] = useState<ActivityEditor>(null);
  const [contentReview, setContentReview] = useState<ContentReview | null>(null);
  const [form, setForm] = useState<CreateForm>({ customerId: "", brandId: "", playbookKey: FUNNEL_PLAYBOOKS[0].key, name: "", objective: "", audience: "", offer: "", useAI: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const activeList = mode === "production" ? funnels : sandboxFunnels;
  const selected = activeList.find((item) => item.id === selectedId) || activeList[0];
  const selectedCustomerBrands = brands.filter((brand) => brand.customerId === form.customerId);
  const editCustomerBrands = brands.filter((brand) => brand.customerId === detailDraft?.customerId);

  async function loadData(migrateLegacy = false) {
    setLoading(true);
    setError("");
    try {
      const [funnelData, businessData] = await Promise.all([
        jsonRequest("/api/funnels", { cache: "no-store" }),
        jsonRequest("/api/business", { cache: "no-store" }),
      ]);
      const nextCustomers = (businessData.customers || []).map((item: any) => ({ id: item.id, name: item.name, industry: item.industry }));
      const nextBrands = (businessData.brands || []).map((item: any) => ({ id: item.id, customerId: item.customerId, name: item.name }));
      const nextChannels = (businessData.channels || []).filter((item: any) => item.status === "Active").map((item: any) => ({ id: item.id, name: item.name, category: item.category, status: item.status }));
      let serverFunnels = funnelData.funnels as Funnel[];

      if (migrateLegacy && !localStorage.getItem(MIGRATED_KEY)) {
        const legacy = parseLocal<any[]>(LEGACY_KEY, []);
        const serverIds = new Set(serverFunnels.map((item) => item.id));
        for (const raw of legacy) {
          if (serverIds.has(raw.id)) continue;
          const converted = normaliseLegacy(raw, nextCustomers, nextChannels);
          if (!converted) continue;
          try {
            const created = await jsonRequest("/api/funnels", { method: "POST", body: JSON.stringify(converted) });
            serverFunnels = [created.funnel, ...serverFunnels];
            serverIds.add(created.funnel.id);
          } catch {}
        }
        localStorage.setItem(MIGRATED_KEY, "true");
      }

      setFunnels(serverFunnels);
      setCustomers(nextCustomers);
      setBrands(nextBrands);
      setChannels(nextChannels);
      setContentTemplates(funnelData.contentTemplates || []);
      localStorage.setItem(CACHE_KEY, JSON.stringify(serverFunnels));
      setSelectedId((current) => serverFunnels.some((item) => item.id === current) ? current : serverFunnels[0]?.id || sandboxFunnels[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load shared funnels.");
      setFunnels(parseLocal(CACHE_KEY, []));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(true); }, []);
  useEffect(() => { localStorage.setItem(SANDBOX_KEY, JSON.stringify(sandboxFunnels)); }, [sandboxFunnels]);
  useEffect(() => {
    const list = mode === "production" ? funnels : sandboxFunnels;
    if (!list.some((item) => item.id === selectedId)) setSelectedId(list[0]?.id || "");
  }, [mode, funnels, sandboxFunnels, selectedId]);

  // Only switching between client and sandbox mode returns to the list on mobile.
  // Resetting on every funnel change would bounce the user out of the detail pane
  // each time an activity is edited, reordered or moved between stages.
  useEffect(() => { setMobileDetail(false); }, [mode]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return activeList.filter((item) => {
      const clientMatch = mode === "sandbox" || clientFilter === "All customers" || item.client === clientFilter;
      const haystack = [item.name, item.client, item.brandName, item.objective, item.audience, item.offer, item.status].join(" ").toLowerCase();
      return clientMatch && (!term || haystack.includes(term));
    });
  }, [activeList, query, clientFilter, mode]);

  async function createFunnel() {
    if (mode === "production" && !form.customerId) { setError("Choose an existing customer before creating a production funnel."); return; }
    if (!form.name.trim() && form.playbookKey === "custom") { setError("Add a funnel name for a custom funnel."); return; }
    setSaving(true);
    setError("");
    try {
      const playbook = FUNNEL_PLAYBOOKS.find((item) => item.key === form.playbookKey);
      const customer = customers.find((item) => item.id === form.customerId);
      const brand = brands.find((item) => item.id === form.brandId);
      let draft = funnelFromPlaybook(playbook, form, channels, customer, brand, mode === "sandbox");

      if (form.useAI) {
        try {
          const ai = await jsonRequest("/api/ai", {
            method: "POST",
            body: JSON.stringify({
              module: "Funnel Builder",
              messages: [{ role: "user", content: `Improve this marketing funnel for ${customer?.name || "a sandbox client"}. Return only JSON with keys summary and stages. Each stage must contain key, title, objective, kpi and items. Every item must contain title, format and cta. Keep stage keys TOFU, MOFU, BOFU and RETENTION.\n\nObjective: ${draft.objective}\nAudience: ${draft.audience}\nOffer: ${draft.offer}\nPlaybook: ${playbook?.name || "Custom"}\nCurrent funnel: ${JSON.stringify(draft.stages)}` }],
            }),
          });
          const raw = String(ai.content || "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.stages)) {
            draft = {
              ...draft,
              summary: parsed.summary || draft.summary,
              stages: parsed.stages.map((stage: any, stageIndex: number) => ({
                key: stage.key,
                title: stage.title,
                objective: stage.objective || "",
                kpi: stage.kpi || "",
                sortOrder: stageIndex,
                items: (stage.items || []).map((item: any, itemIndex: number) => ({ id: uid(), title: item.title, format: item.format || "", cta: item.cta || "", contentTemplateId: "", marketingChannelIds: [], content: {}, status: "Draft", sortOrder: itemIndex })),
              })),
            };
          }
        } catch {
          setNotice("AI response could not be parsed, so the selected playbook was used instead.");
        }
      }

      if (mode === "sandbox") {
        setSandboxFunnels((current) => [draft, ...current]);
        setSelectedId(draft.id);
      } else {
        const data = await jsonRequest("/api/funnels", { method: "POST", body: JSON.stringify(draft) });
        setFunnels((current) => [data.funnel, ...current.filter((item) => item.id !== data.funnel.id)]);
        setContentTemplates(data.contentTemplates || contentTemplates);
        setSelectedId(data.funnel.id);
      }
      setCreateOpen(false);
      setMobileDetail(true);
      setForm({ customerId: "", brandId: "", playbookKey: FUNNEL_PLAYBOOKS[0].key, name: "", objective: "", audience: "", offer: "", useAI: false });
      setNotice(mode === "sandbox" ? "Sandbox funnel created." : "Shared funnel created in Neon.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create funnel.");
    } finally { setSaving(false); }
  }

  async function persistFunnel(next: Funnel, message = "Funnel updated.") {
    setSaving(true);
    setError("");
    try {
      if (next.sandbox || mode === "sandbox") {
        const updated = { ...next, updatedAt: now(), sandbox: true };
        setSandboxFunnels((current) => current.map((item) => item.id === updated.id ? updated : item));
        setNotice(message);
        return updated;
      }
      const data = await jsonRequest("/api/funnels", { method: "PATCH", body: JSON.stringify(next) });
      setFunnels((current) => current.map((item) => item.id === data.funnel.id ? data.funnel : item));
      setNotice(message);
      return data.funnel as Funnel;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save funnel.");
      return null;
    } finally { setSaving(false); }
  }

  async function saveDetails() {
    if (!detailDraft) return;
    if (!detailDraft.sandbox && !detailDraft.customerId) { setError("Customer is required."); return; }
    const customer = customers.find((item) => item.id === detailDraft.customerId);
    const brand = brands.find((item) => item.id === detailDraft.brandId);
    const saved = await persistFunnel({ ...detailDraft, client: detailDraft.sandbox ? "Sandbox" : customer?.name || detailDraft.client, brandName: brand?.name || "" });
    if (saved) { setEditingDetails(false); setDetailDraft(null); }
  }

  async function deleteFunnel() {
    if (!selected || !window.confirm(`Delete “${selected.name}”?`)) return;
    setSaving(true);
    try {
      if (selected.sandbox || mode === "sandbox") setSandboxFunnels((current) => current.filter((item) => item.id !== selected.id));
      else {
        await jsonRequest(`/api/funnels?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
        setFunnels((current) => current.filter((item) => item.id !== selected.id));
      }
      setMobileDetail(false);
      setNotice("Funnel deleted.");
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Unable to delete funnel."); }
    finally { setSaving(false); }
  }

  async function saveActivity() {
    if (!selected || !activityEditor || !activityEditor.item.title.trim()) return;
    const nextStages = selected.stages.map((stage) => {
      if (stage.key !== activityEditor.stageKey) return stage;
      const item = { ...activityEditor.item, sortOrder: activityEditor.isNew ? stage.items.length : activityEditor.item.sortOrder };
      const items = activityEditor.isNew ? [...stage.items, item] : stage.items.map((current) => current.id === item.id ? item : current);
      return { ...stage, items };
    });
    const saved = await persistFunnel({ ...selected, stages: nextStages }, activityEditor.isNew ? "Funnel activity added." : "Funnel activity updated.");
    if (saved) setActivityEditor(null);
  }

  async function deleteActivity(stageKey: PlaybookStageKey, activityId: string) {
    if (!selected || !window.confirm("Delete this funnel activity?")) return;
    const next = { ...selected, stages: selected.stages.map((stage) => stage.key === stageKey ? { ...stage, items: stage.items.filter((item) => item.id !== activityId) } : stage) };
    await persistFunnel(next, "Funnel activity deleted.");
  }

  async function promoteSandbox() {
    if (!selected?.sandbox) return;
    setForm({ customerId: "", brandId: "", playbookKey: selected.playbookKey, name: selected.name, objective: selected.objective, audience: selected.audience, offer: selected.offer, useAI: false });
    setCreateOpen(true);
    setNotice("Choose the customer and brand. The sandbox structure will be copied after creation.");
  }

  /**
   * Applies a change to the selected funnel's stages. The local list is updated
   * first so reordering feels immediate, then the result is persisted.
   */
  async function updateStages(mutate: (stages: FunnelStage[]) => FunnelStage[], message: string) {
    if (!selected) return;
    const mutated = mutate(JSON.parse(JSON.stringify(selected.stages)) as FunnelStage[]);
    const next: Funnel = {
      ...selected,
      stages: mutated.map((stage, stageIndex) => ({
        ...stage,
        sortOrder: stageIndex,
        items: stage.items.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex })),
      })),
    };

    if (next.sandbox || mode === "sandbox") setSandboxFunnels((current) => current.map((item) => item.id === next.id ? next : item));
    else setFunnels((current) => current.map((item) => item.id === next.id ? next : item));

    await persistFunnel(next, message);
  }

  function moveActivity(stageKey: PlaybookStageKey, activityId: string, direction: -1 | 1) {
    return updateStages((stages) => stages.map((stage) => {
      if (stage.key !== stageKey) return stage;
      const index = stage.items.findIndex((item) => item.id === activityId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= stage.items.length) return stage;
      const items = [...stage.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...stage, items };
    }), "Activity order updated.");
  }

  function moveActivityToStage(fromKey: PlaybookStageKey, activityId: string, toKey: PlaybookStageKey) {
    if (fromKey === toKey) return;
    return updateStages((stages) => {
      const moving = stages.find((stage) => stage.key === fromKey)?.items.find((item) => item.id === activityId);
      if (!moving) return stages;
      return stages.map((stage) => {
        if (stage.key === fromKey) return { ...stage, items: stage.items.filter((item) => item.id !== activityId) };
        if (stage.key === toKey) return { ...stage, items: [...stage.items, moving] };
        return stage;
      });
    }, `Activity moved to ${toKey}.`);
  }

  function cycleActivityStatus(stageKey: PlaybookStageKey, activityId: string) {
    return updateStages((stages) => stages.map((stage) => stage.key !== stageKey ? stage : {
      ...stage,
      items: stage.items.map((item) => item.id === activityId
        ? { ...item, status: ACTIVITY_STATUSES[(ACTIVITY_STATUSES.indexOf(item.status) + 1) % ACTIVITY_STATUSES.length] }
        : item),
    }), "Activity status updated.");
  }

  function applyTemplate(templateId: string) {
    if (!activityEditor) return;
    const template = contentTemplates.find((item) => item.id === templateId);
    setActivityEditor({
      ...activityEditor,
      item: {
        ...activityEditor.item,
        contentTemplateId: templateId,
        title: activityEditor.item.title || template?.name || "",
        format: template?.format || activityEditor.item.format,
        content: template ? { outline: template.content, templateName: template.name } : {},
      },
    });
  }

  function updateEditorContent(patch: Record<string, unknown>) {
    if (!activityEditor) return;
    setActivityEditor({
      ...activityEditor,
      item: { ...activityEditor.item, content: { ...activityEditor.item.content, ...patch } },
    });
  }

  function updateEditorChannelVersion(index: number, copy: string) {
    if (!activityEditor) return;
    const versions = Array.isArray(activityEditor.item.content.channelVersions)
      ? [...activityEditor.item.content.channelVersions as ChannelVersion[]]
      : [];
    if (!versions[index]) return;
    versions[index] = { ...versions[index], copy };
    updateEditorContent({ channelVersions: versions });
  }

  async function generateFunnelContent() {
    if (!selected || !activityCount(selected)) { setError("Add at least one funnel activity first."); return; }
    setGeneratingContent(true);
    setError("");
    setNotice("");
    try {
      const result = await jsonRequest("/api/funnels/content", {
        method: "POST",
        body: JSON.stringify({ funnel: selected, channels }),
      });
      setContentReview({ source: result.source, summary: result.summary, contents: result.contents || [] });
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Unable to generate funnel content.");
    } finally { setGeneratingContent(false); }
  }

  function updateReviewItem(activityId: string, patch: Partial<GeneratedActivityContent>) {
    setContentReview((current) => current ? {
      ...current,
      contents: current.contents.map((item) => item.activityId === activityId ? { ...item, ...patch } : item),
    } : current);
  }

  function updateReviewChannel(activityId: string, channelId: string, copy: string) {
    setContentReview((current) => current ? {
      ...current,
      contents: current.contents.map((item) => item.activityId !== activityId ? item : {
        ...item,
        channelVersions: item.channelVersions.map((version) => version.channelId === channelId ? { ...version, copy } : version),
      }),
    } : current);
  }

  async function saveGeneratedContent() {
    if (!selected || !contentReview) return;
    const contentByActivity = new Map(contentReview.contents.map((item) => [item.activityId, item]));
    const generatedAt = now();
    const next: Funnel = {
      ...selected,
      metadata: { ...selected.metadata, contentGeneratedAt: generatedAt, contentSource: contentReview.source },
      stages: selected.stages.map((stage) => ({
        ...stage,
        items: stage.items.map((item) => {
          const generated = contentByActivity.get(item.id);
          if (!generated) return item;
          return {
            ...item,
            cta: generated.cta,
            content: {
              ...item.content,
              hook: generated.hook,
              primaryCopy: generated.primaryCopy,
              visualDirection: generated.visualDirection,
              productionNotes: generated.productionNotes,
              channelVersions: generated.channelVersions,
              aiGenerated: true,
              aiSource: contentReview.source,
              generatedAt,
            },
          };
        }),
      })),
    };
    const saved = await persistFunnel(next, `Content drafts saved for ${contentReview.contents.length} funnel activities.`);
    if (saved) setContentReview(null);
  }

  return (
    <WorkspacePage eyebrow="Marketing journey system" title="Funnel Builder" description="Build shared customer funnels from approved playbooks, channels and content templates. Use Sandbox to experiment without creating a live client record." actions={<div className="flex gap-2"><Button variant="outline" className="bg-white" onClick={() => loadData(false)} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Button><Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{mode === "sandbox" ? "New sandbox" : "Add funnel"}</Button></div>}>
      {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}
      {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}

      <div className="mb-5 flex rounded-xl border bg-white/80 p-1.5"><button onClick={() => setMode("production")} className={cn("flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium", mode === "production" ? "bg-[#202c25] text-white" : "text-muted-foreground hover:bg-[#f3efe6]")}><Target className="h-4 w-4" />Client funnels</button><button onClick={() => setMode("sandbox")} className={cn("flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium", mode === "sandbox" ? "bg-[#202c25] text-white" : "text-muted-foreground hover:bg-[#f3efe6]")}><FlaskConical className="h-4 w-4" />Funnel Sandbox</button></div>

      <div className="grid gap-5 xl:grid-cols-[370px_minmax(0,1fr)]">
        <Card className={cn("overflow-hidden bg-white/80", mobileDetail && "hidden xl:block")}><CardHeader className="border-b p-4"><div className="flex items-center justify-between"><div><CardTitle>{mode === "sandbox" ? "Sandbox experiments" : "Funnel library"}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{filtered.length} funnels</p></div><List className="h-5 w-5 text-[#ba5c42]" /></div><div className="mt-4 space-y-2"><div className="flex h-11 items-center gap-2 rounded-xl border bg-white px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 text-sm outline-none" placeholder="Search funnels..." /></div>{mode === "production" && <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none"><option>All customers</option>{customers.map((item) => <option key={item.id}>{item.name}</option>)}</select>}</div></CardHeader><CardContent className="max-h-[65vh] space-y-2 overflow-y-auto p-3 xl:max-h-[calc(100vh-300px)]">{filtered.map((funnel) => <button key={funnel.id} onClick={() => { setSelectedId(funnel.id); setMobileDetail(true); }} className={cn("w-full rounded-2xl border p-4 text-left transition", selected?.id === funnel.id ? "border-[#ba5c42] bg-[#fff8f4]" : "bg-white hover:bg-[#f8f5ee]")}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="line-clamp-2 text-sm font-semibold">{funnel.name}</div><div className="mt-1 text-[11px] text-muted-foreground">{funnel.sandbox ? "Sandbox" : funnel.client}{funnel.brandName ? ` · ${funnel.brandName}` : ""}</div></div><Status value={funnel.status} /></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{funnel.objective}</p><div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground"><span>{activityCount(funnel)} activities</span><span>{FUNNEL_PLAYBOOKS.find((item) => item.key === funnel.playbookKey)?.name.split("—")[0].trim() || "Custom"}</span></div></button>)}{!filtered.length && <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No funnels found.</div>}</CardContent></Card>

        <div className={cn("min-w-0", !mobileDetail && "hidden xl:block")}>
          {selected ? <div className="space-y-5">
            <Card className="bg-white/80"><CardHeader className="border-b p-4 sm:p-6"><div className="flex items-start gap-3 xl:hidden"><button onClick={() => setMobileDetail(false)} className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white"><ChevronLeft className="h-4 w-4" /></button><div className="min-w-0 flex-1"><CardTitle className="line-clamp-2">{selected.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{selected.sandbox ? "Sandbox experiment" : selected.client}</p></div></div><div className="hidden items-start justify-between gap-4 xl:flex"><div><div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[.15em] text-[#ba5c42]"><span>{selected.sandbox ? "Sandbox" : selected.client}</span>{selected.brandName && <><span>•</span><span>{selected.brandName}</span></>}<span>•</span><span>{selected.playbookKey}</span></div><CardTitle className="mt-2 text-2xl">{selected.name}</CardTitle><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{selected.summary}</p></div><Status value={selected.status} /></div><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={generateFunnelContent} disabled={generatingContent || saving || !activityCount(selected)}>{generatingContent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{generatingContent ? "Generating content…" : "Generate funnel content"}</Button><Button variant="outline" size="sm" onClick={() => { setDetailDraft(JSON.parse(JSON.stringify(selected))); setEditingDetails(true); }}><Pencil className="h-3.5 w-3.5" />Edit details</Button>{selected.sandbox && <Button variant="outline" size="sm" onClick={promoteSandbox}><Target className="h-3.5 w-3.5" />Promote to client</Button>}<Button variant="outline" size="sm" className="text-red-600" onClick={deleteFunnel}><Trash2 className="h-3.5 w-3.5" />Delete</Button></div></CardHeader><CardContent className="grid gap-3 p-4 sm:grid-cols-3 sm:p-6"><Mini label="Objective" value={selected.objective} /><Mini label="Audience" value={selected.audience || "Not defined"} /><Mini label="Offer" value={selected.offer || "Not defined"} /></CardContent></Card>

            <div className="grid gap-4 2xl:grid-cols-2">{selected.stages.map((stage) => {
              const ready = stage.items.filter((item) => item.status === "Ready" || item.status === "Live").length;
              const coverage = stage.items.length ? Math.round(ready / stage.items.length * 100) : 0;
              return <Card key={stage.key} className="min-w-0 bg-white/80">
                <CardHeader className="border-b p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#ba5c42]">{stage.key}</div>
                      <CardTitle className="mt-1">{stage.title}</CardTitle>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{stage.objective}</p>
                    </div>
                    <Button size="sm" onClick={() => setActivityEditor({ stageKey: stage.key, isNew: true, item: { id: uid(), title: "", format: "", cta: "", contentTemplateId: "", marketingChannelIds: [], content: {}, status: "Draft", sortOrder: stage.items.length } })}><Plus className="h-3.5 w-3.5" />Activity</Button>
                  </div>
                  <div className="mt-3 rounded-lg bg-[#f3efe7] px-3 py-2 text-[11px] text-[#5d665f]">KPI: {stage.kpi}</div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ece8de]"><div className="h-full rounded-full bg-[#ba5c42] transition-all" style={{ width: `${coverage}%` }} /></div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{ready}/{stage.items.length} ready</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 p-3">
                  {stage.items.map((item, index) => <ActivityCard
                    key={item.id}
                    item={item}
                    index={index}
                    total={stage.items.length}
                    stageKey={stage.key}
                    channelNames={item.marketingChannelIds.map((id) => channels.find((channel) => channel.id === id)?.name || id)}
                    busy={saving}
                    onEdit={() => setActivityEditor({ stageKey: stage.key, item: JSON.parse(JSON.stringify(item)), isNew: false })}
                    onDelete={() => deleteActivity(stage.key, item.id)}
                    onMove={(direction) => moveActivity(stage.key, item.id, direction)}
                    onMoveStage={(toKey) => moveActivityToStage(stage.key, item.id, toKey)}
                    onCycleStatus={() => cycleActivityStatus(stage.key, item.id)}
                  />)}
                  {!stage.items.length && <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">No activities yet. Add one, or move an activity here from another stage.</div>}
                </CardContent>
              </Card>;
            })}</div>
          </div> : <Card className="bg-white/80"><CardContent className="p-12 text-center"><Layers3 className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-4 font-semibold">No funnel selected</div><Button className="mt-4" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Create funnel</Button></CardContent></Card>}
        </div>
      </div>

      {createOpen && <Modal title={mode === "sandbox" ? "Create Funnel Sandbox" : "Add client funnel"} subtitle={mode === "sandbox" ? "Experiment without assigning a customer. Promote it when ready." : "Choose an existing customer, brand and proven playbook."} onClose={() => setCreateOpen(false)} footer={<><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={createFunnel} disabled={saving}>{form.useAI ? <Sparkles className="h-4 w-4" /> : <Save className="h-4 w-4" />}{saving ? "Building…" : form.useAI ? "Build with AI" : "Create funnel"}</Button></>}>
        <div className="grid gap-4 md:grid-cols-2">{mode === "production" && <><Field label="Customer"><select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value, brandId: "" })} className="control"><option value="">Choose customer</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Brand"><select value={form.brandId} onChange={(event) => setForm({ ...form, brandId: event.target.value })} className="control" disabled={!form.customerId}><option value="">No specific brand</option>{selectedCustomerBrands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></>}
          <Field label="Build method" wide><div className="grid gap-2 sm:grid-cols-2"><button onClick={() => setForm({ ...form, useAI: false })} className={cn("rounded-xl border p-3 text-left", !form.useAI ? "border-[#202c25] bg-[#f2f0e8]" : "bg-white")}><div className="flex items-center gap-2 text-sm font-semibold"><Layers3 className="h-4 w-4" />Playbook / Custom</div><p className="mt-1 text-xs text-muted-foreground">Use a maintained framework as the starting structure.</p></button><button onClick={() => setForm({ ...form, useAI: true })} className={cn("rounded-xl border p-3 text-left", form.useAI ? "border-[#202c25] bg-[#f2f0e8]" : "bg-white")}><div className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4" />AI-assisted</div><p className="mt-1 text-xs text-muted-foreground">AI customises the selected playbook to the objective.</p></button></div></Field>
          <Field label="Funnel playbook" wide><select value={form.playbookKey} onChange={(event) => setForm({ ...form, playbookKey: event.target.value })} className="control"><option value="custom">Create custom funnel</option>{Array.from(new Set(FUNNEL_PLAYBOOKS.map((item) => item.category))).map((category) => <optgroup key={category} label={category}>{FUNNEL_PLAYBOOKS.filter((item) => item.category === category).map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</optgroup>)}</select>{form.playbookKey !== "custom" && <p className="mt-2 text-xs leading-5 text-muted-foreground">{FUNNEL_PLAYBOOKS.find((item) => item.key === form.playbookKey)?.description}</p>}</Field>
          <Field label="Funnel name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="control" placeholder={FUNNEL_PLAYBOOKS.find((item) => item.key === form.playbookKey)?.name || "Campaign funnel"} /></Field><Field label="Objective"><input value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} className="control" placeholder="What must this funnel achieve?" /></Field><Field label="Audience"><textarea value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} className="textarea" placeholder="Who should move through this funnel?" /></Field><Field label="Offer"><textarea value={form.offer} onChange={(event) => setForm({ ...form, offer: event.target.value })} className="textarea" placeholder="Product, service, lead magnet or action" /></Field>
        </div>
      </Modal>}

      {editingDetails && detailDraft && <Modal title="Edit funnel details" subtitle="Update the customer relationship, strategy and lifecycle status." onClose={() => { setEditingDetails(false); setDetailDraft(null); }} footer={<><Button variant="outline" onClick={() => { setEditingDetails(false); setDetailDraft(null); }}>Cancel</Button><Button onClick={saveDetails} disabled={saving}><Save className="h-4 w-4" />Save changes</Button></>}>
        <div className="grid gap-4 md:grid-cols-2">{!detailDraft.sandbox && <><Field label="Customer"><select value={detailDraft.customerId} onChange={(event) => setDetailDraft({ ...detailDraft, customerId: event.target.value, brandId: "", brandName: "" })} className="control">{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Brand"><select value={detailDraft.brandId} onChange={(event) => setDetailDraft({ ...detailDraft, brandId: event.target.value })} className="control"><option value="">No specific brand</option>{editCustomerBrands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></>}<Field label="Name"><input value={detailDraft.name} onChange={(event) => setDetailDraft({ ...detailDraft, name: event.target.value })} className="control" /></Field><Field label="Status"><select value={detailDraft.status} onChange={(event) => setDetailDraft({ ...detailDraft, status: event.target.value as Funnel["status"] })} className="control"><option>Draft</option><option>Review</option><option>Active</option><option>Completed</option></select></Field><Field label="Objective" wide><textarea value={detailDraft.objective} onChange={(event) => setDetailDraft({ ...detailDraft, objective: event.target.value })} className="textarea" /></Field><Field label="Audience"><textarea value={detailDraft.audience} onChange={(event) => setDetailDraft({ ...detailDraft, audience: event.target.value })} className="textarea" /></Field><Field label="Offer"><textarea value={detailDraft.offer} onChange={(event) => setDetailDraft({ ...detailDraft, offer: event.target.value })} className="textarea" /></Field><Field label="Summary" wide><textarea value={detailDraft.summary} onChange={(event) => setDetailDraft({ ...detailDraft, summary: event.target.value })} className="textarea min-h-28" /></Field></div>
      </Modal>}

      {contentReview && <Modal title="Review AI funnel content" subtitle="Nothing is saved yet. Edit the drafts below, then save them into the existing funnel activities." onClose={() => setContentReview(null)} footer={<><Button variant="outline" onClick={() => setContentReview(null)}>Discard</Button><Button onClick={saveGeneratedContent} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "Saving…" : "Save all content drafts"}</Button></>}>
        <div className="mb-5 rounded-xl border bg-white p-4"><div className="flex items-center justify-between gap-3"><div className="text-sm font-semibold">{contentReview.summary}</div><span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px]", contentReview.source === "ai-nonymauz-cloud" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{contentReview.source}</span></div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">Verify claims, offers, links and dates before changing an activity to Ready.</p></div>
        <div className="space-y-4">{contentReview.contents.map((item) => <Card key={item.activityId} className="overflow-hidden bg-white"><CardHeader className="border-b p-4"><div className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#ba5c42]">{item.stageKey}</div><CardTitle className="mt-1 text-base">{item.title}</CardTitle></CardHeader><CardContent className="grid gap-4 p-4 md:grid-cols-2"><Field label="Hook" wide><textarea value={item.hook} onChange={(event) => updateReviewItem(item.activityId, { hook: event.target.value })} className="textarea min-h-20" /></Field><Field label="Primary caption / copy" wide><textarea value={item.primaryCopy} onChange={(event) => updateReviewItem(item.activityId, { primaryCopy: event.target.value })} className="textarea min-h-32" /></Field><Field label="CTA"><input value={item.cta} onChange={(event) => updateReviewItem(item.activityId, { cta: event.target.value })} className="control" /></Field><Field label="Production notes"><textarea value={item.productionNotes} onChange={(event) => updateReviewItem(item.activityId, { productionNotes: event.target.value })} className="textarea min-h-20" /></Field><Field label="Visual direction" wide><textarea value={item.visualDirection} onChange={(event) => updateReviewItem(item.activityId, { visualDirection: event.target.value })} className="textarea min-h-24" /></Field>{item.channelVersions.length > 0 && <Field label="Channel-ready versions" wide><div className="space-y-3">{item.channelVersions.map((version) => <label key={version.channelId} className="block rounded-xl border bg-[#fbfaf7] p-3"><span className="text-[10px] font-semibold uppercase tracking-wider text-[#5d665f]">{version.channelName}</span><textarea value={version.copy} onChange={(event) => updateReviewChannel(item.activityId, version.channelId, event.target.value)} className="mt-2 min-h-24 w-full resize-y bg-transparent text-xs leading-5 outline-none" /></label>)}</div></Field>}</CardContent></Card>)}</div>
      </Modal>}

      {activityEditor && <Modal title={activityEditor.isNew ? "Add funnel activity" : "Edit funnel activity"} subtitle={`Stage: ${activityEditor.stageKey}. Choose a reusable content template or create a custom activity.`} onClose={() => setActivityEditor(null)} footer={<><Button variant="outline" onClick={() => setActivityEditor(null)}>Cancel</Button><Button onClick={saveActivity} disabled={saving}><Save className="h-4 w-4" />Save activity</Button></>}>
        <div className="space-y-4"><Field label="Content template"><select value={activityEditor.item.contentTemplateId} onChange={(event) => applyTemplate(event.target.value)} className="control"><option value="">Create custom activity</option>{contentTemplates.filter((item) => !item.stageKey || item.stageKey === activityEditor.stageKey).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.format}</option>)}</select></Field><Field label="Activity title"><input value={activityEditor.item.title} onChange={(event) => setActivityEditor({ ...activityEditor, item: { ...activityEditor.item, title: event.target.value } })} className="control" /></Field><div className="grid gap-4 md:grid-cols-2"><Field label="Format"><input value={activityEditor.item.format} onChange={(event) => setActivityEditor({ ...activityEditor, item: { ...activityEditor.item, format: event.target.value } })} className="control" placeholder="Video, carousel, email" /></Field><Field label="CTA"><input value={activityEditor.item.cta} onChange={(event) => setActivityEditor({ ...activityEditor, item: { ...activityEditor.item, cta: event.target.value } })} className="control" placeholder="Buy now, get directions" /></Field></div><Field label="Marketing channels"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{channels.map((channel) => { const checked = activityEditor.item.marketingChannelIds.includes(channel.id); return <label key={channel.id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", checked ? "border-[#ba5c42] bg-[#fff8f4]" : "bg-white")}><input type="checkbox" checked={checked} onChange={() => setActivityEditor({ ...activityEditor, item: { ...activityEditor.item, marketingChannelIds: checked ? activityEditor.item.marketingChannelIds.filter((id) => id !== channel.id) : [...activityEditor.item.marketingChannelIds, channel.id] } })} className="mt-0.5" /><span><span className="block text-sm font-medium">{channel.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{channel.category}</span></span></label>; })}</div></Field>{activityEditor.item.contentTemplateId && <div className="rounded-xl border bg-[#f7f4ed] p-4 text-xs leading-6 text-muted-foreground">Template outline: {String(activityEditor.item.content.outline || "")}</div>}
          <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#ba5c42]" /><div className="text-sm font-semibold">Content draft</div></div><p className="mt-1 text-[11px] text-muted-foreground">Generated content remains editable and does not publish automatically.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Hook" wide><textarea value={String(activityEditor.item.content.hook || "")} onChange={(event) => updateEditorContent({ hook: event.target.value })} className="textarea min-h-20" /></Field><Field label="Primary caption / copy" wide><textarea value={String(activityEditor.item.content.primaryCopy || "")} onChange={(event) => updateEditorContent({ primaryCopy: event.target.value })} className="textarea min-h-32" /></Field><Field label="Visual direction"><textarea value={String(activityEditor.item.content.visualDirection || "")} onChange={(event) => updateEditorContent({ visualDirection: event.target.value })} className="textarea min-h-24" /></Field><Field label="Production notes"><textarea value={String(activityEditor.item.content.productionNotes || "")} onChange={(event) => updateEditorContent({ productionNotes: event.target.value })} className="textarea min-h-24" /></Field>{Array.isArray(activityEditor.item.content.channelVersions) && (activityEditor.item.content.channelVersions as ChannelVersion[]).length > 0 && <Field label="Channel-ready versions" wide><div className="space-y-3">{(activityEditor.item.content.channelVersions as ChannelVersion[]).map((version, index) => <label key={version.channelId} className="block rounded-xl border bg-[#fbfaf7] p-3"><span className="text-[10px] font-semibold uppercase tracking-wider text-[#5d665f]">{version.channelName}</span><textarea value={version.copy} onChange={(event) => updateEditorChannelVersion(index, event.target.value)} className="mt-2 min-h-24 w-full resize-y bg-transparent text-xs leading-5 outline-none" /></label>)}</div></Field>}</div></div>
        </div>
      </Modal>}

      <style jsx>{`
        .control { height: 2.75rem; width: 100%; border-radius: .75rem; border: 1px solid hsl(var(--border)); background: white; padding: 0 .8rem; font-size: .875rem; outline: none; }
        .textarea { min-height: 6.5rem; width: 100%; resize: vertical; border-radius: .75rem; border: 1px solid hsl(var(--border)); background: white; padding: .8rem; font-size: .875rem; line-height: 1.55; outline: none; }
        .control:focus, .textarea:focus { box-shadow: 0 0 0 4px rgba(186,92,66,.1); border-color: rgba(186,92,66,.6); }
      `}</style>
    </WorkspacePage>
  );
}

function Modal({ title, subtitle, onClose, footer, children }: { title: string; subtitle: string; onClose: () => void; footer: React.ReactNode; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"><div className="max-h-[94dvh] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-[#f7f4ed] shadow-2xl sm:rounded-2xl"><div className="sticky top-0 z-10 flex items-start justify-between border-b bg-[#f7f4ed]/95 p-5 backdrop-blur"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p></div><button onClick={onClose} className="rounded-xl p-2 hover:bg-black/5"><X className="h-4 w-4" /></button></div><div className="p-5">{children}</div><div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">{footer}</div></div></div>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  const control = isValidElement<{ value?: unknown; onChange?: (event: any) => void }>(children) ? children : null;
  const value = typeof control?.props.value === "string" ? control.props.value : "";
  const canImprove = control?.type === "textarea" && typeof control.props.onChange === "function";
  return <div className={cn("block text-xs font-medium text-[#4e5a52]", wide && "md:col-span-2")}><div className="flex min-h-8 items-center justify-between gap-2"><span>{label}</span>{canImprove && <AIWritingButton value={value} field={label} context="KretivOS marketing funnel. Keep the offer, audience, channel, CTA and approved claims accurate." onApply={(next) => control.props.onChange?.({ target: { value: next }, currentTarget: { value: next } })} />}</div><div className="mt-2">{children}</div></div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-white p-3"><div className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">{label}</div><div className="mt-2 text-xs leading-5">{value}</div></div>;
}

const actionClass = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#5d665f] transition hover:bg-[#f3efe7] hover:text-[#202c25] disabled:pointer-events-none disabled:opacity-30";

function activityTone(status: string) {
  if (status === "Live") return "bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
  if (status === "Ready") return "bg-blue-50 text-blue-700 hover:bg-blue-100";
  if (status === "In progress") return "bg-amber-50 text-amber-700 hover:bg-amber-100";
  return "bg-[#eeeae0] text-[#5a605a] hover:bg-[#e4dfd3]";
}

function ActivityCard({ item, index, total, stageKey, channelNames, busy, onEdit, onDelete, onMove, onMoveStage, onCycleStatus }: {
  item: FunnelActivity;
  index: number;
  total: number;
  stageKey: PlaybookStageKey;
  channelNames: string[];
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onMoveStage: (stage: PlaybookStageKey) => void;
  onCycleStatus: () => void;
}) {
  const hook = typeof item.content.hook === "string" ? item.content.hook : "";
  const primaryCopy = typeof item.content.primaryCopy === "string" ? item.content.primaryCopy : "";
  return <div className="rounded-xl border bg-white p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{item.title}</div>
        <div className="mt-1 text-[10px] text-muted-foreground">{item.format || "Format not set"}</div>
      </div>
      <button
        onClick={onCycleStatus}
        disabled={busy}
        title="Tap to advance the status"
        className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition disabled:opacity-50", activityTone(item.status))}
      >
        {item.status || "Draft"}
      </button>
    </div>

    <div className="mt-3 flex flex-wrap gap-1.5">
      {channelNames.map((name) => <span key={name} className="rounded-full bg-[#eeeae0] px-2 py-1 text-[10px] text-[#5a605a]">{name}</span>)}
      {!channelNames.length && <span className="text-[10px] text-muted-foreground">No channel selected</span>}
    </div>

    {item.cta && <div className="mt-3 text-xs"><span className="text-muted-foreground">CTA:</span> {item.cta}</div>}

    {(hook || primaryCopy) && <div className="mt-3 rounded-lg border border-[#eee8dc] bg-[#fbfaf7] p-3"><div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[.14em] text-[#ba5c42]"><Sparkles className="h-3 w-3" />Content draft</div>{hook && <div className="mt-2 line-clamp-2 text-xs font-medium leading-5">{hook}</div>}{primaryCopy && <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-muted-foreground">{primaryCopy}</p>}</div>}

    <div className="mt-3 flex items-center gap-1 border-t pt-2">
      <button onClick={() => onMove(-1)} disabled={busy || index === 0} className={actionClass} aria-label="Move activity up"><ArrowUp className="h-3.5 w-3.5" /></button>
      <button onClick={() => onMove(1)} disabled={busy || index === total - 1} className={actionClass} aria-label="Move activity down"><ArrowDown className="h-3.5 w-3.5" /></button>
      <select
        value={stageKey}
        onChange={(event) => onMoveStage(event.target.value as PlaybookStageKey)}
        disabled={busy}
        aria-label="Move activity to another stage"
        className="h-10 min-w-0 flex-1 rounded-lg border bg-white px-2 text-[11px] outline-none disabled:opacity-40"
      >
        {STAGE_KEYS.map((key) => <option key={key} value={key}>{key === stageKey ? `In ${key}` : `Move to ${key}`}</option>)}
      </select>
      <button onClick={onEdit} disabled={busy} className={actionClass} aria-label="Edit activity"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={onDelete} disabled={busy} className={cn(actionClass, "hover:bg-red-50 hover:text-red-600")} aria-label="Delete activity"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  </div>;
}

function Status({ value }: { value: string }) {
  const tone = value === "Active" || value === "Completed" ? "bg-emerald-50 text-emerald-700" : value === "Review" ? "bg-amber-50 text-amber-700" : "bg-[#eeeae0] text-[#5a605a]";
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium", tone)}>{value}</span>;
}

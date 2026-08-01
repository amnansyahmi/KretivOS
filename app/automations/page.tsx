"use client";

import { isValidElement, useEffect, useMemo, useState } from "react";
import {
  Activity, Bell, Check, ChevronRight, CircleAlert, Clock, List, Pause,
  Pencil, Play, Plus, Save, Search, ShieldCheck, Trash2, Workflow, X, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea, isTextField } from "@/components/ui/textarea";
import { AIWritingButton } from "@/components/ai-writing-button";
import { WorkspacePage } from "@/components/workspace-page";
import {
  ACTION_CATALOG,
  AUTOMATION_RECIPE_KEY,
  AutomationAction,
  AutomationApproval,
  AutomationRecipe,
  AutomationRun,
  AutomationTrigger,
  DEFAULT_AUTOMATION_RECIPES,
  KretivNotification,
  TRIGGER_CATALOG,
  actionLabel,
  automationId,
  triggerLabel
} from "@/lib/automation-engine";
import { cn } from "@/lib/utils";

type ViewTab = "workflows" | "approvals" | "notifications" | "runs";

type Draft = AutomationRecipe;
const SERVER_MIGRATED_KEY = "kretivos-automations-neon-migrated";

function parse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return (JSON.parse(value) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function loadLegacyRecipes() {
  const saved = parse<AutomationRecipe[]>(localStorage.getItem(AUTOMATION_RECIPE_KEY), []);
  if (!saved.length) return DEFAULT_AUTOMATION_RECIPES;
  const savedById = new Map(saved.map((item) => [item.id, item]));
  const defaults = DEFAULT_AUTOMATION_RECIPES.map((item) => ({ ...item, ...(savedById.get(item.id) || {}) }));
  const custom = saved.filter((item) => !DEFAULT_AUTOMATION_RECIPES.some((base) => base.id === item.id));
  return [...defaults, ...custom];
}

function emptyDraft(): Draft {
  const stamp = new Date().toISOString();
  return {
    id: "",
    name: "",
    description: "",
    workspace: "Sales",
    trigger: "customer.created",
    actions: ["create_onboarding"],
    status: "Active",
    approvalRequired: false,
    system: false,
    createdAt: stamp,
    updatedAt: stamp,
    runCount: 0
  };
}

function formatDate(value?: string) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-MY", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusTone(status: string) {
  if (["Active", "Success", "Approved"].includes(status)) return "bg-emerald-50 text-emerald-700";
  if (["Pending", "Pending approval"].includes(status)) return "bg-amber-50 text-amber-700";
  if (["Failed", "Rejected"].includes(status)) return "bg-red-50 text-red-700";
  return "bg-[#eeeae0] text-[#5a605a]";
}

export default function AutomationsPage() {
  const [recipes, setRecipes] = useState<AutomationRecipe[]>(DEFAULT_AUTOMATION_RECIPES);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [approvals, setApprovals] = useState<AutomationApproval[]>([]);
  const [notifications, setNotifications] = useState<KretivNotification[]>([]);
  const [selectedId, setSelectedId] = useState(DEFAULT_AUTOMATION_RECIPES[0].id);
  const [tab, setTab] = useState<ViewTab>("workflows");
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Automation request failed.");
    return data;
  }

  async function refresh(showLoading = false) {
    if (showLoading) setLoading(true);
    try {
      const data = await request("/api/automations", { cache: "no-store" });
      const nextRecipes = data.recipes as AutomationRecipe[];
      setRecipes(nextRecipes);
      setSelectedId((current) => nextRecipes.some((item) => item.id === current) ? current : nextRecipes[0]?.id || "");
      setRuns(data.runs || []);
      setApprovals(data.approvals || []);
      setNotifications(data.notifications || []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load server automations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const start = async () => {
      if (!localStorage.getItem(SERVER_MIGRATED_KEY)) {
        try {
          await request("/api/automations", { method: "POST", body: JSON.stringify({ operation: "migrate", recipes: loadLegacyRecipes() }) });
          localStorage.setItem(SERVER_MIGRATED_KEY, "true");
        } catch {}
      }
      await refresh(true);
    };
    void start();
    const interval = window.setInterval(() => void refresh(false), 5000);
    return () => window.clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return recipes.filter((item) => !term || [
      item.name,
      item.description,
      item.workspace,
      triggerLabel(item.trigger),
      item.actions.map(actionLabel).join(" ")
    ].some((value) => value.toLowerCase().includes(term)));
  }, [recipes, query]);

  const selected = recipes.find((item) => item.id === selectedId) || filtered[0] || recipes[0];
  const selectedRuns = runs.filter((run) => run.recipeId === selected?.id).slice(0, 20);
  const pendingApprovals = approvals.filter((item) => item.status === "Pending");
  const unreadNotifications = notifications.filter((item) => !item.read);
  const compatibleActions = ACTION_CATALOG.filter((action) => action.compatible.includes(draft.trigger));

  function openCreate() {
    setDraft(emptyDraft());
    setEditorOpen(true);
  }

  function openEdit() {
    if (!selected) return;
    setDraft({ ...selected, actions: [...selected.actions] });
    setEditorOpen(true);
  }

  async function saveRecipe() {
    if (!draft.name.trim() || !draft.actions.length) {
      setNotice("Automation name and at least one action are required.");
      return;
    }
    const stamp = new Date().toISOString();
    const clean: AutomationRecipe = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      workspace: draft.workspace.trim() || "General",
      actions: Array.from(new Set(draft.actions)),
      updatedAt: stamp
    };

    try {
      const creating = !clean.id;
      const recipe = creating ? { ...clean, id: automationId("recipe"), createdAt: stamp, runCount: 0, system: false } : clean;
      const data = await request("/api/automations", { method: "POST", body: JSON.stringify({ operation: "save", recipe }) });
      await refresh(false);
      setSelectedId(data.recipe.id);
      setShowList(false);
      setNotice(creating ? "Server automation created and activated." : "Server automation updated.");
      setEditorOpen(false);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Automation could not be saved.");
    }
  }

  async function deleteRecipe() {
    if (!selected || !window.confirm(`Delete “${selected.name}”?`)) return;
    try {
      await request(`/api/automations?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      await refresh(false);
      setShowList(true);
      setNotice("Automation deleted from Neon.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Automation could not be deleted.");
    }
  }

  async function toggleStatus() {
    if (!selected) return;
    try {
      await request("/api/automations", { method: "POST", body: JSON.stringify({ operation: "save", recipe: { ...selected, status: selected.status === "Active" ? "Paused" : "Active" } }) });
      await refresh(false);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Automation status could not be changed.");
    }
  }

  async function runNow() {
    if (!selected) return;
    if (selected.status === "Paused") {
      setNotice("Activate this workflow before running it.");
      return;
    }
    try {
      await request("/api/automations", { method: "POST", body: JSON.stringify({ operation: "run", recipeId: selected.id }) });
      await refresh(false);
      setNotice(selected.approvalRequired ? "Automation sent to the server approval queue." : "Server automation completed using the latest matching record.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Automation could not run.");
    }
  }

  async function resolveApproval(approvalId: string, decision: "Approved" | "Rejected") {
    try {
      await request("/api/automations", { method: "POST", body: JSON.stringify({ operation: "resolve", approvalId, decision }) });
      await refresh(false);
      setNotice(decision === "Approved" ? "Automation approved and executed on the server." : "Automation rejected.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Approval could not be resolved.");
    }
  }

  async function markNotificationRead(id: string) {
    await request("/api/automations", { method: "POST", body: JSON.stringify({ operation: "notification", id, read: true }) });
    await refresh(false);
  }

  async function clearReadNotifications() {
    const data = await request("/api/automations", { method: "POST", body: JSON.stringify({ operation: "clear_read" }) });
    await refresh(false);
    setNotice(`${data.archived || 0} read notification${data.archived === 1 ? "" : "s"} archived.`);
  }

  function changeTrigger(trigger: AutomationTrigger) {
    const allowed = ACTION_CATALOG.filter((action) => action.compatible.includes(trigger));
    setDraft((current) => ({
      ...current,
      trigger,
      workspace: TRIGGER_CATALOG.find((item) => item.id === trigger)?.workspace || current.workspace,
      actions: current.actions.filter((action) => allowed.some((item) => item.id === action)).length
        ? current.actions.filter((action) => allowed.some((item) => item.id === action))
        : allowed.slice(0, 1).map((item) => item.id)
    }));
  }

  function toggleAction(action: AutomationAction) {
    setDraft((current) => ({
      ...current,
      actions: current.actions.includes(action)
        ? current.actions.filter((item) => item !== action)
        : [...current.actions, action]
    }));
  }

  const tabs: Array<{ id: ViewTab; label: string; count?: number; icon: any }> = [
    { id: "workflows", label: "Workflows", count: recipes.length, icon: Workflow },
    { id: "approvals", label: "Approvals", count: pendingApprovals.length, icon: ShieldCheck },
    { id: "notifications", label: "Notifications", count: unreadNotifications.length, icon: Bell },
    { id: "runs", label: "Audit log", count: runs.length, icon: Activity }
  ];

  return (
    <WorkspacePage
      eyebrow="Cross-module workflow engine"
      title="Automations"
      description="Neon-backed workflows run on the server, continue when the browser is closed, queue higher-risk actions for approval and keep a shared execution audit trail."
      actions={<div className="flex flex-wrap gap-2"><Button variant="outline" className="bg-white" onClick={() => void refresh(true)} disabled={loading}><Activity className={cn("h-4 w-4", loading && "animate-pulse")} />Sync server</Button><button onClick={() => setShowList((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium xl:hidden"><List className="h-4 w-4" />{showList ? "Hide list" : "Show list"}</button><Button onClick={openCreate}><Plus className="h-4 w-4" />New automation</Button></div>}
    >
      {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}
      {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}

      <div className="mb-5 overflow-x-auto rounded-xl border bg-white/70 p-1.5">
        <div className="flex min-w-max gap-1">{tabs.map(({ id, label, count, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={cn("flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition", tab === id ? "bg-[#202c25] text-white" : "text-muted-foreground hover:bg-[#f3efe6]")}><Icon className="h-4 w-4" />{label}{typeof count === "number" && <span className={cn("rounded-full px-2 py-0.5 text-[10px]", tab === id ? "bg-white/15" : "bg-[#eeeae0]")}>{count}</span>}</button>)}</div>
      </div>

      {tab === "workflows" && <div className="grid gap-5 xl:grid-cols-[370px_minmax(0,1fr)]">
        <Card className={cn("h-fit bg-white/80 xl:sticky xl:top-5 xl:block", !showList && "hidden")}>
          <CardHeader className="border-b p-4 sm:p-5"><div className="flex items-center justify-between"><div><CardTitle>Workflow library</CardTitle><p className="mt-1 text-xs text-muted-foreground">{recipes.filter((item) => item.status === "Active").length} active</p></div><Workflow className="h-5 w-5 text-[#ba5c42]" /></div><div className="kretivos-search-control mt-4 flex h-10 items-center gap-2 rounded-xl border bg-white px-3"><Search className="h-5 w-5 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 text-sm outline-none" placeholder="Search workflows" /></div></CardHeader>
          <CardContent className="max-h-[58vh] space-y-2 overflow-y-auto p-3 xl:max-h-[calc(100vh-250px)]">{filtered.map((item) => <button key={item.id} onClick={() => { setSelectedId(item.id); setShowList(false); }} className={cn("w-full rounded-xl border p-4 text-left", selected?.id === item.id ? "border-[#ba5c42] bg-[#fff8f4]" : "bg-white hover:bg-[#f8f5ee]")}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#ba5c42]">{item.workspace}</div><div className="mt-1 text-sm font-semibold">{item.name}</div></div><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</p><div className="mt-3 flex flex-wrap items-center gap-2"><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", statusTone(item.status))}>{item.status}</span><span className="text-[10px] text-muted-foreground">{item.actions.length} actions</span>{item.approvalRequired && <span className="text-[10px] text-amber-700">Approval</span>}</div></button>)}</CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          {selected ? <>
            <Card className="overflow-hidden bg-[#26342b] text-white"><CardContent className="p-5 sm:p-7"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start"><div><div className="text-[10px] uppercase tracking-[.18em] text-white/45">{selected.workspace} · {selected.system ? "KretivOS recipe" : "Custom recipe"}</div><h2 className="mt-3 text-2xl font-semibold sm:text-3xl">{selected.name}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">{selected.description}</p><div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 text-xs text-white/75"><Zap className="h-3.5 w-3.5 text-[#ef9a75]" />When: {triggerLabel(selected.trigger)}</div></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={toggleStatus}>{selected.status === "Active" ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Activate</>}</Button><Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={openEdit}><Pencil className="h-3.5 w-3.5" />Edit</Button><Button variant="outline" size="sm" className="border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/20" onClick={deleteRecipe}><Trash2 className="h-3.5 w-3.5" />Delete</Button></div></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Executions" value={String(selected.runCount || 0)} /><Metric label="Last run" value={formatDate(selected.lastRun)} /><Metric label="Execution mode" value={selected.approvalRequired ? "Approval required" : "Automatic"} /></div><Button className="mt-6 w-full bg-[#ef7f5f] hover:bg-[#e56d4c] sm:w-auto" onClick={runNow}><Zap className="h-4 w-4" />Run with latest record</Button></CardContent></Card>

            <Card className="bg-white/80"><CardHeader><CardTitle>Action sequence</CardTitle><p className="mt-1 text-xs text-muted-foreground">Every action is idempotent. Running it again will skip records that already exist.</p></CardHeader><CardContent className="space-y-3">{selected.actions.map((action, index) => <div key={action} className="flex items-center gap-3 rounded-xl border bg-white p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#202c25] text-xs text-white">{index + 1}</span><div className="min-w-0 flex-1"><div className="text-sm font-medium">{actionLabel(action)}</div><div className="mt-1 text-xs text-muted-foreground">{ACTION_CATALOG.find((item) => item.id === action)?.description}</div></div>{index < selected.actions.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}</div>)}</CardContent></Card>

            <Card className="bg-white/80"><CardHeader><div className="flex items-center justify-between"><div><CardTitle>Recent executions</CardTitle><p className="mt-1 text-xs text-muted-foreground">Latest runs for this workflow</p></div><Activity className="h-5 w-5 text-[#ba5c42]" /></div></CardHeader><CardContent className="space-y-2">{selectedRuns.map((run) => <RunRow key={run.id} run={run} />)}{!selectedRuns.length && <Empty icon={Clock} title="No execution yet" description="Run it manually or wait for its trigger." />}</CardContent></Card>
          </> : <EmptyCard icon={Workflow} title="No workflow selected" description="Create a workflow to connect KretivOS records." action={<Button onClick={openCreate}><Plus className="h-4 w-4" />New automation</Button>} />}
        </div>
      </div>}

      {tab === "approvals" && <div className="space-y-4">{approvals.map((approval) => <Card key={approval.id} className="bg-white/80"><CardContent className="p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", statusTone(approval.status))}>{approval.status}</span><span className="text-[10px] text-muted-foreground">{triggerLabel(approval.event.trigger)}</span></div><h3 className="mt-3 text-lg font-semibold">{approval.recipeName}</h3><p className="mt-2 text-sm text-muted-foreground">Entity: {approval.event.entityId}</p><p className="mt-1 text-xs text-muted-foreground">Queued {formatDate(approval.createdAt)}</p></div>{approval.status === "Pending" && <div className="flex gap-2"><Button variant="outline" onClick={() => resolveApproval(approval.id, "Rejected")}><X className="h-4 w-4" />Reject</Button><Button onClick={() => resolveApproval(approval.id, "Approved")}><Check className="h-4 w-4" />Approve & run</Button></div>}</div></CardContent></Card>)}{!approvals.length && <EmptyCard icon={ShieldCheck} title="No approvals" description="Higher-risk automations will appear here before execution." />}</div>}

      {tab === "notifications" && <div className="space-y-4"><div className="flex justify-end"><Button variant="outline" onClick={clearReadNotifications} disabled={!notifications.some((item) => item.read)}>Clear read</Button></div>{notifications.map((notification) => <Card key={notification.id} className={cn("bg-white/80", !notification.read && "border-[#ba5c42]/40")}><CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"><div className="flex gap-3"><div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", notification.type === "Warning" ? "bg-amber-50 text-amber-700" : "bg-[#eee9df] text-[#ba5c42]")}>{notification.type === "Warning" ? <CircleAlert className="h-5 w-5" /> : <Bell className="h-5 w-5" />}</div><div><h3 className="text-sm font-semibold">{notification.title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{notification.description}</p><p className="mt-2 text-[10px] text-muted-foreground">{formatDate(notification.createdAt)}</p></div></div><div className="flex gap-2">{notification.href && <a href={notification.href} className="inline-flex h-10 items-center rounded-lg bg-[#202c25] px-4 text-sm font-medium text-white">Open record</a>}{!notification.read && <Button variant="outline" onClick={() => markNotificationRead(notification.id)}>Mark read</Button>}</div></CardContent></Card>)}{!notifications.length && <EmptyCard icon={Bell} title="No notifications" description="The daily scan will surface records that require attention." />}</div>}

      {tab === "runs" && <Card className="bg-white/80"><CardHeader><CardTitle>Automation audit log</CardTitle><p className="mt-1 text-xs text-muted-foreground">Every automatic, approved, rejected, skipped and failed execution.</p></CardHeader><CardContent className="space-y-2">{runs.map((run) => <RunRow key={run.id} run={run} />)}{!runs.length && <Empty icon={Activity} title="No automation runs" description="Execution history will appear here." />}</CardContent></Card>}

      {editorOpen && <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"><Card className="max-h-[96vh] w-full max-w-3xl overflow-y-auto rounded-b-none bg-[#f7f4ed] shadow-2xl sm:rounded-xl"><CardHeader className="sticky top-0 z-10 flex-row items-start justify-between border-b bg-[#f7f4ed] p-4 sm:p-6"><div><CardTitle className="text-xl">{draft.id ? "Edit automation" : "Create automation"}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Choose a supported trigger and one or more compatible actions.</p></div><Button variant="ghost" size="icon" onClick={() => setEditorOpen(false)}><X className="h-4 w-4" /></Button></CardHeader><CardContent className="p-4 sm:p-6"><div className="grid gap-4 sm:grid-cols-2"><Field label="Automation name" wide><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="input" placeholder="Example: New customer setup" /></Field><Field label="Workspace"><input value={draft.workspace} onChange={(event) => setDraft({ ...draft, workspace: event.target.value })} className="input" /></Field><Field label="Trigger"><select value={draft.trigger} onChange={(event) => changeTrigger(event.target.value as AutomationTrigger)} className="input">{TRIGGER_CATALOG.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><Field label="Status"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AutomationRecipe["status"] })} className="input"><option>Active</option><option>Paused</option></select></Field><Field label="Description" wide><Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Explain the business outcome of this automation." /></Field></div><div className="mt-5"><div className="text-xs font-medium">Actions</div><p className="mt-1 text-[11px] text-muted-foreground">Only actions compatible with {triggerLabel(draft.trigger)} are shown.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{compatibleActions.map((action) => <label key={action.id} className={cn("flex cursor-pointer gap-3 rounded-xl border p-4 transition", draft.actions.includes(action.id) ? "border-[#ba5c42] bg-[#fff8f4]" : "bg-white hover:bg-[#faf7f1]")}><input type="checkbox" checked={draft.actions.includes(action.id)} onChange={() => toggleAction(action.id)} className="mt-0.5 h-4 w-4 accent-[#ba5c42]" /><span><span className="block text-sm font-medium">{action.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{action.description}</span></span></label>)}</div></div><label className="mt-5 flex items-start gap-3 rounded-xl border bg-white p-4"><input type="checkbox" checked={draft.approvalRequired} onChange={(event) => setDraft({ ...draft, approvalRequired: event.target.checked })} className="mt-0.5 h-4 w-4 accent-[#ba5c42]" /><span><span className="block text-sm font-medium">Require human approval</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Use this for actions that create commercial commitments or delivery records.</span></span></label><div className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button onClick={saveRecipe}><Save className="h-4 w-4" />Save automation</Button></div></CardContent></Card></div>}
    </WorkspacePage>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/7 p-4"><div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div><div className="mt-2 text-sm font-semibold text-white">{value}</div></div>;
}

function RunRow({ run }: { run: AutomationRun }) {
  return <div className="flex flex-col justify-between gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", statusTone(run.status))}>{run.status}</span><span className="text-xs font-medium">{run.recipeName}</span></div><div className="mt-2 text-xs text-muted-foreground">{run.summary || triggerLabel(run.trigger)}</div>{run.error && <div className="mt-1 text-xs text-red-600">{run.error}</div>}</div><div className="text-[10px] text-muted-foreground sm:text-right"><div>{formatDate(run.startedAt)}</div><div className="mt-1">{run.actions.length} actions</div></div></div>;
}

function Empty({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return <div className="rounded-xl border border-dashed p-10 text-center"><Icon className="mx-auto h-7 w-7 text-muted-foreground" /><div className="mt-3 text-sm font-semibold">{title}</div><div className="mt-1 text-xs text-muted-foreground">{description}</div></div>;
}

function EmptyCard({ icon, title, description, action }: { icon: any; title: string; description: string; action?: React.ReactNode }) {
  return <Card className="bg-white/80"><CardContent className="p-12"><Empty icon={icon} title={title} description={description} />{action && <div className="mt-4 flex justify-center">{action}</div>}</CardContent></Card>;
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  const control = isValidElement<{ value?: unknown; onChange?: (event: any) => void }>(children) ? children : null;
  const value = typeof control?.props.value === "string" ? control.props.value : "";
  const canImprove = control !== null && isTextField(control.type) && typeof control.props.onChange === "function";
  return <div className={cn("block text-xs font-medium", wide && "sm:col-span-2")}><div className="flex min-h-8 items-center justify-between gap-2"><span>{label}</span>{canImprove && <AIWritingButton value={value} field={label} context="KretivOS server automation. State the trigger, action and intended business outcome plainly." onApply={(next) => control.props.onChange?.({ target: { value: next }, currentTarget: { value: next } })} />}</div><div className="mt-2">{children}</div></div>;
}

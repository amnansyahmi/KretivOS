"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Check, ChevronRight, Clock, List, Pause, Pencil, Play, Plus, Save, Search, Trash2, Workflow, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspacePage } from "@/components/workspace-page";
import { cn } from "@/lib/utils";

type Automation = {
  id: string;
  name: string;
  workspace: string;
  trigger: string;
  actions: string[];
  status: "Active" | "Paused";
  approvalRequired: boolean;
  createdAt: string;
  updatedAt: string;
  lastRun?: string;
  runCount: number;
};

type RunLog = {
  id: string;
  automationId: string;
  automationName: string;
  startedAt: string;
  status: "Success" | "Stopped";
  actions: string[];
};

const STORAGE_KEY = "kretivos-automations";
const LOG_KEY = "kretivos-automation-runs";

const starter: Automation[] = [
  { id: "auto-client-onboarding", name: "Client onboarding", workspace: "Company", trigger: "Onboarding approved", actions: ["Create client workspace", "Generate proposal and agreement", "Create project and milestones", "Create knowledge folder", "Notify Kretivco team"], status: "Active", approvalRequired: true, createdAt: "2026-07-20T08:00:00.000Z", updatedAt: "2026-07-31T08:00:00.000Z", runCount: 2 },
  { id: "auto-chef-settlement", name: "Weekly Chef Ammar settlement", workspace: "Chef Ammar", trigger: "Sunday sales period closed", actions: ["Aggregate Sales Page, Shopee and TikTok", "Generate weekly statement", "Request verification", "Generate invoice", "Create Tuesday reminder"], status: "Active", approvalRequired: true, createdAt: "2026-07-22T08:00:00.000Z", updatedAt: "2026-07-31T08:00:00.000Z", runCount: 3 },
  { id: "auto-campaign-production", name: "Campaign production", workspace: "Marketing", trigger: "Marketing plan approved", actions: ["Create funnel", "Create content calendar", "Generate storyboard", "Create approval queue"], status: "Paused", approvalRequired: false, createdAt: "2026-07-25T08:00:00.000Z", updatedAt: "2026-07-30T08:00:00.000Z", runCount: 1 },
  { id: "auto-payment-received", name: "Payment received", workspace: "Finance", trigger: "Invoice marked paid", actions: ["Issue receipt", "Update cash flow", "Update client workspace", "Notify project owner"], status: "Active", approvalRequired: false, createdAt: "2026-07-27T08:00:00.000Z", updatedAt: "2026-07-31T08:00:00.000Z", runCount: 5 },
];

const emptyDraft: Automation = {
  id: "",
  name: "",
  workspace: "Kretivco",
  trigger: "",
  actions: [""],
  status: "Active",
  approvalRequired: true,
  createdAt: "",
  updatedAt: "",
  runCount: 0,
};

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>(starter);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [selectedId, setSelectedId] = useState(starter[0].id);
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Automation>(emptyDraft);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedLogs = localStorage.getItem(LOG_KEY);
    if (saved) { try { const parsed = JSON.parse(saved) as Automation[]; if (Array.isArray(parsed)) { setAutomations(parsed); setSelectedId(parsed[0]?.id || ""); } } catch {} }
    if (savedLogs) { try { const parsed = JSON.parse(savedLogs) as RunLog[]; if (Array.isArray(parsed)) setLogs(parsed); } catch {} }
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(automations)); }, [automations]);
  useEffect(() => { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); }, [logs]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase();
    return automations.filter((item) => !term || [item.name, item.workspace, item.trigger, item.actions.join(" ")].some((value) => value.toLowerCase().includes(term)));
  }, [automations, query]);
  const selected = automations.find((item) => item.id === selectedId) || filtered[0] || automations[0];
  const selectedLogs = logs.filter((log) => log.automationId === selected?.id).slice(0, 8);

  function openCreate() {
    setDraft({ ...emptyDraft, actions: [""] });
    setEditorOpen(true);
  }

  function openEdit() {
    if (!selected) return;
    setDraft({ ...selected, actions: [...selected.actions] });
    setEditorOpen(true);
  }

  function saveAutomation() {
    const actions = draft.actions.map((action) => action.trim()).filter(Boolean);
    if (!draft.name.trim() || !draft.trigger.trim() || !actions.length) return;
    const now = new Date().toISOString();
    if (draft.id) {
      const updated = { ...draft, name: draft.name.trim(), workspace: draft.workspace.trim() || "General", trigger: draft.trigger.trim(), actions, updatedAt: now };
      setAutomations((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice("Automation updated.");
    } else {
      const created: Automation = { ...draft, id: uid(), name: draft.name.trim(), workspace: draft.workspace.trim() || "General", trigger: draft.trigger.trim(), actions, createdAt: now, updatedAt: now, runCount: 0 };
      setAutomations((current) => [created, ...current]);
      setSelectedId(created.id);
      setShowList(false);
      setNotice("Automation created.");
    }
    setEditorOpen(false);
  }

  function deleteAutomation() {
    if (!selected || !window.confirm(`Delete “${selected.name}”?`)) return;
    const remaining = automations.filter((item) => item.id !== selected.id);
    setAutomations(remaining);
    setLogs((current) => current.filter((log) => log.automationId !== selected.id));
    setSelectedId(remaining[0]?.id || "");
    setShowList(true);
    setNotice("Automation deleted.");
  }

  function toggleStatus() {
    if (!selected) return;
    setAutomations((current) => current.map((item) => item.id === selected.id ? { ...item, status: item.status === "Active" ? "Paused" : "Active", updatedAt: new Date().toISOString() } : item));
  }

  function runAutomation() {
    if (!selected) return;
    if (selected.status === "Paused") {
      setNotice("This automation is paused. Activate it before running.");
      return;
    }
    const now = new Date().toISOString();
    const log: RunLog = { id: uid(), automationId: selected.id, automationName: selected.name, startedAt: now, status: "Success", actions: selected.actions };
    setLogs((current) => [log, ...current]);
    setAutomations((current) => current.map((item) => item.id === selected.id ? { ...item, lastRun: now, runCount: item.runCount + 1, updatedAt: now } : item));
    setNotice(`Automation completed locally: ${selected.actions.length} actions processed.`);
  }

  return (
    <WorkspacePage
      eyebrow="Workflow engine"
      title="Automations"
      description="Create, edit, pause, run and delete internal workflows. Each execution records its action sequence and retains human-approval settings."
      actions={<div className="flex flex-wrap gap-2"><button onClick={() => setShowList((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium xl:hidden"><List className="h-4 w-4" />{showList ? "Hide list" : "Show list"}</button><Button onClick={openCreate}><Plus className="h-4 w-4" />New automation</Button></div>}
    >
      {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}
      <div className="grid gap-5 xl:grid-cols-[370px_minmax(0,1fr)]">
        <Card className={cn("h-fit bg-white/80 xl:sticky xl:top-5 xl:block", !showList && "hidden")}>
          <CardHeader className="border-b p-4 sm:p-5"><div className="flex items-center justify-between"><div><CardTitle>Workflow library</CardTitle><p className="mt-1 text-xs text-muted-foreground">{automations.length} automations</p></div><Workflow className="h-5 w-5 text-[#ba5c42]" /></div><div className="mt-4 flex h-10 items-center gap-2 rounded-lg border bg-white px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 text-sm outline-none" placeholder="Search automations" /></div></CardHeader>
          <CardContent className="max-h-[58vh] space-y-2 overflow-y-auto p-3 xl:max-h-[calc(100vh-250px)]">{filtered.map((item) => <button key={item.id} onClick={() => { setSelectedId(item.id); setShowList(false); }} className={cn("w-full rounded-xl border p-4 text-left", selected?.id === item.id ? "border-[#ba5c42] bg-[#fff8f4]" : "bg-white hover:bg-[#f8f5ee]")}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#ba5c42]">{item.workspace}</div><div className="mt-1 text-sm font-semibold">{item.name}</div></div><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></div><div className="mt-3 flex flex-wrap gap-2"><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", item.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-[#eeeae0] text-[#5a605a]")}>{item.status}</span><span className="text-[10px] text-muted-foreground">{item.actions.length} actions</span></div></button>)}</CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          {selected ? <>
            <Card className="overflow-hidden bg-[#26342b] text-white"><CardContent className="p-5 sm:p-7"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start"><div><div className="text-[10px] uppercase tracking-[.18em] text-white/45">{selected.workspace} · {selected.status}</div><h2 className="mt-3 text-2xl font-semibold sm:text-3xl">{selected.name}</h2><p className="mt-3 text-sm text-white/65">Trigger: {selected.trigger}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={toggleStatus}>{selected.status === "Active" ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Activate</>}</Button><Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={openEdit}><Pencil className="h-3.5 w-3.5" />Edit</Button><Button variant="outline" size="sm" className="border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/20" onClick={deleteAutomation}><Trash2 className="h-3.5 w-3.5" />Delete</Button></div></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Run count" value={String(selected.runCount)} /><Metric label="Last run" value={selected.lastRun ? new Date(selected.lastRun).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never"} /><Metric label="Approval" value={selected.approvalRequired ? "Required" : "Automatic"} /></div><Button className="mt-6 w-full bg-[#ef7f5f] hover:bg-[#e56d4c] sm:w-auto" onClick={runAutomation}><Zap className="h-4 w-4" />Run now</Button></CardContent></Card>

            <Card className="bg-white/80"><CardHeader><CardTitle>Action sequence</CardTitle><p className="mt-1 text-xs text-muted-foreground">Actions run in order. This prototype records local execution; connected systems can replace each action later.</p></CardHeader><CardContent className="space-y-3">{selected.actions.map((action, index) => <div key={`${action}-${index}`} className="flex items-center gap-3 rounded-xl border bg-white p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#202c25] text-xs text-white">{index + 1}</span><span className="min-w-0 flex-1 text-sm font-medium">{action}</span>{index < selected.actions.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}</div>)}</CardContent></Card>

            <Card className="bg-white/80"><CardHeader><div className="flex items-center justify-between"><div><CardTitle>Execution history</CardTitle><p className="mt-1 text-xs text-muted-foreground">Recent local runs for this automation</p></div><Activity className="h-5 w-5 text-[#ba5c42]" /></div></CardHeader><CardContent className="space-y-2">{selectedLogs.map((log) => <div key={log.id} className="flex flex-col justify-between gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2 text-sm font-medium"><Check className="h-4 w-4 text-emerald-600" />{log.status}</div><div className="mt-1 text-xs text-muted-foreground">{new Date(log.startedAt).toLocaleString("en-MY")}</div></div><div className="text-xs text-muted-foreground">{log.actions.length} actions processed</div></div>)}{!selectedLogs.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No runs recorded yet.</div>}</CardContent></Card>
          </> : <Card className="bg-white/80"><CardContent className="p-12 text-center"><Workflow className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-4 font-semibold">No automation yet</div><Button className="mt-4" onClick={openCreate}><Plus className="h-4 w-4" />Create automation</Button></CardContent></Card>}
        </div>
      </div>

      {editorOpen && <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"><Card className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-b-none bg-[#f7f4ed] sm:rounded-xl"><CardHeader className="sticky top-0 z-10 flex-row items-start justify-between border-b bg-[#f7f4ed] p-4 sm:p-6"><div><CardTitle className="text-xl sm:text-2xl">{draft.id ? "Edit automation" : "New automation"}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Define the trigger, approval behaviour and ordered actions.</p></div><Button variant="ghost" size="icon" onClick={() => setEditorOpen(false)}><X className="h-4 w-4" /></Button></CardHeader><CardContent className="p-4 sm:p-6"><div className="grid gap-4 md:grid-cols-2"><Field label="Automation name"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="input" /></Field><Field label="Workspace"><input value={draft.workspace} onChange={(event) => setDraft({ ...draft, workspace: event.target.value })} className="input" /></Field><Field label="Trigger" wide><input value={draft.trigger} onChange={(event) => setDraft({ ...draft, trigger: event.target.value })} className="input" placeholder="e.g. Invoice marked paid" /></Field><Field label="Status"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Automation["status"] })} className="input"><option>Active</option><option>Paused</option></select></Field><label className="flex items-center gap-3 rounded-xl border bg-white p-4 text-sm"><input type="checkbox" checked={draft.approvalRequired} onChange={(event) => setDraft({ ...draft, approvalRequired: event.target.checked })} className="accent-[#ba5c42]" />Require human approval</label></div><div className="mt-5"><div className="text-xs font-semibold">Actions</div><div className="mt-3 space-y-2">{draft.actions.map((action, index) => <div key={index} className="flex gap-2"><span className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg bg-[#202c25] text-xs text-white">{index + 1}</span><input value={action} onChange={(event) => setDraft({ ...draft, actions: draft.actions.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} className="input flex-1" placeholder="Action description" /><Button variant="outline" size="icon" className="shrink-0 text-red-500" onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-4 w-4" /></Button></div>)}</div><button onClick={() => setDraft({ ...draft, actions: [...draft.actions, ""] })} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-xs text-muted-foreground"><Plus className="h-3.5 w-3.5" />Add action</button></div><div className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button onClick={saveAutomation}><Save className="h-4 w-4" />Save automation</Button></div></CardContent></Card></div>}

      <style jsx global>{`.input { height: 2.75rem; width: 100%; border-radius: .65rem; border: 1px solid hsl(var(--border)); background: white; padding: 0 .8rem; font-size: .875rem; outline: none; } .input:focus { box-shadow: 0 0 0 3px rgba(186,92,66,.12); border-color: rgba(186,92,66,.55); }`}</style>
    </WorkspacePage>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-white/5 p-4"><div className="text-[9px] uppercase tracking-wider text-white/40">{label}</div><div className="mt-2 text-sm font-semibold text-white/80">{value}</div></div>; }
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={cn("block text-xs font-medium", wide && "md:col-span-2")}>{label}<div className="mt-2">{children}</div></label>; }

"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Bell, Bot, Building2, CheckCircle2,
  ChevronDown, ChevronRight, Clock3, FileText, History, Loader2, MoreHorizontal,
  Play, RefreshCw, Rocket, ShieldAlert, Sparkles, Star, Users, Workflow, X,
} from "lucide-react";
import OfficeWorld, { OfficeAgentStatus, OfficeWorldAgent } from "./OfficeWorld";

type AgentStatus = OfficeAgentStatus;
type PlanTask = { id: string; agent: string; title: string; instruction: string; dependsOn: string[] };
type OfficePlan = { missionType: string; objective: string; summary: string; tasks: PlanTask[] };
type AgentView = OfficeWorldAgent & { detail: string; output?: string };
type Attention = { missionId?: string | null; taskId: string; agent: string; question: string };
type Workspace = { id: string; name: string; summary?: string; customer_name?: string; brand_name?: string; mission_count?: number; artifact_count?: number };
type MissionItem = { id: string; title: string; objective?: string; status: string; quality_score?: number; created_at: string; workspace_name?: string; artifact_count?: number };
type Artifact = { id: string; mission_id: string; title: string; artifact_type: string; agent_id: string; status: string; destination?: string; destination_id?: string; workspace_name?: string; mission_title?: string };
type Approval = { id: string; artifact_id: string; mission_id: string; title: string; summary?: string; status: string; artifact_type: string; workspace_name?: string };
type AgentMetric = { agent_id: string; runs: number; completed: number; avg_duration_ms?: number; avg_rating?: number; ratings?: number };
type Overview = { stats: { missions?: number; active?: number; completed?: number; avg_quality?: number }; recent: MissionItem[]; artifacts: Artifact[]; approvals: Approval[]; workspaces: Workspace[]; agents: AgentMetric[] };
type OfficeTab = "floor" | "deliverables" | "clients" | "analytics" | "autopilot";

const roster: Omit<AgentView, "status" | "detail">[] = [
  { id: "chief", name: "Chief", emoji: "👩‍💼", department: "Management" },
  { id: "research", name: "Opportunity Scout", emoji: "🔎", department: "Strategy" },
  { id: "business", name: "Prospect Analyst", emoji: "♟️", department: "Strategy" },
  { id: "sales", name: "Sales", emoji: "🤝", department: "Commercial" },
  { id: "proposal", name: "Proposal", emoji: "📄", department: "Commercial" },
  { id: "pricing", name: "Pricing", emoji: "💰", department: "Commercial" },
  { id: "marketing", name: "Marketing", emoji: "📣", department: "Growth" },
  { id: "content", name: "Content", emoji: "✍️", department: "Growth" },
  { id: "product", name: "Product", emoji: "🧭", department: "Product" },
  { id: "ux", name: "UI/UX", emoji: "🎨", department: "Product" },
  { id: "architect", name: "Architect", emoji: "🏗️", department: "Engineering" },
  { id: "frontend", name: "Frontend", emoji: "🖥️", department: "Engineering" },
  { id: "backend", name: "Backend", emoji: "⚙️", department: "Engineering" },
  { id: "security", name: "Security", emoji: "🛡️", department: "Engineering" },
  { id: "qa", name: "QA", emoji: "🧪", department: "Quality" },
];

const templates = [
  { icon: Rocket, label: "Launch", prompt: "Create a complete go-to-market plan for this client: positioning, funnel, pricing, sales, content and execution plan." },
  { icon: BarChart3, label: "Recover sales", prompt: "Sales are under target. Diagnose the causes and build a 30-day recovery plan with funnel, offer, content and sales actions." },
  { icon: Sparkles, label: "Campaign", prompt: "Build a full marketing campaign from research through TOFU/MOFU/BOFU, content calendar, KPIs and next actions." },
  { icon: FileText, label: "Proposal", prompt: "Prepare a client-ready proposal with scope, deliverables, milestones, assumptions, risks and recommended next step." },
];

function freshAgents() {
  return Object.fromEntries(roster.map((agent) => [agent.id, { ...agent, status: "standby" as AgentStatus, detail: "Ready when needed" }]));
}

function statusLabel(status: AgentStatus) {
  return status === "working" ? "Working" : status === "queued" ? "Queued" : status === "completed" ? "Done" : status === "blocked" ? "Attention" : status === "failed" ? "Failed" : "Standby";
}

function statusDot(status: AgentStatus) {
  return status === "working"
    ? "bg-[#d9ff62] shadow-[0_0_12px_rgba(217,255,98,.6)]"
    : status === "completed"
      ? "bg-emerald-400"
      : status === "blocked" || status === "failed"
        ? "bg-amber-400"
        : status === "queued"
          ? "bg-sky-400"
          : "bg-white/20";
}

function niceDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-white/[.08] p-7 text-center text-[10px] leading-5 text-white/28">{children}</div>;
}

export default function OfficeDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [workspaceId, setWorkspaceId] = useState("");
  const [budgetMode, setBudgetMode] = useState<"economy" | "balanced" | "max_quality">("balanced");
  const [mission, setMission] = useState("");
  const [running, setRunning] = useState(false);
  const [plan, setPlan] = useState<OfficePlan | null>(null);
  const [final, setFinal] = useState("");
  const [error, setError] = useState("");
  const [grounded, setGrounded] = useState(false);
  const [sourceCount, setSourceCount] = useState(0);
  const [missionId, setMissionId] = useState<string | null>(null);
  const [attention, setAttention] = useState<Attention | null>(null);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [humanInput, setHumanInput] = useState("");
  const [agents, setAgents] = useState<Record<string, AgentView>>(freshAgents);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<OfficeTab>("floor");
  const [moreOpen, setMoreOpen] = useState(false);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [motion, setMotion] = useState(true);

  const activeAgents = useMemo(() => Object.values(agents).filter((agent) => agent.status !== "standby"), [agents]);
  const workingCount = activeAgents.filter((agent) => agent.status === "working").length;
  const attentionCount = activeAgents.filter((agent) => ["blocked", "failed"].includes(agent.status)).length;
  const pendingApprovals = (overview?.approvals || []).filter((item) => item.status === "pending");
  const selectedAgent = expanded ? agents[expanded] : null;
  const worldAgents = useMemo(() => roster.map((base) => agents[base.id]), [agents]);
  const priorityAgents = useMemo(() => {
    const score = (status: AgentStatus) => status === "working" ? 0 : status === "blocked" || status === "failed" ? 1 : status === "queued" ? 2 : status === "completed" ? 3 : 4;
    return [...worldAgents].sort((a, b) => {
      if (a.id === "chief") return -1;
      if (b.id === "chief") return 1;
      return score(a.status) - score(b.status);
    }).slice(0, 4);
  }, [worldAgents]);

  async function loadOverview() {
    setLoadingOverview(true);
    try {
      const response = await fetch("/api/office/overview", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setOverview(payload);
    } finally {
      setLoadingOverview(false);
    }
  }

  useEffect(() => { void loadOverview(); }, []);

  function resetRun() {
    setPlan(null); setFinal(""); setError(""); setGrounded(false); setSourceCount(0); setMissionId(null);
    setAttention(null); setAttentionOpen(false); setHumanInput(""); setAgents(freshAgents()); setExpanded(null); setEvaluation(null);
  }

  function applyAgentEvent(event: any) {
    const id = String(event.agent || "");
    if (!id || !roster.some((agent) => agent.id === id)) return;
    setAgents((current) => ({ ...current, [id]: { ...current[id], status: event.status as AgentStatus, detail: String(event.detail || current[id]?.detail || ""), output: typeof event.output === "string" ? event.output : current[id]?.output } }));
  }

  async function runMission(text = mission, parentMissionId?: string | null) {
    const value = text.trim();
    if (!value || running) return;
    resetRun(); setMission(value); setRunning(true); setTab("floor"); setMoreOpen(false);
    try {
      const response = await fetch("/api/office/mission", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission: value, grounded: true, workspaceId: workspaceId || undefined, budgetMode, parentMissionId: parentMissionId || undefined }),
      });
      if (!response.ok || !response.body) throw new Error((await response.text()) || "Unable to start mission.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
          if (data) {
            try {
              const event = JSON.parse(data);
              if (event.type === "mission") setMissionId(event.missionId || null);
              else if (event.type === "agent") applyAgentEvent(event);
              else if (event.type === "context") { setGrounded(Boolean(event.grounded)); setSourceCount(Array.isArray(event.sources) ? event.sources.length : 0); }
              else if (event.type === "plan") setPlan(event.plan);
              else if (event.type === "attention") { setAttention({ missionId: event.missionId, taskId: String(event.taskId), agent: String(event.agent), question: String(event.question) }); setAttentionOpen(false); }
              else if (event.type === "done") { setFinal(String(event.final || "")); setEvaluation(event.evaluation || null); if (event.missionId) setMissionId(String(event.missionId)); }
              else if (event.type === "error") setError(String(event.error || "Mission failed."));
            } catch {}
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mission failed.");
    } finally {
      setRunning(false); void loadOverview();
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); void runMission(); }

  function continueWithInput() {
    if (!attention || !humanInput.trim()) return;
    const enriched = `${mission}\n\nHUMAN INPUT FOR ${attention.agent.toUpperCase()} (${attention.taskId}):\n${attention.question}\nAnswer: ${humanInput.trim()}`;
    void runMission(enriched, attention.missionId || missionId);
  }

  async function resolveApproval(id: string, decision: "approve" | "reject") {
    await fetch("/api/office/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, decision, execute: decision === "approve" }) });
    await loadOverview();
  }

  const stats = [
    { label: "Active", value: overview?.stats?.active || (running ? 1 : 0), icon: Building2 },
    { label: "Memory", value: overview?.stats?.missions || 0, icon: History },
    { label: "Attention", value: pendingApprovals.length + attentionCount, icon: Bell },
    { label: "Working", value: workingCount, icon: Users },
  ];

  return (
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#0c100d] text-[#f3f5ee]">
      <header className="sticky top-0 z-40 w-full border-b border-white/[.07] bg-[#0c100d]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[58px] w-full max-w-6xl items-center justify-between px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href="/" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[.035]" aria-label="Back to KretivOS"><ArrowLeft className="h-4 w-4" /></Link>
            <div className="min-w-0"><div className="flex items-center gap-1.5 truncate text-[8px] uppercase tracking-[.15em] text-white/30"><span>Workspace</span><span>/</span><span className="text-white/55">The Office</span></div><div className="mt-0.5 truncate text-[13px] font-semibold">KretivOS <span className="text-[#d9ff62]">AI Office</span></div></div>
          </div>
          <button onClick={() => void loadOverview()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[.035] text-white/45" aria-label="Refresh office"><RefreshCw className={`h-4 w-4 ${loadingOverview ? "animate-spin" : ""}`} /></button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-3 pb-20 pt-4 sm:px-5 md:pt-6">
        {(final || missionId) && !running && <div className="mb-3 flex min-w-0 items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[.055] px-3 py-2 text-[10px] text-emerald-200/70"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Mission saved. Your office remembers the work.</span></div>}

        <section className="grid min-w-0 gap-4 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
          <div className="min-w-0">
            <div className="truncate text-[9px] font-semibold uppercase tracking-[.22em] text-[#d9ff62]">Your ideas. A whole team behind them.</div>
            <h1 className="mt-1.5 text-[28px] font-semibold leading-[1.08] tracking-[-.04em] sm:text-4xl md:text-5xl">Welcome to your office.</h1>
            <p className="mt-2 max-w-xl text-[12px] leading-5 text-white/35 sm:text-sm">Give one instruction. The right specialists move it forward.</p>

            <form onSubmit={submit} className="mt-4 w-full max-w-full overflow-hidden rounded-[20px] border border-white/[.08] bg-[#151a16] shadow-[0_18px_45px_rgba(0,0,0,.24)]">
              <textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={2} placeholder="What should your team move forward?" className="min-h-[78px] w-full max-w-full resize-none bg-transparent px-4 py-3 text-[13px] leading-5 outline-none placeholder:text-white/20 sm:min-h-[92px] sm:text-sm" />
              <div className="border-t border-white/[.06] bg-black/10 p-2.5">
                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                  <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="block w-full min-w-0 max-w-full appearance-none rounded-xl border border-white/10 bg-[#212822] px-3 py-2.5 text-[11px] text-white/65 outline-none"><option value="">General workspace</option>{(overview?.workspaces || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  <select value={budgetMode} onChange={(e) => setBudgetMode(e.target.value as any)} className="block w-full min-w-0 max-w-full appearance-none rounded-xl border border-white/10 bg-[#212822] px-3 py-2.5 text-[11px] text-white/65 outline-none"><option value="economy">Economy</option><option value="balanced">Balanced</option><option value="max_quality">Max quality</option></select>
                </div>
                <button disabled={running || !mission.trim()} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#d9ff62] px-4 py-3 text-[12px] font-semibold text-[#111511] disabled:opacity-40 sm:ml-auto sm:w-auto sm:min-w-[160px]">{running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}{running ? "Office working…" : "Start mission"}</button>
              </div>
            </form>

            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{templates.map(({ icon: Icon, label, prompt }) => <button key={label} type="button" onClick={() => setMission(prompt)} className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full border border-white/[.08] bg-white/[.025] px-3 py-2 text-[9px] text-white/42"><Icon className="h-3 w-3 shrink-0" /><span className="truncate">{label}</span></button>)}</div>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {stats.map(({ label, value, icon: Icon }) => <div key={label} className="min-w-0 rounded-2xl border border-white/[.07] bg-[#141815] px-3 py-3"><div className="flex min-w-0 items-center justify-between gap-2 text-[8px] uppercase tracking-[.12em] text-white/27"><span className="truncate">{label}</span><Icon className="h-3 w-3 shrink-0" /></div><div className="mt-1.5 text-[22px] font-semibold leading-none">{value}</div></div>)}
          </div>
        </section>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => { setTab("floor"); setMoreOpen(false); }} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[10px] transition ${tab === "floor" ? "bg-white text-[#101410]" : "border border-white/[.08] bg-[#141815] text-white/38"}`}><Bot className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Office</span></button>
          <button type="button" onClick={() => { setTab("deliverables"); setMoreOpen(false); }} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[10px] transition ${tab === "deliverables" ? "bg-white text-[#101410]" : "border border-white/[.08] bg-[#141815] text-white/38"}`}><FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Work</span></button>
          <button type="button" onClick={() => setMoreOpen((value) => !value)} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-white/[.08] bg-[#141815] px-2 py-2.5 text-[10px] ${moreOpen || ["clients","analytics","autopilot"].includes(tab) ? "text-white" : "text-white/38"}`}><MoreHorizontal className="h-3.5 w-3.5 shrink-0" /><span className="truncate">More</span></button>
        </div>

        {moreOpen && <div className="mt-2 grid grid-cols-3 gap-2 rounded-2xl border border-white/[.07] bg-[#141815] p-2"><button onClick={() => { setTab("clients"); setMoreOpen(false); }} className="flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[9px] text-white/45 active:bg-white/[.04]"><Building2 className="h-3.5 w-3.5" /><span className="truncate">Clients</span></button><button onClick={() => { setTab("analytics"); setMoreOpen(false); }} className="flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[9px] text-white/45 active:bg-white/[.04]"><BarChart3 className="h-3.5 w-3.5" /><span className="truncate">Performance</span></button><button onClick={() => { setTab("autopilot"); setMoreOpen(false); }} className="flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[9px] text-white/45 active:bg-white/[.04]"><Workflow className="h-3.5 w-3.5" /><span className="truncate">Autopilot</span></button></div>}

        {attention && <section className="mt-3 w-full max-w-full overflow-hidden rounded-2xl border border-amber-300/18 bg-amber-300/[.055]"><button type="button" onClick={() => setAttentionOpen((value) => !value)} className="flex w-full min-w-0 items-center gap-3 p-3 text-left"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-amber-300"><ShieldAlert className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="text-[11px] font-semibold">Needs your attention</div><div className="mt-0.5 truncate text-[9px] text-white/35">{attention.question}</div></div><ChevronDown className={`h-4 w-4 shrink-0 text-white/30 transition ${attentionOpen ? "rotate-180" : ""}`} /></button>{attentionOpen && <div className="border-t border-amber-300/10 p-3 pt-2"><p className="break-words text-[10px] leading-5 text-white/45">{attention.question}</p><textarea value={humanInput} onChange={(e) => setHumanInput(e.target.value)} rows={2} placeholder="Provide the missing fact or decision…" className="mt-2 w-full max-w-full rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] outline-none" /><button type="button" onClick={continueWithInput} disabled={!humanInput.trim() || running} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-300 px-3 py-2 text-[10px] font-semibold text-black disabled:opacity-40">Continue mission <ArrowRight className="h-3 w-3" /></button></div>}</section>}

        {tab === "floor" && <section className="mt-3 w-full max-w-full overflow-hidden rounded-[24px] border border-white/[.08] bg-[#121713] shadow-[0_28px_60px_rgba(0,0,0,.28)]">
          <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><div className="text-[8px] uppercase tracking-[.2em] text-white/25">The office floor</div><div className="mt-0.5 truncate text-[13px] font-semibold">Your team, live</div></div><div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => setMotion((value) => !value)} className="flex items-center gap-1.5 text-[8px] text-white/32"><span>Motion</span><span className={`relative h-4 w-7 rounded-full ${motion ? "bg-[#d9ff62]/30" : "bg-white/10"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition ${motion ? "left-3.5" : "left-0.5"}`} /></span></button>{missionId && <Link href={`/office/missions/${missionId}`} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-[8px] text-white/38">Mission <ChevronRight className="h-3 w-3" /></Link>}</div></div>

          {plan && <div className="mx-3 mb-3 min-w-0 rounded-xl border border-[#d9ff62]/10 bg-[#d9ff62]/[.03] px-3 py-2"><div className="truncate text-[10px] font-semibold text-[#d9ff62]">{plan.objective}</div><div className="mt-0.5 truncate text-[8px] text-white/28">{plan.summary}</div></div>}

          <div className="px-2 pb-2 sm:px-3 sm:pb-3">
            <OfficeWorld agents={worldAgents} motion={motion} onSelectAgent={(agent) => setExpanded(agent.id)} />
          </div>

          <div className="border-t border-white/[.05] p-3">
            <div className="mb-2 flex items-center justify-between"><div className="text-[8px] uppercase tracking-[.15em] text-white/25">Priority team</div><div className="text-[8px] text-white/25">Tap an agent on the map for details</div></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{priorityAgents.map((agent) => <button key={agent.id} type="button" onClick={() => setExpanded(agent.id)} className="min-w-0 rounded-xl border border-white/[.06] bg-white/[.018] p-2.5 text-left"><div className="flex min-w-0 items-center gap-2"><div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/20 text-sm">{agent.emoji}<span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-[#151916] ${statusDot(agent.status)}`} /></div><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-medium">{agent.name}</div><div className="mt-0.5 truncate text-[8px] text-white/26">{statusLabel(agent.status)}</div></div></div></button>)}</div>
            <div className="mt-2 grid grid-cols-3 gap-1.5"><div className="rounded-xl bg-black/20 p-2.5"><div className="text-[16px] font-semibold">{workingCount}</div><div className="text-[7px] text-white/25">working</div></div><div className="rounded-xl bg-black/20 p-2.5"><div className="text-[16px] font-semibold">{activeAgents.filter((a) => a.status === "completed").length}</div><div className="text-[7px] text-white/25">done</div></div><div className="rounded-xl bg-black/20 p-2.5"><div className="text-[16px] font-semibold">{attentionCount}</div><div className="text-[7px] text-white/25">attention</div></div></div>
          </div>
        </section>}

        {selectedAgent && <div className="fixed inset-0 z-[70] flex items-end overflow-hidden bg-black/60 p-2 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-4" onClick={() => setExpanded(null)}><div className="max-h-[78dvh] w-full max-w-xl overflow-hidden rounded-[24px] border border-white/10 bg-[#171c18] shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex min-w-0 items-center justify-between border-b border-white/[.07] p-4"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/25 text-xl">{selectedAgent.emoji}</div><div className="min-w-0"><div className="truncate text-[13px] font-semibold">{selectedAgent.name}</div><div className="truncate text-[8px] uppercase tracking-[.13em] text-white/25">{selectedAgent.department}</div></div></div><button onClick={() => setExpanded(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[.04] text-white/35"><X className="h-4 w-4" /></button></div><div className="max-h-[calc(78dvh-74px)] overflow-y-auto overflow-x-hidden p-4"><div className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1 text-[9px] text-white/42"><span className={`h-1.5 w-1.5 rounded-full ${statusDot(selectedAgent.status)}`} />{statusLabel(selectedAgent.status)}</div><p className="mt-3 break-words text-[11px] leading-5 text-white/45">{selectedAgent.detail}</p>{selectedAgent.output ? <div className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-white/[.06] bg-black/20 p-3 text-[10px] leading-5 text-white/58">{selectedAgent.output}</div> : <div className="mt-3 rounded-xl border border-dashed border-white/[.08] p-6 text-center text-[9px] text-white/25">This agent has no deliverable yet.</div>}</div></div></div>}

        {tab === "deliverables" && <section className="mt-3 grid min-w-0 gap-3 lg:grid-cols-[1.2fr_.8fr]"><div className="min-w-0 overflow-hidden rounded-2xl border border-white/[.07] bg-[#141815] p-4"><div className="flex items-center justify-between"><div><div className="text-[8px] uppercase tracking-[.18em] text-white/25">Artifacts</div><h2 className="mt-1 text-[13px] font-semibold">Agency deliverables</h2></div><span className="rounded-full bg-white/[.04] px-2 py-1 text-[8px] text-white/30">{overview?.artifacts?.length || 0}</span></div><div className="mt-3 grid min-w-0 gap-2">{(overview?.artifacts || []).slice(0,14).map((item) => <Link key={item.id} href={`/office/missions/${item.mission_id}`} className="flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-white/[.07] bg-white/[.018] p-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[.04]"><FileText className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1 overflow-hidden"><div className="truncate text-[10px] font-medium">{item.title}</div><div className="mt-0.5 truncate text-[8px] text-white/25">{item.artifact_type.replaceAll("_"," ")} · {item.agent_id}</div></div><ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/18" /></Link>)}{!overview?.artifacts?.length && <EmptyState>Run a mission. Deliverables will appear here.</EmptyState>}</div></div><div className="min-w-0 overflow-hidden rounded-2xl border border-white/[.07] bg-[#141815] p-4"><div className="flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5 text-amber-300" /><h2 className="text-[13px] font-semibold">Approval queue</h2></div><div className="mt-3 space-y-2">{pendingApprovals.map((item) => <div key={item.id} className="min-w-0 overflow-hidden rounded-xl border border-amber-300/10 bg-amber-300/[.03] p-3"><div className="truncate text-[10px] font-medium">{item.title}</div><div className="mt-1 truncate text-[8px] text-white/25">{item.workspace_name || "General"} · {item.artifact_type.replaceAll("_"," ")}</div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void resolveApproval(item.id,"approve")} className="rounded-lg bg-[#d9ff62] px-3 py-1.5 text-[9px] font-semibold text-black">Approve & execute</button><button onClick={() => void resolveApproval(item.id,"reject")} className="rounded-lg border border-white/10 px-3 py-1.5 text-[9px] text-white/40">Reject</button></div></div>)}{!pendingApprovals.length && <EmptyState>No approvals waiting.</EmptyState>}</div></div></section>}

        {tab === "clients" && <section className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">{(overview?.workspaces || []).map((item) => <Link key={item.id} href={`/office/clients/${item.id}`} className="min-w-0 overflow-hidden rounded-2xl border border-white/[.07] bg-[#141815] p-4"><div className="flex items-start justify-between"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[.04]"><Building2 className="h-4 w-4" /></div><ChevronRight className="h-4 w-4 text-white/20" /></div><div className="mt-3 truncate text-[13px] font-semibold">{item.name}</div><div className="mt-1 line-clamp-2 break-words text-[9px] leading-4 text-white/32">{item.summary || item.brand_name || item.customer_name || "Persistent client memory"}</div><div className="mt-3 flex flex-wrap gap-2 text-[8px] text-white/28"><span className="rounded-full border border-white/[.07] px-2 py-1">{item.mission_count || 0} missions</span><span className="rounded-full border border-white/[.07] px-2 py-1">{item.artifact_count || 0} artifacts</span></div></Link>)}{!overview?.workspaces?.length && <div className="sm:col-span-2 xl:col-span-3"><EmptyState>Client workspaces will appear automatically from KretivOS customers and brands.</EmptyState></div>}</section>}

        {tab === "analytics" && <section className="mt-3 grid min-w-0 gap-3 lg:grid-cols-[.75fr_1.25fr]"><div className="min-w-0 rounded-2xl border border-white/[.07] bg-[#141815] p-4"><div className="text-[8px] uppercase tracking-[.18em] text-white/25">Learning loop</div><div className="mt-1.5 text-4xl font-semibold">{Math.round(Number(overview?.stats?.avg_quality || 0))}<span className="text-lg text-white/20">/100</span></div><div className="mt-1 text-[8px] text-white/28">Average evaluated mission quality</div></div><div className="min-w-0 overflow-hidden rounded-2xl border border-white/[.07] bg-[#141815] p-4"><div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-[#d9ff62]" /><h2 className="text-[13px] font-semibold">Agent performance</h2></div><div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">{(overview?.agents || []).map((metric) => { const base = roster.find((item) => item.id === metric.agent_id); const rate = metric.runs ? Math.round((metric.completed / metric.runs) * 100) : 0; return <div key={metric.agent_id} className="min-w-0 overflow-hidden rounded-xl border border-white/[.07] bg-white/[.018] p-3"><div className="flex min-w-0 items-center justify-between gap-2"><div className="truncate text-[10px] font-medium">{base?.emoji} {base?.name || metric.agent_id}</div><div className="shrink-0 text-[9px] text-[#d9ff62]">{rate}%</div></div><div className="mt-2 h-1 rounded-full bg-white/5"><div className="h-full rounded-full bg-[#d9ff62]/60" style={{width:`${Math.min(100,rate)}%`}} /></div><div className="mt-2 flex justify-between gap-2 text-[8px] text-white/24"><span>{metric.runs} runs</span><span>{metric.avg_duration_ms ? `${Math.round(metric.avg_duration_ms / 1000)}s` : "—"}</span><span>{metric.avg_rating ? `${Number(metric.avg_rating).toFixed(1)}★` : "—"}</span></div></div>; })}{!overview?.agents?.length && <div className="sm:col-span-2"><EmptyState>Performance data appears after agent runs.</EmptyState></div>}</div></div></section>}

        {tab === "autopilot" && <AutopilotPanel workspaces={overview?.workspaces || []} onCreated={loadOverview} />}
        {error && <div className="mt-3 max-w-full break-words rounded-xl border border-red-400/20 bg-red-400/[.05] p-3 text-[10px] text-red-200">{error}</div>}
        {final && tab === "floor" && <section className="mt-3 min-w-0 overflow-hidden rounded-2xl border border-white/[.07] bg-[#141815] p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-[8px] uppercase tracking-[.18em] text-white/25">Chief deliverable</div><h2 className="mt-1 truncate text-[13px] font-semibold">Mission complete</h2></div>{evaluation?.score && <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#d9ff62]/12 bg-[#d9ff62]/[.03] px-2 py-1 text-[9px] text-[#d9ff62]"><Star className="h-3 w-3 fill-current" /> {evaluation.score}/100</div>}</div><div className="mt-3 line-clamp-5 whitespace-pre-wrap break-words text-[10px] leading-5 text-white/42">{final}</div>{missionId && <Link href={`/office/missions/${missionId}`} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[9px] text-white/42">Open full mission <ArrowRight className="h-3 w-3" /></Link>}</section>}
      </div>
    </main>
  );
}

function AutopilotPanel({ workspaces, onCreated }: { workspaces: Workspace[]; onCreated: () => Promise<void> }) {
  const [watchers, setWatchers] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [cadence, setCadence] = useState("weekly");
  const [saving, setSaving] = useState(false);
  async function load() { try { const response = await fetch("/api/office/watchers", { cache: "no-store" }); const payload = await response.json(); if (response.ok) setWatchers(Array.isArray(payload.watchers) ? payload.watchers : []); } catch {} }
  useEffect(() => { void load(); }, []);
  async function create(event: FormEvent) { event.preventDefault(); if (!name.trim() || !prompt.trim()) return; setSaving(true); try { await fetch("/api/office/watchers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, missionPrompt: prompt, workspaceId: workspaceId || undefined, cadence }) }); setName(""); setPrompt(""); await load(); await onCreated(); } finally { setSaving(false); } }
  return <section className="mt-3 grid min-w-0 gap-3 lg:grid-cols-[.9fr_1.1fr]"><form onSubmit={create} className="min-w-0 overflow-hidden rounded-2xl border border-white/[.07] bg-[#141815] p-4"><div className="flex items-center gap-2"><Workflow className="h-3.5 w-3.5 text-[#d9ff62]" /><h2 className="text-[13px] font-semibold">Create an autopilot</h2></div><p className="mt-1.5 text-[9px] leading-4 text-white/28">Schedule recurring AI Office missions from the persisted queue.</p><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly growth review" className="mt-3 w-full max-w-full rounded-xl border border-white/10 bg-black/20 p-3 text-[10px] outline-none" /><select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="mt-2 block w-full min-w-0 max-w-full appearance-none rounded-xl border border-white/10 bg-[#222823] p-3 text-[10px] outline-none"><option value="">General workspace</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="What should the team review or produce each time?" className="mt-2 w-full max-w-full rounded-xl border border-white/10 bg-black/20 p-3 text-[10px] leading-5 outline-none" /><div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><select value={cadence} onChange={(e) => setCadence(e.target.value)} className="block w-full min-w-0 appearance-none rounded-xl border border-white/10 bg-[#222823] p-3 text-[10px]"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select><button disabled={saving || !name.trim() || !prompt.trim()} className="rounded-xl bg-[#d9ff62] px-4 text-[10px] font-semibold text-black disabled:opacity-40">{saving ? "Saving…" : "Create"}</button></div></form><div className="min-w-0 overflow-hidden rounded-2xl border border-white/[.07] bg-[#141815] p-4"><div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold">Active autopilots</h2><Clock3 className="h-3.5 w-3.5 text-white/25" /></div><div className="mt-3 space-y-2">{watchers.map((item) => <div key={item.id} className="min-w-0 overflow-hidden rounded-xl border border-white/[.07] bg-white/[.018] p-3"><div className="flex min-w-0 items-center justify-between gap-2"><div className="truncate text-[10px] font-medium">{item.name}</div><span className="shrink-0 rounded-full bg-[#d9ff62]/10 px-2 py-1 text-[8px] text-[#d9ff62]">{item.cadence}</span></div><div className="mt-1 truncate text-[8px] text-white/24">{item.workspace_name || "General"}</div><div className="mt-2 line-clamp-2 break-words text-[9px] leading-4 text-white/34">{item.mission_prompt}</div><div className="mt-2 text-[8px] text-white/22">Next run: {niceDate(item.next_run_at) || "scheduled"}</div></div>)}{!watchers.length && <EmptyState>No autopilots yet.</EmptyState>}</div></div></section>;
}

"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Bell, Bot, Building2, CheckCircle2,
  ChevronDown, ChevronRight, Clock3, FileText, History, Loader2, MoreHorizontal,
  Play, RefreshCw, Rocket, ShieldAlert, Sparkles, Star, Target, Users, Workflow,
  X, Zap,
} from "lucide-react";

type AgentStatus = "standby" | "queued" | "working" | "completed" | "blocked" | "failed";
type PlanTask = { id: string; agent: string; title: string; instruction: string; dependsOn: string[] };
type OfficePlan = { missionType: string; objective: string; summary: string; tasks: PlanTask[] };
type AgentView = { id: string; name: string; emoji: string; department: string; status: AgentStatus; detail: string; output?: string };
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
  { icon: Zap, label: "Build product", prompt: "Define a software product from problem statement to PRD, UX flow, architecture, security and implementation plan." },
  { icon: Target, label: "Pricing", prompt: "Review the current offer and pricing. Recommend bundles, tests, margin-safe options and a clear pricing strategy without inventing missing costs." },
];

function freshAgents() {
  return Object.fromEntries(roster.map((agent) => [agent.id, { ...agent, status: "standby" as AgentStatus, detail: "Ready when needed" }]));
}

function statusLabel(status: AgentStatus) {
  return status === "working" ? "Working" : status === "queued" ? "Queued" : status === "completed" ? "Done" : status === "blocked" ? "Attention" : status === "failed" ? "Failed" : "Standby";
}

function statusDot(status: AgentStatus) {
  return status === "working"
    ? "bg-[#d9ff62] shadow-[0_0_12px_rgba(217,255,98,.75)]"
    : status === "completed"
      ? "bg-emerald-400"
      : status === "blocked" || status === "failed"
        ? "bg-amber-400"
        : status === "queued"
          ? "bg-sky-400"
          : "bg-[#69736b]";
}

function statusPriority(status: AgentStatus) {
  if (status === "working") return 0;
  if (status === "blocked" || status === "failed") return 1;
  if (status === "queued") return 2;
  if (status === "completed") return 3;
  return 4;
}

function niceDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

function OfficeStation({ agent, selected, motion, onSelect }: { agent: AgentView; selected: boolean; motion: boolean; onSelect: () => void }) {
  const working = agent.status === "working";
  return (
    <button type="button" onClick={onSelect} className="group relative min-w-0 px-1 pb-2 pt-1 text-center">
      <div className={`relative mx-auto h-[116px] max-w-[150px] rounded-[22px] transition ${selected ? "bg-white/[.055]" : ""}`}>
        <div className="absolute inset-x-2 bottom-3 h-[55px] rounded-[20px] border border-white/[.045] bg-[#182019] shadow-[0_20px_30px_rgba(0,0,0,.32)]" style={{ transform: "perspective(180px) rotateX(58deg)", transformOrigin: "bottom" }} />
        <div className="absolute bottom-[30px] left-1/2 h-[30px] w-[92px] -translate-x-1/2 rounded-[9px] border border-white/10 bg-gradient-to-b from-[#424a43] to-[#303730] shadow-[0_12px_18px_rgba(0,0,0,.32)]" style={{ transform: "perspective(160px) rotateX(58deg)", transformOrigin: "bottom" }} />
        <div className="absolute bottom-[20px] left-[calc(50%-37px)] h-[25px] w-[5px] rounded-full bg-[#2c322d]" />
        <div className="absolute bottom-[20px] right-[calc(50%-37px)] h-[25px] w-[5px] rounded-full bg-[#2c322d]" />
        <div className={`absolute bottom-[50px] left-1/2 h-[31px] w-[48px] -translate-x-1/2 rounded-[6px] border bg-[#101411] shadow-[0_8px_20px_rgba(0,0,0,.45)] ${working ? "border-[#d9ff62]/45" : "border-white/10"}`}>
          <div className={`mx-auto mt-[7px] h-[14px] w-[32px] rounded-[3px] ${working ? "bg-[#d9ff62]/25 shadow-[0_0_12px_rgba(217,255,98,.18)]" : "bg-white/[.045]"}`} />
        </div>
        <div className="absolute bottom-[44px] left-1/2 h-[9px] w-[4px] -translate-x-1/2 bg-[#3d443e]" />
        <div className="absolute bottom-[37px] left-1/2 h-[4px] w-[19px] -translate-x-1/2 rounded-full bg-[#3d443e]" />
        <div className="absolute bottom-[8px] left-1/2 h-[30px] w-[34px] -translate-x-1/2 rounded-t-[15px] border border-white/10 bg-[#232a24] shadow-[0_10px_12px_rgba(0,0,0,.25)]" />
        <div className={`absolute left-1/2 top-[5px] flex h-[42px] w-[42px] -translate-x-1/2 items-center justify-center rounded-[13px] border border-white/10 bg-[#151a16] text-[21px] shadow-[0_10px_24px_rgba(0,0,0,.38)] ${working && motion ? "animate-pulse" : ""}`}>{agent.emoji}</div>
        <span className={`absolute right-[12%] top-[11px] h-2.5 w-2.5 rounded-full ring-4 ring-[#121612] ${statusDot(agent.status)}`} />
      </div>
      <div className="truncate text-[11px] font-semibold leading-4 text-white/90">{agent.name}</div>
      <div className="mt-0.5 truncate text-[8px] uppercase tracking-[.13em] text-white/28">{agent.department}</div>
      <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[8px] text-white/42">
        <span className={`h-1.5 w-1.5 rounded-full ${statusDot(agent.status)}`} /> {statusLabel(agent.status)}
      </div>
    </button>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs leading-5 text-white/30">{children}</div>;
}

export default function OfficePage() {
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
  const [showFullOffice, setShowFullOffice] = useState(false);

  const activeAgents = useMemo(() => Object.values(agents).filter((agent) => agent.status !== "standby"), [agents]);
  const workingCount = activeAgents.filter((agent) => agent.status === "working").length;
  const attentionCount = activeAgents.filter((agent) => ["blocked", "failed"].includes(agent.status)).length;
  const pendingApprovals = (overview?.approvals || []).filter((item) => item.status === "pending");
  const selectedAgent = expanded ? agents[expanded] : null;
  const priorityRoster = useMemo(() => {
    const sorted = [...roster].sort((a, b) => {
      if (a.id === "chief") return -1;
      if (b.id === "chief") return 1;
      return statusPriority(agents[a.id]?.status || "standby") - statusPriority(agents[b.id]?.status || "standby");
    });
    if (showFullOffice) return sorted;
    const important = sorted.filter((item) => item.id === "chief" || agents[item.id]?.status !== "standby");
    const fill = sorted.filter((item) => !important.some((picked) => picked.id === item.id));
    return [...important, ...fill].slice(0, 6);
  }, [agents, showFullOffice]);

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
    <main className="min-h-screen bg-[#0d100e] text-[#f3f5ee]">
      <header className="sticky top-0 z-40 border-b border-white/[.07] bg-[#0d100e]/96 backdrop-blur-xl">
        <div className="mx-auto flex h-[62px] max-w-[1380px] items-center justify-between px-3 sm:px-5 md:px-7">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href="/" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[.035]" aria-label="Back to KretivOS"><ArrowLeft className="h-4 w-4" /></Link>
            <div className="min-w-0"><div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[.16em] text-white/30"><span>Workspace</span><span>/</span><span className="text-white/55">The Office</span></div><div className="mt-0.5 truncate text-[13px] font-semibold">KretivOS <span className="text-[#d9ff62]">AI Office</span></div></div>
          </div>
          <button onClick={() => void loadOverview()} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[.035] text-white/45" aria-label="Refresh office"><RefreshCw className={`h-4 w-4 ${loadingOverview ? "animate-spin" : ""}`} /></button>
        </div>
      </header>

      <div className="mx-auto max-w-[1380px] px-3 pb-24 pt-4 sm:px-5 md:px-7 md:pt-6">
        {(final || missionId) && !running && <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[.055] px-3 py-2 text-[10px] text-emerald-200/70"><CheckCircle2 className="h-3.5 w-3.5" /> Mission saved. Your office remembers the work.</div>}

        <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.25em] text-[#d9ff62]">Your ideas. A whole team behind them.</div>
            <h1 className="mt-1.5 text-[31px] font-semibold leading-[1.05] tracking-[-.04em] sm:text-4xl md:text-5xl">Welcome to your office.</h1>
            <p className="mt-2 max-w-xl text-[12px] leading-5 text-white/35 sm:text-sm">One instruction. The right specialists research, decide, build and review it.</p>

            <form onSubmit={submit} className="mt-4 overflow-hidden rounded-[20px] border border-white/10 bg-[#161a17] shadow-[0_18px_45px_rgba(0,0,0,.24)]">
              <textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={2} placeholder="What should your team move forward?" className="min-h-[82px] w-full resize-none bg-transparent px-4 py-3 text-[13px] leading-5 outline-none placeholder:text-white/20 sm:min-h-[92px] sm:text-sm" />
              <div className="border-t border-white/[.07] bg-black/10 p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="min-w-0 rounded-xl border border-white/10 bg-[#222823] px-2.5 py-2.5 text-[10px] text-white/65 outline-none"><option value="">General workspace</option>{(overview?.workspaces || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  <select value={budgetMode} onChange={(e) => setBudgetMode(e.target.value as any)} className="rounded-xl border border-white/10 bg-[#222823] px-2.5 py-2.5 text-[10px] text-white/65 outline-none"><option value="economy">Economy</option><option value="balanced">Balanced</option><option value="max_quality">Max quality</option></select>
                </div>
                <button disabled={running || !mission.trim()} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#d9ff62] px-4 py-3 text-[12px] font-semibold text-[#111511] disabled:opacity-40 sm:ml-auto sm:w-auto sm:min-w-[160px]">{running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}{running ? "Office working…" : "Start mission"}</button>
              </div>
            </form>
            <div className="-mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">{templates.map(({ icon: Icon, label, prompt }) => <button key={label} type="button" onClick={() => setMission(prompt)} className="inline-flex min-w-max items-center gap-1.5 rounded-full border border-white/8 bg-white/[.025] px-3 py-1.5 text-[9px] text-white/42"><Icon className="h-3 w-3" />{label}</button>)}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {stats.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-white/[.07] bg-[#151916] px-3 py-3"><div className="flex items-center justify-between text-[8px] uppercase tracking-[.12em] text-white/27"><span>{label}</span><Icon className="h-3 w-3" /></div><div className="mt-1.5 text-[22px] font-semibold leading-none">{value}</div></div>)}
          </div>
        </section>

        <div className="relative mt-4 flex items-center gap-2">
          <button type="button" onClick={() => { setTab("floor"); setMoreOpen(false); }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[10px] transition ${tab === "floor" ? "bg-white text-[#101410]" : "border border-white/8 bg-[#151916] text-white/38"}`}><Bot className="h-3.5 w-3.5" /> Office</button>
          <button type="button" onClick={() => { setTab("deliverables"); setMoreOpen(false); }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[10px] transition ${tab === "deliverables" ? "bg-white text-[#101410]" : "border border-white/8 bg-[#151916] text-white/38"}`}><FileText className="h-3.5 w-3.5" /> Work</button>
          <button type="button" onClick={() => setMoreOpen((value) => !value)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-[#151916] px-3 py-2.5 text-[10px] ${moreOpen || ["clients","analytics","autopilot"].includes(tab) ? "text-white" : "text-white/38"}`}><MoreHorizontal className="h-3.5 w-3.5" /> More</button>
          {moreOpen && <div className="absolute right-0 top-[46px] z-30 w-[220px] rounded-2xl border border-white/10 bg-[#181d19] p-1.5 shadow-2xl"><button onClick={() => { setTab("clients"); setMoreOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[10px] text-white/55 hover:bg-white/[.05]"><Building2 className="h-3.5 w-3.5" /> Client memory</button><button onClick={() => { setTab("analytics"); setMoreOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[10px] text-white/55 hover:bg-white/[.05]"><BarChart3 className="h-3.5 w-3.5" /> Performance</button><button onClick={() => { setTab("autopilot"); setMoreOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[10px] text-white/55 hover:bg-white/[.05]"><Workflow className="h-3.5 w-3.5" /> Autopilot</button></div>}
        </div>

        {attention && <section className="mt-3 overflow-hidden rounded-2xl border border-amber-300/18 bg-amber-300/[.055]"><button type="button" onClick={() => setAttentionOpen((value) => !value)} className="flex w-full items-center gap-3 p-3 text-left"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-amber-300"><ShieldAlert className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="text-[11px] font-semibold">Needs your attention</div><div className="mt-0.5 truncate text-[9px] text-white/35">{attention.question}</div></div><ChevronDown className={`h-4 w-4 text-white/30 transition ${attentionOpen ? "rotate-180" : ""}`} /></button>{attentionOpen && <div className="border-t border-amber-300/10 p-3 pt-2"><p className="text-[10px] leading-5 text-white/45">{attention.question}</p><textarea value={humanInput} onChange={(e) => setHumanInput(e.target.value)} rows={2} placeholder="Provide the missing fact or decision…" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] outline-none" /><button type="button" onClick={continueWithInput} disabled={!humanInput.trim() || running} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-300 px-3 py-2 text-[10px] font-semibold text-black disabled:opacity-40">Continue mission <ArrowRight className="h-3 w-3" /></button></div>}</section>}

        {tab === "floor" && <section className="mt-3 overflow-hidden rounded-[24px] border border-white/[.08] bg-[#141815] shadow-[0_28px_60px_rgba(0,0,0,.30)]">
          <div className="flex items-center justify-between px-4 py-3"><div><div className="text-[8px] uppercase tracking-[.2em] text-white/25">The office floor</div><div className="mt-0.5 text-[13px] font-semibold">Your team, live</div></div><div className="flex items-center gap-3"><button type="button" onClick={() => setMotion((value) => !value)} className="flex items-center gap-1.5 text-[8px] text-white/32"><span>Motion</span><span className={`relative h-4 w-7 rounded-full ${motion ? "bg-[#d9ff62]/30" : "bg-white/10"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition ${motion ? "left-3.5" : "left-0.5"}`} /></span></button>{missionId && <Link href={`/office/missions/${missionId}`} className="hidden items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-[8px] text-white/38 sm:inline-flex">Mission <ChevronRight className="h-3 w-3" /></Link>}</div></div>

          {plan && <div className="mx-3 mb-2 rounded-xl border border-[#d9ff62]/10 bg-[#d9ff62]/[.03] px-3 py-2"><div className="line-clamp-1 text-[10px] font-semibold text-[#d9ff62]">{plan.objective}</div><div className="mt-0.5 line-clamp-1 text-[8px] text-white/28">{plan.summary}</div></div>}

          <div className="relative overflow-hidden border-y border-white/[.045] bg-[#101410] px-2 pb-3 pt-4 sm:px-4" style={{ backgroundImage: "linear-gradient(30deg,rgba(255,255,255,.016) 12%,transparent 12.5%,transparent 87%,rgba(255,255,255,.016) 87.5%,rgba(255,255,255,.016)),linear-gradient(150deg,rgba(255,255,255,.016) 12%,transparent 12.5%,transparent 87%,rgba(255,255,255,.016) 87.5%,rgba(255,255,255,.016)),linear-gradient(30deg,rgba(255,255,255,.016) 12%,transparent 12.5%,transparent 87%,rgba(255,255,255,.016) 87.5%,rgba(255,255,255,.016)),linear-gradient(150deg,rgba(255,255,255,.016) 12%,transparent 12.5%,transparent 87%,rgba(255,255,255,.016) 87.5%,rgba(255,255,255,.016))", backgroundSize: "36px 62px", backgroundPosition: "0 0,0 0,18px 31px,18px 31px" }}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[9px] border-b border-white/[.04] bg-[#252b26] shadow-[0_8px_18px_rgba(0,0,0,.25)]" />
            <div className="pointer-events-none absolute left-3 top-6 h-8 w-5 rounded-t-full border border-emerald-400/10 bg-emerald-400/[.04]"><div className="mx-auto mt-1 h-4 w-3 rounded-full bg-emerald-400/15" /></div>
            <div className="pointer-events-none absolute right-3 top-6 h-8 w-5 rounded-t-full border border-emerald-400/10 bg-emerald-400/[.04]"><div className="mx-auto mt-1 h-4 w-3 rounded-full bg-emerald-400/15" /></div>
            <div className={`grid grid-cols-2 gap-x-1 gap-y-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 ${showFullOffice ? "" : ""}`}>{priorityRoster.map((base) => { const agent = agents[base.id]; return <OfficeStation key={agent.id} agent={agent} selected={expanded === agent.id} motion={motion} onSelect={() => setExpanded(expanded === agent.id ? null : agent.id)} />; })}</div>
            <div className="mt-1 flex items-center justify-center"><button type="button" onClick={() => setShowFullOffice((value) => !value)} className="rounded-full border border-white/[.07] bg-black/20 px-3 py-1.5 text-[8px] text-white/34">{showFullOffice ? "Show active team" : `View full office · ${roster.length} desks`}</button></div>
          </div>

          <div className="grid gap-2 p-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[.07] bg-white/[.018] p-3"><div className="flex items-center justify-between"><div className="text-[8px] uppercase tracking-[.15em] text-white/25">Chief</div><div className="inline-flex items-center gap-1 text-[8px] text-white/30"><span className={`h-1.5 w-1.5 rounded-full ${statusDot(agents.chief.status)}`} />{statusLabel(agents.chief.status)}</div></div><div className="mt-1.5 text-[11px] font-medium leading-5 text-white/72">{agents.chief.detail}</div><div className="mt-2 flex flex-wrap gap-1.5 text-[8px] text-white/28"><span className="rounded-full border border-white/[.07] px-2 py-1">{grounded ? `${sourceCount} sources` : "Grounding ready"}</span><span className="rounded-full border border-white/[.07] px-2 py-1">{budgetMode.replace("_", " ")}</span>{evaluation?.score && <span className="rounded-full border border-[#d9ff62]/12 px-2 py-1 text-[#d9ff62]">Quality {evaluation.score}/100</span>}</div></div>
            <div className="rounded-xl border border-white/[.07] bg-white/[.018] p-3"><div className="text-[8px] uppercase tracking-[.15em] text-white/25">Live activity</div><div className="mt-2 grid grid-cols-3 gap-1.5"><div className="rounded-lg bg-black/20 p-2"><div className="text-[15px] font-semibold">{workingCount}</div><div className="text-[7px] text-white/25">working</div></div><div className="rounded-lg bg-black/20 p-2"><div className="text-[15px] font-semibold">{activeAgents.filter((a) => a.status === "completed").length}</div><div className="text-[7px] text-white/25">done</div></div><div className="rounded-lg bg-black/20 p-2"><div className="text-[15px] font-semibold">{attentionCount}</div><div className="text-[7px] text-white/25">attention</div></div></div></div>
          </div>
        </section>}

        {selectedAgent && <div className="fixed inset-0 z-[70] flex items-end bg-black/55 p-2 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-4" onClick={() => setExpanded(null)}><div className="max-h-[72vh] w-full max-w-xl overflow-hidden rounded-[24px] border border-white/10 bg-[#171c18] shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between border-b border-white/[.07] p-4"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/25 text-xl">{selectedAgent.emoji}</div><div className="min-w-0"><div className="truncate text-[13px] font-semibold">{selectedAgent.name}</div><div className="text-[8px] uppercase tracking-[.13em] text-white/25">{selectedAgent.department}</div></div></div><button onClick={() => setExpanded(null)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[.04] text-white/35"><X className="h-4 w-4" /></button></div><div className="max-h-[calc(72vh-74px)] overflow-auto p-4"><div className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1 text-[9px] text-white/42"><span className={`h-1.5 w-1.5 rounded-full ${statusDot(selectedAgent.status)}`} />{statusLabel(selectedAgent.status)}</div><p className="mt-3 text-[11px] leading-5 text-white/45">{selectedAgent.detail}</p>{selectedAgent.output ? <div className="mt-3 whitespace-pre-wrap rounded-xl border border-white/[.06] bg-black/20 p-3 text-[10px] leading-5 text-white/58">{selectedAgent.output}</div> : <div className="mt-3 rounded-xl border border-dashed border-white/[.08] p-6 text-center text-[9px] text-white/25">This desk has no deliverable yet.</div>}</div></div></div>}

        {tab === "deliverables" && <section className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_.8fr]"><div className="rounded-2xl border border-white/[.07] bg-[#151916] p-4"><div className="flex items-center justify-between"><div><div className="text-[8px] uppercase tracking-[.18em] text-white/25">Artifacts</div><h2 className="mt-1 text-[13px] font-semibold">Agency deliverables</h2></div><span className="rounded-full bg-white/[.04] px-2 py-1 text-[8px] text-white/30">{overview?.artifacts?.length || 0}</span></div><div className="mt-3 grid gap-2">{(overview?.artifacts || []).slice(0,14).map((item) => <Link key={item.id} href={`/office/missions/${item.mission_id}`} className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.018] p-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[.04]"><FileText className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-medium">{item.title}</div><div className="mt-0.5 text-[8px] text-white/25">{item.artifact_type.replaceAll("_"," ")} · {item.agent_id}</div></div><span className={`rounded-full px-2 py-1 text-[8px] ${item.status === "executed" ? "bg-emerald-400/10 text-emerald-300" : item.status === "pending_approval" ? "bg-amber-300/10 text-amber-200" : "bg-white/[.04] text-white/35"}`}>{item.status.replaceAll("_"," ")}</span></Link>)}{!overview?.artifacts?.length && <EmptyState>Run a mission. Deliverables will appear here.</EmptyState>}</div></div><div className="rounded-2xl border border-white/[.07] bg-[#151916] p-4"><div className="flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5 text-amber-300" /><h2 className="text-[13px] font-semibold">Approval queue</h2></div><div className="mt-3 space-y-2">{pendingApprovals.map((item) => <div key={item.id} className="rounded-xl border border-amber-300/10 bg-amber-300/[.03] p-3"><div className="text-[10px] font-medium">{item.title}</div><div className="mt-1 text-[8px] text-white/25">{item.workspace_name || "General"} · {item.artifact_type.replaceAll("_"," ")}</div><div className="mt-3 flex gap-2"><button onClick={() => void resolveApproval(item.id,"approve")} className="rounded-lg bg-[#d9ff62] px-3 py-1.5 text-[9px] font-semibold text-black">Approve & execute</button><button onClick={() => void resolveApproval(item.id,"reject")} className="rounded-lg border border-white/10 px-3 py-1.5 text-[9px] text-white/40">Reject</button></div></div>)}{!pendingApprovals.length && <EmptyState>No approvals waiting.</EmptyState>}</div></div></section>}

        {tab === "clients" && <section className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{(overview?.workspaces || []).map((item) => <Link key={item.id} href={`/office/clients/${item.id}`} className="rounded-2xl border border-white/[.07] bg-[#151916] p-4"><div className="flex items-start justify-between"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[.04]"><Building2 className="h-4 w-4" /></div><ChevronRight className="h-4 w-4 text-white/20" /></div><div className="mt-3 text-[13px] font-semibold">{item.name}</div><div className="mt-1 line-clamp-2 text-[9px] leading-4 text-white/32">{item.summary || item.brand_name || item.customer_name || "Persistent client memory"}</div><div className="mt-3 flex gap-2 text-[8px] text-white/28"><span className="rounded-full border border-white/[.07] px-2 py-1">{item.mission_count || 0} missions</span><span className="rounded-full border border-white/[.07] px-2 py-1">{item.artifact_count || 0} artifacts</span></div></Link>)}{!overview?.workspaces?.length && <div className="sm:col-span-2 xl:col-span-3"><EmptyState>Client workspaces will appear automatically from KretivOS customers and brands.</EmptyState></div>}</section>}

        {tab === "analytics" && <section className="mt-3 grid gap-3 lg:grid-cols-[.75fr_1.25fr]"><div className="rounded-2xl border border-white/[.07] bg-[#151916] p-4"><div className="text-[8px] uppercase tracking-[.18em] text-white/25">Learning loop</div><div className="mt-1.5 text-4xl font-semibold">{Math.round(Number(overview?.stats?.avg_quality || 0))}<span className="text-lg text-white/20">/100</span></div><div className="mt-1 text-[8px] text-white/28">Average evaluated mission quality</div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl bg-white/[.018] p-3"><div className="text-lg font-semibold">{overview?.stats?.completed || 0}</div><div className="text-[8px] text-white/25">Completed</div></div><div className="rounded-xl bg-white/[.018] p-3"><div className="text-lg font-semibold">{overview?.agents?.length || 0}</div><div className="text-[8px] text-white/25">Measured agents</div></div></div></div><div className="rounded-2xl border border-white/[.07] bg-[#151916] p-4"><div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-[#d9ff62]" /><h2 className="text-[13px] font-semibold">Agent performance</h2></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{(overview?.agents || []).map((metric) => { const base = roster.find((item) => item.id === metric.agent_id); const rate = metric.runs ? Math.round((metric.completed / metric.runs) * 100) : 0; return <div key={metric.agent_id} className="rounded-xl border border-white/[.07] bg-white/[.018] p-3"><div className="flex items-center justify-between"><div className="text-[10px] font-medium">{base?.emoji} {base?.name || metric.agent_id}</div><div className="text-[9px] text-[#d9ff62]">{rate}%</div></div><div className="mt-2 h-1 rounded-full bg-white/5"><div className="h-full rounded-full bg-[#d9ff62]/60" style={{width:`${Math.min(100,rate)}%`}} /></div><div className="mt-2 flex justify-between text-[8px] text-white/24"><span>{metric.runs} runs</span><span>{metric.avg_duration_ms ? `${Math.round(metric.avg_duration_ms / 1000)}s avg` : "—"}</span><span>{metric.avg_rating ? `${Number(metric.avg_rating).toFixed(1)}★` : "No rating"}</span></div></div>; })}{!overview?.agents?.length && <div className="sm:col-span-2"><EmptyState>Performance data appears after agent runs.</EmptyState></div>}</div></div></section>}

        {tab === "autopilot" && <AutopilotPanel workspaces={overview?.workspaces || []} onCreated={loadOverview} />}
        {error && <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/[.05] p-3 text-[10px] text-red-200">{error}</div>}
        {final && tab === "floor" && <section className="mt-3 rounded-2xl border border-white/[.07] bg-[#151916] p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-[8px] uppercase tracking-[.18em] text-white/25">Chief deliverable</div><h2 className="mt-1 text-[13px] font-semibold">Mission complete</h2></div>{evaluation?.score && <div className="inline-flex items-center gap-1 rounded-full border border-[#d9ff62]/12 bg-[#d9ff62]/[.03] px-2 py-1 text-[9px] text-[#d9ff62]"><Star className="h-3 w-3 fill-current" /> {evaluation.score}/100</div>}</div><div className="mt-3 line-clamp-6 whitespace-pre-wrap text-[10px] leading-5 text-white/42">{final}</div>{missionId && <Link href={`/office/missions/${missionId}`} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[9px] text-white/42">Open full mission <ArrowRight className="h-3 w-3" /></Link>}</section>}
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
  return <section className="mt-3 grid gap-3 lg:grid-cols-[.9fr_1.1fr]"><form onSubmit={create} className="rounded-2xl border border-white/[.07] bg-[#151916] p-4"><div className="flex items-center gap-2"><Workflow className="h-3.5 w-3.5 text-[#d9ff62]" /><h2 className="text-[13px] font-semibold">Create an autopilot</h2></div><p className="mt-1.5 text-[9px] leading-4 text-white/28">Schedule recurring AI Office missions from the persisted queue.</p><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly growth review" className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-[10px] outline-none" /><select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#222823] p-3 text-[10px] outline-none"><option value="">General workspace</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="What should the team review or produce each time?" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-[10px] leading-5 outline-none" /><div className="mt-2 flex gap-2"><select value={cadence} onChange={(e) => setCadence(e.target.value)} className="flex-1 rounded-xl border border-white/10 bg-[#222823] p-3 text-[10px]"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select><button disabled={saving || !name.trim() || !prompt.trim()} className="rounded-xl bg-[#d9ff62] px-4 text-[10px] font-semibold text-black disabled:opacity-40">{saving ? "Saving…" : "Create"}</button></div></form><div className="rounded-2xl border border-white/[.07] bg-[#151916] p-4"><div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold">Active autopilots</h2><Clock3 className="h-3.5 w-3.5 text-white/25" /></div><div className="mt-3 space-y-2">{watchers.map((item) => <div key={item.id} className="rounded-xl border border-white/[.07] bg-white/[.018] p-3"><div className="flex items-center justify-between"><div className="text-[10px] font-medium">{item.name}</div><span className="rounded-full bg-[#d9ff62]/10 px-2 py-1 text-[8px] text-[#d9ff62]">{item.cadence}</span></div><div className="mt-1 text-[8px] text-white/24">{item.workspace_name || "General"}</div><div className="mt-2 line-clamp-2 text-[9px] leading-4 text-white/34">{item.mission_prompt}</div><div className="mt-2 text-[8px] text-white/22">Next run: {niceDate(item.next_run_at) || "scheduled"}</div></div>)}{!watchers.length && <EmptyState>No autopilots yet.</EmptyState>}</div></div></section>;
}

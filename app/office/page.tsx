"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Bell, Bot, Building2, CheckCircle2,
  ChevronRight, CircleDashed, Clock3, FileText, History, Loader2, Play, RefreshCw,
  Rocket, ShieldAlert, Sparkles, Star, Target, Users, Workflow, XCircle, Zap,
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
  { id: "business", name: "Prospect Analyst", emoji: "♟", department: "Strategy" },
  { id: "sales", name: "Sales", emoji: "🤝", department: "Commercial" },
  { id: "proposal", name: "Proposal", emoji: "📄", department: "Commercial" },
  { id: "pricing", name: "Pricing", emoji: "💰", department: "Commercial" },
  { id: "marketing", name: "Marketing", emoji: "📣", department: "Growth" },
  { id: "content", name: "Content", emoji: "✍️", department: "Growth" },
  { id: "product", name: "Product", emoji: "🧭", department: "Product" },
  { id: "ux", name: "UI/UX", emoji: "🎨", department: "Product" },
  { id: "architect", name: "Architect", emoji: "🏗", department: "Engineering" },
  { id: "frontend", name: "Frontend", emoji: "🖥", department: "Engineering" },
  { id: "backend", name: "Backend", emoji: "⚙", department: "Engineering" },
  { id: "security", name: "Security", emoji: "🛡", department: "Engineering" },
  { id: "qa", name: "QA", emoji: "🧪", department: "Quality" },
];

const templates = [
  { icon: Rocket, label: "Launch client", prompt: "Create a complete go-to-market plan for this client: positioning, funnel, pricing, sales, content and execution plan." },
  { icon: BarChart3, label: "Sales recovery", prompt: "Sales are under target. Diagnose the causes and build a 30-day recovery plan with funnel, offer, content and sales actions." },
  { icon: Sparkles, label: "Campaign", prompt: "Build a full marketing campaign from research through TOFU/MOFU/BOFU, content calendar, KPIs and next actions." },
  { icon: FileText, label: "Proposal", prompt: "Prepare a client-ready proposal with scope, deliverables, milestones, assumptions, risks and recommended next step." },
  { icon: Zap, label: "Build product", prompt: "Define a software product from problem statement to PRD, UX flow, architecture, security and implementation plan." },
  { icon: Target, label: "Pricing review", prompt: "Review the current offer and pricing. Recommend bundles, tests, margin-safe options and a clear pricing strategy without inventing missing costs." },
];

function freshAgents() {
  return Object.fromEntries(roster.map((agent) => [agent.id, { ...agent, status: "standby" as AgentStatus, detail: "Ready when needed" }]));
}

function statusLabel(status: AgentStatus) {
  return status === "working" ? "Working" : status === "queued" ? "Queued" : status === "completed" ? "Done" : status === "blocked" ? "Attention" : status === "failed" ? "Failed" : "Standby";
}

function statusDot(status: AgentStatus) {
  return status === "working"
    ? "bg-[#d9ff62] shadow-[0_0_10px_rgba(217,255,98,.75)]"
    : status === "completed"
      ? "bg-emerald-400"
      : status === "blocked" || status === "failed"
        ? "bg-amber-400"
        : status === "queued"
          ? "bg-sky-400"
          : "bg-[#677168]";
}

function niceDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

function AgentStation({ agent, selected, motion, onSelect }: { agent: AgentView; selected: boolean; motion: boolean; onSelect: () => void }) {
  const active = agent.status === "working";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group min-w-0 rounded-xl px-1.5 py-2 text-center transition ${selected ? "bg-white/[.07]" : "hover:bg-white/[.035]"}`}
    >
      <div className="relative mx-auto h-[72px] max-w-[112px]">
        <div className={`absolute inset-x-1 bottom-1 h-[40px] rounded-[9px] border bg-[#2b312d] shadow-[0_7px_14px_rgba(0,0,0,.30)] ${active ? "border-[#d9ff62]/45" : "border-white/10"}`}>
          <div className="absolute left-1/2 top-[7px] h-[17px] w-[34px] -translate-x-1/2 rounded-[4px] border border-white/10 bg-[#111512]">
            <div className={`mx-auto mt-[4px] h-[7px] w-[23px] rounded-[2px] ${active ? "bg-[#d9ff62]/35" : "bg-white/[.07]"}`} />
          </div>
          <div className="absolute bottom-[5px] left-[9px] h-[3px] w-[25px] rounded-full bg-[#70796f]/25" />
          <div className="absolute bottom-[5px] right-[9px] h-[3px] w-[18px] rounded-full bg-[#70796f]/20" />
        </div>
        <div className="absolute bottom-0 left-1/2 h-[10px] w-[28px] -translate-x-1/2 rounded-t-[8px] border border-white/10 bg-[#171b18]" />
        <div className={`absolute left-1/2 top-0 flex h-[34px] w-[34px] -translate-x-1/2 items-center justify-center rounded-[10px] border border-white/10 bg-[#161a17] text-[17px] shadow-lg ${motion && active ? "animate-bounce" : ""}`}>{agent.emoji}</div>
        <span className={`absolute right-1 top-0 h-2 w-2 rounded-full ${statusDot(agent.status)}`} />
      </div>
      <div className="truncate text-[10px] font-semibold leading-4 text-white/85">{agent.name}</div>
      <div className="mt-0.5 truncate text-[8px] uppercase tracking-[.11em] text-white/28">{agent.department}</div>
      <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5 text-[8px] text-white/40">
        <span className={`h-1.5 w-1.5 rounded-full ${statusDot(agent.status)}`} />
        {statusLabel(agent.status)}
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
  const [humanInput, setHumanInput] = useState("");
  const [agents, setAgents] = useState<Record<string, AgentView>>(freshAgents);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<OfficeTab>("floor");
  const [evaluation, setEvaluation] = useState<any>(null);
  const [motion, setMotion] = useState(true);

  const activeAgents = useMemo(() => Object.values(agents).filter((agent) => agent.status !== "standby"), [agents]);
  const workingCount = activeAgents.filter((agent) => agent.status === "working").length;
  const attentionCount = activeAgents.filter((agent) => ["blocked", "failed"].includes(agent.status)).length;
  const pendingApprovals = (overview?.approvals || []).filter((item) => item.status === "pending");
  const selectedAgent = expanded ? agents[expanded] : null;

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
    setPlan(null);
    setFinal("");
    setError("");
    setGrounded(false);
    setSourceCount(0);
    setMissionId(null);
    setAttention(null);
    setHumanInput("");
    setAgents(freshAgents());
    setExpanded(null);
    setEvaluation(null);
  }

  function applyAgentEvent(event: any) {
    const id = String(event.agent || "");
    if (!id || !roster.some((agent) => agent.id === id)) return;
    setAgents((current) => ({
      ...current,
      [id]: {
        ...current[id],
        status: event.status as AgentStatus,
        detail: String(event.detail || current[id]?.detail || ""),
        output: typeof event.output === "string" ? event.output : current[id]?.output,
      },
    }));
  }

  async function runMission(text = mission, parentMissionId?: string | null) {
    const value = text.trim();
    if (!value || running) return;
    resetRun();
    setMission(value);
    setRunning(true);
    setTab("floor");
    try {
      const response = await fetch("/api/office/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
          if (data) {
            try {
              const event = JSON.parse(data);
              if (event.type === "mission") setMissionId(event.missionId || null);
              else if (event.type === "agent") applyAgentEvent(event);
              else if (event.type === "context") { setGrounded(Boolean(event.grounded)); setSourceCount(Array.isArray(event.sources) ? event.sources.length : 0); }
              else if (event.type === "plan") setPlan(event.plan);
              else if (event.type === "attention") setAttention({ missionId: event.missionId, taskId: String(event.taskId), agent: String(event.agent), question: String(event.question) });
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
      setRunning(false);
      void loadOverview();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void runMission();
  }

  function continueWithInput() {
    if (!attention || !humanInput.trim()) return;
    const enriched = `${mission}\n\nHUMAN INPUT FOR ${attention.agent.toUpperCase()} (${attention.taskId}):\n${attention.question}\nAnswer: ${humanInput.trim()}`;
    void runMission(enriched, attention.missionId || missionId);
  }

  async function resolveApproval(id: string, decision: "approve" | "reject") {
    await fetch("/api/office/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision, execute: decision === "approve" }),
    });
    await loadOverview();
  }

  const stats = [
    { label: "Active projects", value: overview?.stats?.active || (running ? 1 : 0), icon: Building2 },
    { label: "Mission memory", value: overview?.stats?.missions || 0, icon: History },
    { label: "Needs attention", value: pendingApprovals.length + attentionCount, icon: Bell },
    { label: "Agents at work", value: workingCount, icon: Users },
  ];

  return (
    <main className="min-h-screen bg-[#0f1210] text-[#f2f4ed]">
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#0f1210]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[.035]" aria-label="Back to KretivOS"><ArrowLeft className="h-4 w-4" /></Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.16em] text-white/35"><span>Workspace</span><span>/</span><span className="text-white/60">The Office</span></div>
              <div className="mt-0.5 truncate text-sm font-semibold">KretivOS AI Office</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/10 px-2.5 py-1 text-[9px] uppercase tracking-[.12em] text-white/35 sm:inline">Owner only</span>
            <button onClick={() => void loadOverview()} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[.035] text-white/45" aria-label="Refresh office"><RefreshCw className={`h-4 w-4 ${loadingOverview ? "animate-spin" : ""}`} /></button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-5 md:px-7 md:pt-7">
        {(final || missionId) && !running && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[.06] px-3 py-2 text-[11px] text-emerald-200/75">
            <CheckCircle2 className="h-3.5 w-3.5" /> Mission saved. Your team is ready for the next instruction.
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[.28em] text-[#d9ff62]">Your ideas. A whole team behind them.</div>
            <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-.035em] md:text-4xl">Welcome to your office.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/40">One instruction from you. A whole team to research, decide, create, review and move the work forward.</p>

            <form onSubmit={submit} className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#171b18] shadow-[0_20px_50px_rgba(0,0,0,.22)]">
              <textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={3} placeholder="What should your team move forward?" className="w-full resize-none bg-transparent px-4 pb-3 pt-4 text-sm leading-6 outline-none placeholder:text-white/20" />
              <div className="flex flex-col gap-2 border-t border-white/8 bg-black/10 p-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 gap-2">
                  <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#222823] px-2.5 py-2 text-[10px] text-white/65 outline-none sm:max-w-[220px]"><option value="">General workspace</option>{(overview?.workspaces || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  <select value={budgetMode} onChange={(e) => setBudgetMode(e.target.value as any)} className="rounded-lg border border-white/10 bg-[#222823] px-2.5 py-2 text-[10px] text-white/65 outline-none"><option value="economy">Economy</option><option value="balanced">Balanced</option><option value="max_quality">Max quality</option></select>
                </div>
                <button disabled={running || !mission.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#d9ff62] px-4 py-2.5 text-xs font-semibold text-[#121612] disabled:opacity-40">{running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}{running ? "Team working…" : "Start mission"}</button>
              </div>
            </form>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{templates.map(({ icon: Icon, label, prompt }) => <button key={label} type="button" onClick={() => setMission(prompt)} className="inline-flex min-w-max items-center gap-1.5 rounded-lg border border-white/8 bg-white/[.025] px-2.5 py-1.5 text-[9px] text-white/42"><Icon className="h-3 w-3" />{label}</button>)}</div>
          </div>

          <div className="grid grid-cols-4 gap-2 self-end">
            {stats.map(({ label, value, icon: Icon }) => (
              <div key={label} className="min-w-0 rounded-xl border border-white/8 bg-[#171b18] p-2.5 md:p-3">
                <div className="flex items-center justify-between gap-1 text-white/28"><span className="truncate text-[8px] uppercase tracking-[.08em]">{label}</span><Icon className="h-3 w-3 shrink-0" /></div>
                <div className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">{value}</div>
              </div>
            ))}
          </div>
        </section>

        <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-white/8 pb-2 text-[10px]">
          {([['floor','Office floor',Bot],['deliverables','Deliverables',FileText],['clients','Clients',Building2],['analytics','Performance',BarChart3],['autopilot','Autopilot',Workflow]] as const).map(([key,label,Icon]) => <button key={key} type="button" onClick={() => setTab(key)} className={`flex min-w-max items-center gap-1.5 rounded-lg px-3 py-2 transition ${tab === key ? "bg-white text-[#111411]" : "text-white/35 hover:bg-white/[.04] hover:text-white/70"}`}><Icon className="h-3 w-3" />{label}</button>)}
        </nav>

        {attention && (
          <section className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4">
            <div className="flex gap-3"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div className="flex-1"><div className="text-xs font-semibold">Needs your attention</div><p className="mt-1 text-xs leading-5 text-white/45">{attention.question}</p><textarea value={humanInput} onChange={(e) => setHumanInput(e.target.value)} rows={2} placeholder="Provide the missing fact or decision…" className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-xs outline-none" /><button type="button" onClick={continueWithInput} disabled={!humanInput.trim() || running} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-300 px-3 py-2 text-[10px] font-semibold text-black disabled:opacity-40">Continue mission <ArrowRight className="h-3 w-3" /></button></div></div>
          </section>
        )}

        {tab === "floor" && (
          <section className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-[#151916] shadow-[0_22px_55px_rgba(0,0,0,.28)]">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div><div className="text-[9px] uppercase tracking-[.22em] text-white/28">The office floor</div><div className="mt-0.5 text-sm font-semibold">Your team, live</div></div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setMotion((value) => !value)} className="flex items-center gap-1.5 text-[9px] text-white/35"><span>Motion</span><span className={`relative h-4 w-7 rounded-full ${motion ? "bg-[#d9ff62]/35" : "bg-white/10"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition ${motion ? "left-3.5" : "left-0.5"}`} /></span></button>
                {missionId && <Link href={`/office/missions/${missionId}`} className="hidden items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-[9px] text-white/40 sm:inline-flex">View mission <ChevronRight className="h-3 w-3" /></Link>}
              </div>
            </div>

            {plan && <div className="mx-4 mt-3 rounded-xl border border-[#d9ff62]/12 bg-[#d9ff62]/[.035] px-3 py-2.5"><div className="text-[10px] font-semibold leading-4 text-[#d9ff62]">{plan.objective}</div><div className="mt-1 line-clamp-2 text-[9px] leading-4 text-white/30">{plan.summary}</div></div>}

            <div
              className="relative mt-3 border-y border-white/[.05] px-2 py-4 sm:px-4"
              style={{
                backgroundColor: "#121612",
                backgroundImage: "linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-3 border-b border-white/[.05] bg-[#1e241f]" />
              <div className="pointer-events-none absolute left-1/2 top-3 h-[calc(100%-12px)] w-px bg-white/[.025] md:left-[40%]" />
              <div className="grid grid-cols-3 gap-x-1 gap-y-2 md:grid-cols-5 md:gap-x-3 md:gap-y-4">
                {roster.map((base) => {
                  const agent = agents[base.id];
                  return <AgentStation key={agent.id} agent={agent} selected={expanded === agent.id} motion={motion} onSelect={() => setExpanded(expanded === agent.id ? null : agent.id)} />;
                })}
              </div>
              <div className="pointer-events-none absolute bottom-3 left-3 h-9 w-5 rounded-t-full border border-white/10 bg-emerald-500/10"><div className="mx-auto mt-1 h-4 w-3 rounded-full bg-emerald-400/20" /></div>
              <div className="pointer-events-none absolute bottom-3 right-3 h-9 w-5 rounded-t-full border border-white/10 bg-emerald-500/10"><div className="mx-auto mt-1 h-4 w-3 rounded-full bg-emerald-400/20" /></div>
            </div>

            <div className="grid gap-3 p-4 lg:grid-cols-[1fr_.75fr]">
              <div className="rounded-xl border border-white/8 bg-white/[.025] p-3">
                {selectedAgent ? (
                  <div>
                    <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/25 text-base">{selectedAgent.emoji}</div><div className="min-w-0"><div className="truncate text-xs font-semibold">{selectedAgent.name}</div><div className="text-[8px] uppercase tracking-[.12em] text-white/28">{selectedAgent.department}</div></div></div><div className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-1 text-[8px] text-white/40"><span className={`h-1.5 w-1.5 rounded-full ${statusDot(selectedAgent.status)}`} />{statusLabel(selectedAgent.status)}</div></div>
                    <div className="mt-3 text-[10px] leading-5 text-white/38">{selectedAgent.detail}</div>
                    {selectedAgent.output && <div className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-[9px] leading-5 text-white/52">{selectedAgent.output}</div>}
                    {!selectedAgent.output && <div className="mt-3 rounded-lg border border-dashed border-white/8 p-4 text-center text-[9px] text-white/22">No deliverable yet. This desk will fill when the agent works.</div>}
                  </div>
                ) : (
                  <div className="flex min-h-[110px] items-center justify-center text-center"><div><Bot className="mx-auto h-5 w-5 text-white/20" /><div className="mt-2 text-[10px] text-white/30">Tap any desk to see what that agent is doing.</div></div></div>
                )}
              </div>

              <div className="rounded-xl border border-white/8 bg-white/[.025] p-3">
                <div className="flex items-center justify-between"><div className="text-[9px] font-semibold uppercase tracking-[.15em] text-white/28">Chief</div><div className="inline-flex items-center gap-1 text-[8px] text-white/30"><span className={`h-1.5 w-1.5 rounded-full ${statusDot(agents.chief.status)}`} />{statusLabel(agents.chief.status)}</div></div>
                <div className="mt-2 text-xs font-medium leading-5 text-white/75">{agents.chief.detail}</div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[8px] text-white/28"><span className="rounded-full border border-white/8 px-2 py-1">{grounded ? `${sourceCount} sources` : "Grounding ready"}</span><span className="rounded-full border border-white/8 px-2 py-1">{budgetMode.replace("_", " ")}</span>{evaluation?.score && <span className="rounded-full border border-[#d9ff62]/15 px-2 py-1 text-[#d9ff62]">Quality {evaluation.score}/100</span>}</div>
              </div>
            </div>
          </section>
        )}

        {tab === "deliverables" && (
          <section className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
            <div className="rounded-2xl border border-white/8 bg-[#171b18] p-4"><div className="flex items-center justify-between"><div><div className="text-[9px] uppercase tracking-[.18em] text-white/28">Artifacts</div><h2 className="mt-1 text-sm font-semibold">Agency deliverables</h2></div><span className="rounded-full bg-white/[.05] px-2 py-1 text-[9px] text-white/30">{overview?.artifacts?.length || 0}</span></div><div className="mt-3 grid gap-2">{(overview?.artifacts || []).slice(0, 14).map((item) => <Link key={item.id} href={`/office/missions/${item.mission_id}`} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[.02] p-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[.05]"><FileText className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-medium">{item.title}</div><div className="mt-0.5 text-[8px] text-white/28">{item.artifact_type.replaceAll("_", " ")} · {item.agent_id}</div></div><span className={`rounded-full px-2 py-1 text-[8px] ${item.status === "executed" ? "bg-emerald-400/10 text-emerald-300" : item.status === "pending_approval" ? "bg-amber-300/10 text-amber-200" : "bg-white/[.05] text-white/35"}`}>{item.status.replaceAll("_", " ")}</span></Link>)}{!overview?.artifacts?.length && <EmptyState>Run a mission. Specialist work becomes reusable deliverables here.</EmptyState>}</div></div>
            <div className="rounded-2xl border border-white/8 bg-[#171b18] p-4"><div className="flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5 text-amber-300" /><h2 className="text-sm font-semibold">Approval queue</h2></div><div className="mt-3 space-y-2">{pendingApprovals.map((item) => <div key={item.id} className="rounded-xl border border-amber-300/12 bg-amber-300/[.035] p-3"><div className="text-[10px] font-medium">{item.title}</div><div className="mt-1 text-[8px] text-white/30">{item.workspace_name || "General"} · {item.artifact_type.replaceAll("_", " ")}</div><div className="mt-3 flex gap-2"><button type="button" onClick={() => void resolveApproval(item.id, "approve")} className="rounded-lg bg-[#d9ff62] px-3 py-1.5 text-[9px] font-semibold text-black">Approve & execute</button><button type="button" onClick={() => void resolveApproval(item.id, "reject")} className="rounded-lg border border-white/10 px-3 py-1.5 text-[9px] text-white/45">Reject</button></div></div>)}{!pendingApprovals.length && <EmptyState>No approvals waiting.</EmptyState>}</div></div>
          </section>
        )}

        {tab === "clients" && (
          <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(overview?.workspaces || []).map((item) => <Link key={item.id} href={`/office/clients/${item.id}`} className="rounded-2xl border border-white/8 bg-[#171b18] p-4 transition hover:border-white/15"><div className="flex items-start justify-between"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[.05]"><Building2 className="h-4 w-4" /></div><ChevronRight className="h-4 w-4 text-white/20" /></div><div className="mt-4 text-sm font-semibold">{item.name}</div><div className="mt-1 line-clamp-2 text-[10px] leading-5 text-white/35">{item.summary || item.brand_name || item.customer_name || "Persistent client memory"}</div><div className="mt-4 flex gap-2 text-[8px] text-white/30"><span className="rounded-full border border-white/8 px-2 py-1">{item.mission_count || 0} missions</span><span className="rounded-full border border-white/8 px-2 py-1">{item.artifact_count || 0} artifacts</span></div></Link>)}{!overview?.workspaces?.length && <div className="sm:col-span-2 xl:col-span-3"><EmptyState>Client workspaces will appear automatically from KretivOS customers and brands.</EmptyState></div>}</section>
        )}

        {tab === "analytics" && (
          <section className="mt-4 grid gap-4 lg:grid-cols-[.75fr_1.25fr]">
            <div className="rounded-2xl border border-white/8 bg-[#171b18] p-4"><div className="text-[9px] uppercase tracking-[.18em] text-white/28">Learning loop</div><div className="mt-2 text-4xl font-semibold">{Math.round(Number(overview?.stats?.avg_quality || 0))}<span className="text-lg text-white/25">/100</span></div><div className="mt-1 text-[9px] text-white/30">Average evaluated mission quality</div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-white/[.025] p-3"><div className="text-lg font-semibold">{overview?.stats?.completed || 0}</div><div className="text-[8px] text-white/28">Completed</div></div><div className="rounded-xl bg-white/[.025] p-3"><div className="text-lg font-semibold">{overview?.agents?.length || 0}</div><div className="text-[8px] text-white/28">Measured agents</div></div></div></div>
            <div className="rounded-2xl border border-white/8 bg-[#171b18] p-4"><div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-[#d9ff62]" /><h2 className="text-sm font-semibold">Agent performance</h2></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{(overview?.agents || []).map((metric) => { const base = roster.find((item) => item.id === metric.agent_id); const rate = metric.runs ? Math.round((metric.completed / metric.runs) * 100) : 0; return <div key={metric.agent_id} className="rounded-xl border border-white/8 bg-white/[.02] p-3"><div className="flex items-center justify-between"><div className="text-[10px] font-medium">{base?.emoji} {base?.name || metric.agent_id}</div><div className="text-[9px] text-[#d9ff62]">{rate}%</div></div><div className="mt-2 h-1 rounded-full bg-white/5"><div className="h-full rounded-full bg-[#d9ff62]/65" style={{ width: `${Math.min(100, rate)}%` }} /></div><div className="mt-2 flex justify-between text-[8px] text-white/25"><span>{metric.runs} runs</span><span>{metric.avg_duration_ms ? `${Math.round(metric.avg_duration_ms / 1000)}s avg` : "—"}</span><span>{metric.avg_rating ? `${Number(metric.avg_rating).toFixed(1)}★` : "No rating"}</span></div></div>; })}{!overview?.agents?.length && <div className="sm:col-span-2"><EmptyState>Performance data appears after agent runs.</EmptyState></div>}</div></div>
          </section>
        )}

        {tab === "autopilot" && <AutopilotPanel workspaces={overview?.workspaces || []} onCreated={loadOverview} />}

        {error && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[.06] p-3 text-xs text-red-200">{error}</div>}

        {final && tab === "floor" && (
          <section className="mt-4 rounded-2xl border border-white/8 bg-[#171b18] p-4 md:p-5">
            <div className="flex items-start justify-between gap-3"><div><div className="text-[9px] uppercase tracking-[.18em] text-white/28">Chief deliverable</div><h2 className="mt-1 text-sm font-semibold">Mission complete</h2></div>{evaluation?.score && <div className="inline-flex items-center gap-1 rounded-full border border-[#d9ff62]/15 bg-[#d9ff62]/[.04] px-2 py-1 text-[9px] text-[#d9ff62]"><Star className="h-3 w-3 fill-current" /> {evaluation.score}/100</div>}</div><div className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap text-xs leading-6 text-white/48">{final}</div>{missionId && <Link href={`/office/missions/${missionId}`} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[9px] text-white/45">Open full mission <ArrowRight className="h-3 w-3" /></Link>}
          </section>
        )}
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

  async function load() {
    try {
      const response = await fetch("/api/office/watchers", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setWatchers(Array.isArray(payload.watchers) ? payload.watchers : []);
    } catch {}
  }

  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !prompt.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/office/watchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, missionPrompt: prompt, workspaceId: workspaceId || undefined, cadence }),
      });
      setName("");
      setPrompt("");
      await load();
      await onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-4 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
      <form onSubmit={create} className="rounded-2xl border border-white/8 bg-[#171b18] p-4">
        <div className="flex items-center gap-2"><Workflow className="h-3.5 w-3.5 text-[#d9ff62]" /><h2 className="text-sm font-semibold">Create an autopilot</h2></div>
        <p className="mt-2 text-[9px] leading-5 text-white/30">Schedule recurring AI Office missions from the persisted queue.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly growth review" className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-[10px] outline-none" />
        <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#222823] p-3 text-[10px] outline-none"><option value="">General workspace</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="What should the team review or produce each time?" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-[10px] leading-5 outline-none" />
        <div className="mt-2 flex gap-2"><select value={cadence} onChange={(e) => setCadence(e.target.value)} className="flex-1 rounded-xl border border-white/10 bg-[#222823] p-3 text-[10px]"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select><button disabled={saving || !name.trim() || !prompt.trim()} className="rounded-xl bg-[#d9ff62] px-4 text-[10px] font-semibold text-black disabled:opacity-40">{saving ? "Saving…" : "Create"}</button></div>
      </form>

      <div className="rounded-2xl border border-white/8 bg-[#171b18] p-4">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Active autopilots</h2><Clock3 className="h-3.5 w-3.5 text-white/25" /></div>
        <div className="mt-3 space-y-2">{watchers.map((item) => <div key={item.id} className="rounded-xl border border-white/8 bg-white/[.02] p-3"><div className="flex items-center justify-between"><div className="text-[10px] font-medium">{item.name}</div><span className="rounded-full bg-[#d9ff62]/10 px-2 py-1 text-[8px] text-[#d9ff62]">{item.cadence}</span></div><div className="mt-1 text-[8px] text-white/25">{item.workspace_name || "General"}</div><div className="mt-2 line-clamp-2 text-[9px] leading-4 text-white/35">{item.mission_prompt}</div><div className="mt-2 text-[8px] text-white/22">Next run: {niceDate(item.next_run_at) || "scheduled"}</div></div>)}{!watchers.length && <EmptyState>No autopilots yet.</EmptyState>}</div>
      </div>
    </section>
  );
}

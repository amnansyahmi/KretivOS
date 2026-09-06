"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, BarChart3, Bell, Bot, Building2, CheckCircle2, ChevronRight,
  CircleDashed, Clock3, FileText, History, Loader2, Play, RefreshCw, Rocket,
  Settings2, ShieldAlert, Sparkles, Star, Target, Users, Workflow, XCircle, Zap,
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

const roster: Omit<AgentView, "status" | "detail">[] = [
  { id: "chief", name: "Chief", emoji: "🧑‍💼", department: "Management" },
  { id: "research", name: "Opportunity Scout", emoji: "🔎", department: "Strategy" },
  { id: "business", name: "Prospect Analyst", emoji: "♟️", department: "Strategy" },
  { id: "sales", name: "Sales Strategist", emoji: "🤝", department: "Commercial" },
  { id: "proposal", name: "Proposal Specialist", emoji: "📄", department: "Commercial" },
  { id: "pricing", name: "Pricing Strategist", emoji: "💰", department: "Commercial" },
  { id: "marketing", name: "Marketing Lead", emoji: "📣", department: "Growth" },
  { id: "content", name: "Content Strategist", emoji: "✍️", department: "Growth" },
  { id: "product", name: "Product Manager", emoji: "🧭", department: "Product" },
  { id: "ux", name: "UI/UX Designer", emoji: "🎨", department: "Product" },
  { id: "architect", name: "Solution Architect", emoji: "🏗️", department: "Engineering" },
  { id: "frontend", name: "Frontend Engineer", emoji: "🖥️", department: "Engineering" },
  { id: "backend", name: "Backend Engineer", emoji: "⚙️", department: "Engineering" },
  { id: "security", name: "Security Engineer", emoji: "🛡️", department: "Engineering" },
  { id: "qa", name: "QA / Critic", emoji: "🧪", department: "Quality" },
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
  return status === "working" ? "bg-[#d8ff53] shadow-[0_0_14px_rgba(216,255,83,.7)]" : status === "completed" ? "bg-emerald-400" : status === "blocked" || status === "failed" ? "bg-amber-400" : status === "queued" ? "bg-sky-400" : "bg-white/20";
}
function niceDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
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
  const [tab, setTab] = useState<"floor" | "deliverables" | "clients" | "analytics" | "autopilot">("floor");
  const [evaluation, setEvaluation] = useState<any>(null);

  const activeAgents = useMemo(() => Object.values(agents).filter((agent) => agent.status !== "standby"), [agents]);
  const workingCount = activeAgents.filter((agent) => agent.status === "working").length;
  const attentionCount = activeAgents.filter((agent) => ["blocked", "failed"].includes(agent.status)).length;
  const pendingApprovals = (overview?.approvals || []).filter((item) => item.status === "pending");

  async function loadOverview() {
    setLoadingOverview(true);
    try {
      const response = await fetch("/api/office/overview", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setOverview(payload);
    } finally { setLoadingOverview(false); }
  }
  useEffect(() => { void loadOverview(); }, []);

  function resetRun() {
    setPlan(null); setFinal(""); setError(""); setGrounded(false); setSourceCount(0); setMissionId(null);
    setAttention(null); setHumanInput(""); setAgents(freshAgents()); setExpanded(null); setEvaluation(null);
  }
  function applyAgentEvent(event: any) {
    const id = String(event.agent || "");
    if (!id || !roster.some((agent) => agent.id === id)) return;
    setAgents((current) => ({ ...current, [id]: { ...current[id], status: event.status as AgentStatus, detail: String(event.detail || current[id]?.detail || ""), output: typeof event.output === "string" ? event.output : current[id]?.output } }));
  }

  async function runMission(text = mission, parentMissionId?: string | null) {
    const value = text.trim();
    if (!value || running) return;
    resetRun(); setMission(value); setRunning(true); setTab("floor");
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
    { label: "Projects", value: overview?.stats?.missions || 0, icon: Building2 },
    { label: "Active missions", value: overview?.stats?.active || (running ? 1 : 0), icon: Target },
    { label: "Needs attention", value: pendingApprovals.length + attentionCount, icon: Bell },
    { label: "Agents at work", value: workingCount || overview?.agents?.filter((a) => a.runs > 0).length || 0, icon: Users },
  ];

  return (
    <main className="min-h-screen bg-[#111413] text-[#f5f6ef]">
      <div className="pointer-events-none fixed inset-0 opacity-[.16]" style={{ backgroundImage: "radial-gradient(circle at 20% 10%, #b9ff5b 0, transparent 24%), radial-gradient(circle at 90% 15%, #754dff 0, transparent 22%)" }} />
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#111413]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 md:px-7">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[.04] hover:bg-white/[.08]" aria-label="Back to KretivOS"><ArrowLeft className="h-4 w-4" /></Link>
            <div><div className="text-sm font-semibold tracking-tight">KretivOS <span className="text-[#d8ff53]">AI Office</span></div><div className="text-[9px] uppercase tracking-[.23em] text-white/35">Autonomous agency operating system</div></div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden rounded-full border border-[#d8ff53]/20 bg-[#d8ff53]/8 px-3 py-1.5 text-[10px] font-medium text-[#d8ff53] md:block">PHASES 1–5 LIVE</div>
            <button onClick={() => void loadOverview()} className="rounded-xl border border-white/10 p-2 text-white/55 hover:bg-white/[.06]"><RefreshCw className={`h-4 w-4 ${loadingOverview ? "animate-spin" : ""}`} /></button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1500px] px-4 py-6 md:px-7 md:py-8">
        <section className="rounded-[28px] border border-white/8 bg-gradient-to-br from-[#1b1f1d] to-[#151817] p-5 shadow-2xl md:p-7">
          <div className="grid gap-7 xl:grid-cols-[1.08fr_.92fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-[10px] uppercase tracking-[.18em] text-white/45"><Sparkles className="h-3 w-3 text-[#d8ff53]" /> Your ideas. A whole team behind them.</div>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-.045em] md:text-6xl">Welcome to your <span className="text-[#d8ff53]">AI office.</span></h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/45 md:text-base">Give Chief an outcome. The office researches, debates, builds deliverables, asks for approvals, executes into KretivOS and learns from every mission.</p>

              <form onSubmit={submit} className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-2 shadow-inner">
                <textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={4} placeholder="Describe a goal, project or problem…" className="w-full resize-none rounded-xl bg-transparent p-3 text-sm leading-6 outline-none placeholder:text-white/25" />
                <div className="flex flex-col gap-2 border-t border-white/8 px-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="max-w-[250px] rounded-lg border border-white/10 bg-[#202421] px-2.5 py-2 text-xs text-white/75 outline-none"><option value="">General / no client</option>{(overview?.workspaces || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                    <select value={budgetMode} onChange={(e) => setBudgetMode(e.target.value as any)} className="rounded-lg border border-white/10 bg-[#202421] px-2.5 py-2 text-xs text-white/75 outline-none"><option value="economy">Economy</option><option value="balanced">Balanced</option><option value="max_quality">Max quality</option></select>
                  </div>
                  <button disabled={running || !mission.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d8ff53] px-4 py-2.5 text-sm font-semibold text-[#111413] transition hover:brightness-95 disabled:opacity-40">{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{running ? "Office working…" : "Start mission"}</button>
                </div>
              </form>

              <div className="mt-4 flex flex-wrap gap-2">{templates.map(({ icon: Icon, label, prompt }) => <button key={label} onClick={() => setMission(prompt)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[.025] px-3 py-2 text-[11px] text-white/50 transition hover:border-white/15 hover:bg-white/[.05] hover:text-white"><Icon className="h-3.5 w-3.5" /> {label}</button>)}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 self-start">
              {stats.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-white/8 bg-white/[.035] p-4 md:p-5"><div className="flex items-center justify-between text-[10px] uppercase tracking-[.14em] text-white/35"><span>{label}</span><Icon className="h-4 w-4" /></div><div className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">{value}</div></div>)}
              <div className="col-span-2 rounded-2xl border border-white/8 bg-[#d8ff53] p-4 text-[#151815] md:p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-[.18em] opacity-50">Chief status</div><div className="mt-1 text-lg font-semibold">{running ? "Mission in progress" : attention ? "Waiting for your input" : pendingApprovals.length ? `${pendingApprovals.length} approval${pendingApprovals.length === 1 ? "" : "s"} waiting` : "Office ready"}</div></div><div className="rounded-full bg-black/10 p-2"><Bot className="h-5 w-5" /></div></div></div>
            </div>
          </div>
        </section>

        <nav className="mt-5 flex gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-[#191c1b] p-1.5 text-xs">
          {([['floor','Office floor',Bot],['deliverables','Deliverables',FileText],['clients','Clients',Building2],['analytics','Performance',BarChart3],['autopilot','Autopilot',Workflow]] as const).map(([key,label,Icon]) => <button key={key} onClick={() => setTab(key)} className={`flex min-w-max items-center gap-2 rounded-xl px-3 py-2.5 transition ${tab === key ? "bg-white text-[#111413]" : "text-white/45 hover:bg-white/[.05] hover:text-white"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
        </nav>

        {attention && <section className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[.07] p-5"><div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /><div className="flex-1"><div className="text-sm font-semibold">Needs your attention</div><p className="mt-1 text-sm leading-6 text-white/50">{attention.question}</p><textarea value={humanInput} onChange={(e) => setHumanInput(e.target.value)} rows={3} placeholder="Give the missing fact or decision…" className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none" /><button onClick={continueWithInput} disabled={!humanInput.trim() || running} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-300 px-3 py-2 text-xs font-semibold text-black disabled:opacity-40">Continue mission <ArrowRight className="h-3.5 w-3.5" /></button></div></div></section>}

        {tab === "floor" && <section className="mt-5 rounded-[28px] border border-white/8 bg-[#181c1a] p-4 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-[10px] uppercase tracking-[.22em] text-white/30">The office floor</div><h2 className="mt-1 text-xl font-semibold">Live agent activity</h2></div><div className="flex items-center gap-2 text-[10px] text-white/35"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#d8ff53]" /> Working</span><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white/20" /> Standby</span>{missionId && <Link href={`/office/missions/${missionId}`} className="ml-2 inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 hover:bg-white/[.05]">Open mission <ChevronRight className="h-3 w-3" /></Link>}</div></div>
          {plan && <div className="mt-4 rounded-xl border border-[#d8ff53]/15 bg-[#d8ff53]/[.04] p-4"><div className="text-xs font-semibold text-[#d8ff53]">{plan.objective}</div><div className="mt-1 text-xs leading-5 text-white/40">{plan.summary}</div></div>}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{roster.map((base) => { const agent = agents[base.id]; const open = expanded === agent.id; return <button key={agent.id} onClick={() => setExpanded(open ? null : agent.id)} className={`group relative min-h-[175px] overflow-hidden rounded-2xl border p-3 text-left transition ${agent.status === "working" ? "border-[#d8ff53]/35 bg-[#d8ff53]/[.06]" : agent.status === "blocked" || agent.status === "failed" ? "border-amber-300/25 bg-amber-300/[.04]" : agent.status === "completed" ? "border-emerald-400/15 bg-emerald-400/[.035]" : "border-white/8 bg-[#202421] hover:border-white/15"}`}>
            <div className="absolute left-3 right-3 top-12 h-11 rounded-lg border border-white/8 bg-[#2a2e2b] shadow-[0_10px_25px_rgba(0,0,0,.25)]"><div className="mx-auto mt-2 h-3 w-12 rounded-sm bg-black/25" /></div>
            <div className="relative z-10 flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#151817] text-xl shadow-lg">{agent.emoji}</div><div className="flex items-center gap-1.5 rounded-full bg-black/25 px-2 py-1 text-[9px] text-white/45"><span className={`h-1.5 w-1.5 rounded-full ${statusDot(agent.status)}`} />{statusLabel(agent.status)}</div></div>
            <div className="relative z-10 mt-14"><div className="text-xs font-semibold text-white/85">{agent.name}</div><div className="mt-1 text-[9px] uppercase tracking-[.14em] text-white/25">{agent.department}</div><div className="mt-2 line-clamp-2 text-[10px] leading-4 text-white/35">{agent.detail}</div></div>
            {open && agent.output && <div className="relative z-20 mt-3 max-h-60 overflow-auto rounded-xl border border-white/8 bg-[#101211] p-3 text-[10px] leading-5 text-white/60 whitespace-pre-wrap">{agent.output}</div>}
          </button>; })}</div>
        </section>}

        {tab === "deliverables" && <section className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-[26px] border border-white/8 bg-[#181c1a] p-5"><div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[.2em] text-white/30">Artifacts</div><h2 className="mt-1 text-lg font-semibold">Agency deliverables</h2></div><span className="rounded-full bg-white/[.05] px-2.5 py-1 text-[10px] text-white/35">{overview?.artifacts?.length || 0} recent</span></div><div className="mt-4 grid gap-2">{(overview?.artifacts || []).slice(0, 12).map((item) => <Link key={item.id} href={`/office/missions/${item.mission_id}`} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[.025] p-3 transition hover:bg-white/[.05]"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[.05]"><FileText className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{item.title}</div><div className="mt-0.5 text-[10px] text-white/30">{item.artifact_type.replaceAll("_", " ")} · {item.agent_id}</div></div><span className={`rounded-full px-2 py-1 text-[9px] ${item.status === "executed" ? "bg-emerald-400/10 text-emerald-300" : item.status === "pending_approval" ? "bg-amber-300/10 text-amber-200" : "bg-white/[.05] text-white/40"}`}>{item.status.replaceAll("_", " ")}</span></Link>)}{!overview?.artifacts?.length && <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-white/30">Run a mission. Specialist work becomes reusable artifacts here.</div>}</div></div>
          <div className="rounded-[26px] border border-white/8 bg-[#181c1a] p-5"><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-300" /><h2 className="text-lg font-semibold">Approval queue</h2></div><div className="mt-4 space-y-2">{pendingApprovals.slice(0, 8).map((item) => <div key={item.id} className="rounded-xl border border-white/8 bg-white/[.025] p-3"><div className="text-xs font-medium">{item.title}</div><div className="mt-1 text-[10px] text-white/30">{item.workspace_name || "General"} · {item.artifact_type.replaceAll("_", " ")}</div><div className="mt-3 flex gap-2"><button onClick={() => void resolveApproval(item.id, "approve")} className="flex-1 rounded-lg bg-[#d8ff53] px-2 py-2 text-[10px] font-semibold text-black">Approve & execute</button><button onClick={() => void resolveApproval(item.id, "reject")} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-white/50">Reject</button></div></div>)}{!pendingApprovals.length && <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-white/30">Nothing waiting for approval.</div>}</div></div>
        </section>}

        {tab === "clients" && <section className="mt-5 rounded-[26px] border border-white/8 bg-[#181c1a] p-5"><div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[.2em] text-white/30">Client memory</div><h2 className="mt-1 text-lg font-semibold">Persistent workspaces</h2></div><Building2 className="h-5 w-5 text-white/30" /></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(overview?.workspaces || []).map((item) => <Link key={item.id} href={`/office/workspaces/${item.id}`} className="rounded-2xl border border-white/8 bg-[#202421] p-4 transition hover:-translate-y-0.5 hover:border-white/15"><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[.05]"><Building2 className="h-4 w-4" /></div><ChevronRight className="h-4 w-4 text-white/25" /></div><div className="mt-4 text-sm font-semibold">{item.name}</div><div className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/35">{item.summary || "Client missions, artifacts and lessons accumulate here."}</div><div className="mt-4 flex gap-4 text-[10px] text-white/30"><span>{item.mission_count || 0} missions</span><span>{item.artifact_count || 0} artifacts</span></div></Link>)}{!overview?.workspaces?.length && <div className="col-span-full rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-white/30">Add customers in KretivOS Sales. AI Office automatically turns them into client workspaces.</div>}</div></section>}

        {tab === "analytics" && <section className="mt-5 grid gap-4 lg:grid-cols-[.72fr_1.28fr]"><div className="rounded-[26px] border border-white/8 bg-[#181c1a] p-5"><div className="text-[10px] uppercase tracking-[.2em] text-white/30">Self-improving layer</div><h2 className="mt-1 text-lg font-semibold">Mission quality</h2><div className="mt-6 text-6xl font-semibold tracking-[-.06em] text-[#d8ff53]">{overview?.stats?.avg_quality ? `${overview.stats.avg_quality}` : "—"}</div><div className="mt-2 text-xs text-white/30">Average evaluator score / 100</div>{evaluation && <div className="mt-5 rounded-xl border border-white/8 bg-white/[.025] p-3 text-xs text-white/50"><div className="font-medium text-white/70">Latest mission: {evaluation.score}/100</div><div className="mt-2 text-[10px] leading-5">{Array.isArray(evaluation.lessons) ? evaluation.lessons.slice(0, 3).join(" · ") : ""}</div></div>}</div><div className="rounded-[26px] border border-white/8 bg-[#181c1a] p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Agent performance</h2><Star className="h-4 w-4 text-[#d8ff53]" /></div><div className="mt-4 grid gap-2">{(overview?.agents || []).slice(0, 12).map((item) => { const rate = item.runs ? Math.round((item.completed / item.runs) * 100) : 0; return <div key={item.agent_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-white/8 bg-white/[.025] px-3 py-2.5"><div><div className="text-xs font-medium capitalize">{item.agent_id.replaceAll("_", " ")}</div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[.05]"><div className="h-full rounded-full bg-[#d8ff53]" style={{ width: `${rate}%` }} /></div></div><div className="text-[10px] text-white/35">{rate}% success</div><div className="text-[10px] text-white/35">{item.avg_rating ? `${item.avg_rating}★` : "—"}</div></div>})}{!overview?.agents?.length && <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-white/30">Agent performance appears after missions run.</div>}</div></div></section>}

        {tab === "autopilot" && <AutopilotPanel workspaces={overview?.workspaces || []} onCreated={loadOverview} />}

        {error && <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/[.06] p-4 text-xs text-red-200">{error}</div>}
        {final && <section className="mt-5 rounded-[26px] border border-white/8 bg-[#f3f3ed] p-5 text-[#20251f] md:p-7"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="text-[10px] font-semibold uppercase tracking-[.2em] text-black/35">Chief deliverable</div><h2 className="mt-1 text-2xl font-semibold tracking-tight">Mission complete</h2></div><div className="flex gap-2">{evaluation?.score ? <span className="rounded-full bg-black/5 px-3 py-1 text-[10px] font-medium">Quality {evaluation.score}/100</span> : null}{missionId && <Link href={`/office/missions/${missionId}`} className="inline-flex items-center gap-1 rounded-full bg-[#20251f] px-3 py-1 text-[10px] font-medium text-white">Open full mission <ChevronRight className="h-3 w-3" /></Link>}</div></div><div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-black/65">{final}</div></section>}

        <section className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-2xl border border-white/8 bg-white/[.025] p-4"><div className="flex items-center gap-2 text-xs font-medium"><Play className="h-4 w-4 text-[#d8ff53]" /> Execution layer</div><p className="mt-2 text-[10px] leading-5 text-white/30">Approved funnels, documents, projects and knowledge are written into real KretivOS modules.</p></div><div className="rounded-2xl border border-white/8 bg-white/[.025] p-4"><div className="flex items-center gap-2 text-xs font-medium"><Workflow className="h-4 w-4 text-[#d8ff53]" /> Autonomous layer</div><p className="mt-2 text-[10px] leading-5 text-white/30">Watchers queue future missions and run through the existing KretivOS cron without keeping a browser open.</p></div><div className="rounded-2xl border border-white/8 bg-white/[.025] p-4"><div className="flex items-center gap-2 text-xs font-medium"><Settings2 className="h-4 w-4 text-[#d8ff53]" /> Learning layer</div><p className="mt-2 text-[10px] leading-5 text-white/30">Quality evaluations, retry feedback and agent ratings improve what the office reuses next.</p></div></section>
      </div>
    </main>
  );
}

function AutopilotPanel({ workspaces, onCreated }: { workspaces: Workspace[]; onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [cadence, setCadence] = useState("weekly");
  const [watchers, setWatchers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  async function load() { try { const r = await fetch("/api/office/watchers", { cache: "no-store" }); const p = await r.json(); if (r.ok) setWatchers(p.watchers || []); } catch {} }
  useEffect(() => { void load(); }, []);
  async function create(event: FormEvent) {
    event.preventDefault(); if (!name.trim() || !prompt.trim()) return; setSaving(true);
    try { await fetch("/api/office/watchers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, missionPrompt: prompt, workspaceId: workspaceId || undefined, cadence }) }); setName(""); setPrompt(""); await load(); await onCreated(); } finally { setSaving(false); }
  }
  return <section className="mt-5 grid gap-4 lg:grid-cols-[.9fr_1.1fr]"><form onSubmit={create} className="rounded-[26px] border border-white/8 bg-[#181c1a] p-5"><div className="flex items-center gap-2"><Workflow className="h-4 w-4 text-[#d8ff53]" /><h2 className="text-lg font-semibold">Create an autopilot</h2></div><p className="mt-2 text-[11px] leading-5 text-white/35">Schedule a recurring mission. It runs from the persisted job queue through KretivOS cron.</p><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly growth review" className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-xs outline-none" /><select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#202421] p-3 text-xs outline-none"><option value="">General workspace</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="What should the AI team review or produce each time?" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 outline-none" /><div className="mt-2 flex gap-2"><select value={cadence} onChange={(e) => setCadence(e.target.value)} className="flex-1 rounded-xl border border-white/10 bg-[#202421] p-3 text-xs"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select><button disabled={saving || !name.trim() || !prompt.trim()} className="rounded-xl bg-[#d8ff53] px-4 text-xs font-semibold text-black disabled:opacity-40">{saving ? "Saving…" : "Create"}</button></div></form><div className="rounded-[26px] border border-white/8 bg-[#181c1a] p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Active autopilots</h2><Clock3 className="h-4 w-4 text-white/30" /></div><div className="mt-4 space-y-2">{watchers.map((item) => <div key={item.id} className="rounded-xl border border-white/8 bg-white/[.025] p-3"><div className="flex items-center justify-between"><div className="text-xs font-medium">{item.name}</div><span className="rounded-full bg-[#d8ff53]/10 px-2 py-1 text-[9px] text-[#d8ff53]">{item.cadence}</span></div><div className="mt-1 text-[10px] text-white/30">{item.workspace_name || "General"}</div><div className="mt-2 line-clamp-2 text-[10px] leading-5 text-white/40">{item.mission_prompt}</div><div className="mt-2 text-[9px] text-white/25">Next run: {niceDate(item.next_run_at) || "scheduled"}</div></div>)}{!watchers.length && <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-white/30">No autopilots yet.</div>}</div></div></section>;
}

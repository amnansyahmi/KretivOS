"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, Bot, CheckCircle2, ChevronDown, CircleDashed,
  Clock3, History, Loader2, RefreshCw, ShieldAlert, Sparkles, Target,
  Users, XCircle,
} from "lucide-react";

type AgentStatus = "standby" | "queued" | "working" | "completed" | "blocked" | "failed";
type PlanTask = { id: string; agent: string; title: string; instruction: string; dependsOn: string[] };
type OfficePlan = { missionType: string; objective: string; summary: string; tasks: PlanTask[] };
type AgentView = { id: string; name: string; emoji: string; department: string; status: AgentStatus; detail: string; output?: string };
type HistoryItem = {
  id: string; title: string; mission_type?: string; objective?: string; status: string;
  grounded?: boolean; source_count?: number; created_at: string; completed_at?: string;
  task_count?: number; completed_tasks?: number;
};
type Attention = { missionId?: string | null; taskId: string; agent: string; question: string };

const roster: Omit<AgentView, "status" | "detail">[] = [
  { id: "chief", name: "Chief", emoji: "🧑‍💼", department: "Management" },
  { id: "research", name: "Market Researcher", emoji: "🔎", department: "Strategy" },
  { id: "business", name: "Business Strategist", emoji: "♟️", department: "Strategy" },
  { id: "marketing", name: "Marketing Strategist", emoji: "📣", department: "Growth" },
  { id: "content", name: "Content Strategist", emoji: "✍️", department: "Growth" },
  { id: "pricing", name: "Pricing Strategist", emoji: "💰", department: "Commercial" },
  { id: "sales", name: "Sales Strategist", emoji: "🤝", department: "Commercial" },
  { id: "proposal", name: "Proposal Specialist", emoji: "📄", department: "Commercial" },
  { id: "product", name: "Product Manager", emoji: "🧭", department: "Product" },
  { id: "ux", name: "UI/UX Designer", emoji: "🎨", department: "Product" },
  { id: "architect", name: "Solution Architect", emoji: "🏗️", department: "Engineering" },
  { id: "frontend", name: "Frontend Engineer", emoji: "🖥️", department: "Engineering" },
  { id: "backend", name: "Backend Engineer", emoji: "⚙️", department: "Engineering" },
  { id: "security", name: "Security Engineer", emoji: "🛡️", department: "Engineering" },
  { id: "qa", name: "QA / Critic", emoji: "🧪", department: "Quality" },
];

const examples = [
  "Chef Ammar sales slow. Analyse why and build a 30-day growth plan with funnel, pricing and content actions.",
  "We have a new SME client that wants a quotation system. Define product scope, UX, architecture and implementation plan.",
  "Build a launch strategy for a new Malaysian skincare brand targeting working women aged 25–40.",
];

function freshAgents() {
  return Object.fromEntries(roster.map((agent) => [agent.id, { ...agent, status: "standby" as AgentStatus, detail: "Ready when needed" }]));
}

function statusLabel(status: AgentStatus) {
  return status === "working" ? "Working" : status === "queued" ? "Queued" : status === "completed" ? "Done" : status === "blocked" ? "Needs attention" : status === "failed" ? "Failed" : "Standby";
}

function StatusIcon({ status }: { status: AgentStatus }) {
  if (status === "working") return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "blocked") return <ShieldAlert className="h-3.5 w-3.5" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5" />;
  return <CircleDashed className="h-3.5 w-3.5" />;
}

function niceDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

export default function OfficePage() {
  const [mission, setMission] = useState("");
  const [running, setRunning] = useState(false);
  const [plan, setPlan] = useState<OfficePlan | null>(null);
  const [final, setFinal] = useState("");
  const [error, setError] = useState("");
  const [grounded, setGrounded] = useState(false);
  const [sourceCount, setSourceCount] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [agents, setAgents] = useState<Record<string, AgentView>>(freshAgents);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [missionId, setMissionId] = useState<string | null>(null);
  const [attention, setAttention] = useState<Attention | null>(null);
  const [humanInput, setHumanInput] = useState("");

  const activeAgents = useMemo(() => Object.values(agents).filter((agent) => agent.status !== "standby"), [agents]);
  const workingCount = activeAgents.filter((agent) => agent.status === "working").length;
  const attentionCount = activeAgents.filter((agent) => ["blocked", "failed"].includes(agent.status)).length;
  const completedCount = activeAgents.filter((agent) => agent.status === "completed").length;

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/office/history?limit=12", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setHistory(Array.isArray(payload.missions) ? payload.missions : []);
    } catch {} finally { setHistoryLoading(false); }
  }

  useEffect(() => { void loadHistory(); }, []);

  function resetRun() {
    setPlan(null); setFinal(""); setError(""); setGrounded(false); setSourceCount(0);
    setExpanded(null); setAgents(freshAgents()); setAttention(null); setHumanInput(""); setMissionId(null);
  }

  function applyAgentEvent(event: any) {
    const id = String(event.agent || "");
    if (!id || !roster.some((agent) => agent.id === id)) return;
    setAgents((current) => ({
      ...current,
      [id]: { ...current[id], status: event.status as AgentStatus, detail: String(event.detail || current[id]?.detail || ""), output: typeof event.output === "string" ? event.output : current[id]?.output },
    }));
  }

  async function runMission(text = mission) {
    const value = text.trim();
    if (!value || running) return;
    resetRun(); setMission(value); setRunning(true);
    try {
      const response = await fetch("/api/office/mission", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission: value, grounded: true, maxAgents: 6 }),
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
              if (event.type === "mission" && event.missionId) setMissionId(String(event.missionId));
              else if (event.type === "agent") applyAgentEvent(event);
              else if (event.type === "context") { setGrounded(Boolean(event.grounded)); setSourceCount(Array.isArray(event.sources) ? event.sources.length : 0); }
              else if (event.type === "plan") setPlan(event.plan as OfficePlan);
              else if (event.type === "attention") setAttention({ missionId: event.missionId, taskId: String(event.taskId), agent: String(event.agent), question: String(event.question) });
              else if (event.type === "done") { setFinal(String(event.final || "")); if (event.missionId) setMissionId(String(event.missionId)); }
              else if (event.type === "error") setError(String(event.error || "Mission failed."));
            } catch {}
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mission failed.");
    } finally {
      setRunning(false); void loadHistory();
    }
  }

  function submit(e: FormEvent) { e.preventDefault(); void runMission(); }
  function continueWithInput() {
    if (!attention || !humanInput.trim()) return;
    const enriched = `${mission}\n\nHUMAN INPUT FOR ${attention.agent.toUpperCase()} (${attention.taskId}):\n${attention.question}\nAnswer: ${humanInput.trim()}`;
    void runMission(enriched);
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] text-[#202c25]">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-[#f5f4ef]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-7">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium"><ArrowLeft className="h-4 w-4" /> KretivOS</Link>
          <div className="flex items-center gap-2 rounded-full border border-[#202c25]/10 bg-white px-3 py-1.5 text-xs"><Bot className="h-3.5 w-3.5" /> AI Office · Phase 2</div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-7 md:px-7 md:py-10">
        <section className="grid gap-6 lg:grid-cols-[1.45fr_.55fr]">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.28em] text-[#718076]">Your ideas. A whole team behind them.</div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-.04em] md:text-6xl">Welcome to your AI office.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#68736b] md:text-base">Give Chief one outcome. KretivOS plans the work, runs only the useful specialists, parallelises independent tasks, checks the result, and saves the mission.</p>

            <form onSubmit={submit} className="mt-7 rounded-3xl border border-black/8 bg-white p-3 shadow-sm">
              <textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={5} placeholder="Describe a goal, client problem, campaign, product or technical mission…" className="w-full resize-none rounded-2xl bg-[#f7f7f3] p-4 text-sm outline-none placeholder:text-[#8b938e]" />
              <div className="mt-3 flex items-center justify-between gap-3 px-1">
                <div className="text-xs text-[#7a847d]">{grounded ? `Grounded · ${sourceCount} internal source${sourceCount === 1 ? "" : "s"}` : "KretivOS grounding enabled"}</div>
                <button disabled={running || !mission.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#202c25] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{running ? "Team working…" : "Start mission"}</button>
              </div>
            </form>

            {!plan && !running && !final && <div className="mt-4 grid gap-2 md:grid-cols-3">{examples.map((example) => <button key={example} onClick={() => setMission(example)} className="rounded-2xl border border-black/7 bg-white p-4 text-left text-xs leading-5 text-[#5f6a62] transition hover:-translate-y-0.5 hover:shadow-sm">{example}</button>)}</div>}
          </div>

          <aside className="rounded-3xl border border-black/8 bg-[#202c25] p-5 text-white shadow-sm">
            <div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[.22em] text-white/45">Mission memory</div><div className="mt-1 text-lg font-medium">Recent missions</div></div><button onClick={() => void loadHistory()} className="rounded-lg p-2 hover:bg-white/10" aria-label="Refresh mission history"><RefreshCw className={`h-4 w-4 ${historyLoading ? "animate-spin" : ""}`} /></button></div>
            <div className="mt-4 space-y-2">{history.length ? history.slice(0, 6).map((item) => <button key={item.id} onClick={() => item.objective && setMission(item.objective)} className="w-full rounded-2xl border border-white/8 bg-white/[.04] p-3 text-left transition hover:bg-white/[.08]"><div className="line-clamp-2 text-xs font-medium leading-5">{item.title}</div><div className="mt-2 flex items-center justify-between text-[10px] text-white/45"><span className="capitalize">{item.status.replace("_", " ")}</span><span>{niceDate(item.created_at)}</span></div></button>) : <div className="rounded-2xl border border-dashed border-white/12 p-5 text-xs text-white/45">{historyLoading ? "Loading missions…" : "Your completed and active missions will appear here."}</div>}</div>
          </aside>
        </section>

        {(running || plan || final || error || attention) && <section className="mt-8 grid gap-4 md:grid-cols-4">
          {[{ label: "Active mission", value: plan ? 1 : running ? 1 : 0, icon: Target }, { label: "Agents working", value: workingCount, icon: Users }, { label: "Completed", value: completedCount, icon: CheckCircle2 }, { label: "Needs attention", value: attentionCount, icon: ShieldAlert }].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-black/7 bg-white p-4"><div className="flex items-center justify-between text-xs text-[#7a847d]"><span>{label}</span><Icon className="h-4 w-4" /></div><div className="mt-3 text-3xl font-semibold">{value}</div></div>)}
        </section>}

        {attention && <section className="mt-6 rounded-3xl border border-amber-300/60 bg-amber-50 p-5 md:p-6"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><div className="flex-1"><div className="text-sm font-semibold">Needs your attention</div><p className="mt-1 text-sm leading-6 text-[#5f675f]">{attention.question}</p><textarea value={humanInput} onChange={(e) => setHumanInput(e.target.value)} rows={3} placeholder="Provide the missing fact or decision…" className="mt-4 w-full rounded-2xl border border-black/10 bg-white p-3 text-sm outline-none" /><button onClick={continueWithInput} disabled={!humanInput.trim() || running} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#202c25] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">Continue mission <ArrowRight className="h-4 w-4" /></button></div></div></section>}

        {(plan || activeAgents.length > 0) && <section className="mt-6 rounded-3xl border border-black/8 bg-[#19241e] p-4 text-white shadow-sm md:p-6">
          <div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[.24em] text-white/40">The office floor</div><div className="mt-1 text-lg font-medium">Live agent activity</div></div>{missionId && <div className="hidden items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[10px] text-white/45 md:flex"><History className="h-3 w-3" /> Saved</div>}</div>
          {plan && <div className="mt-4 rounded-2xl border border-white/8 bg-white/[.04] p-4"><div className="text-xs font-medium text-white/85">{plan.objective}</div><p className="mt-1 text-xs leading-5 text-white/45">{plan.summary}</p></div>}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{roster.map((agentBase) => { const agent = agents[agentBase.id]; return <button key={agent.id} onClick={() => agent.output && setExpanded(expanded === agent.id ? null : agent.id)} className={`min-h-[150px] rounded-2xl border p-4 text-left transition ${agent.status === "working" ? "border-[#e99472]/50 bg-[#e99472]/10" : agent.status === "completed" ? "border-emerald-400/20 bg-emerald-400/[.05]" : agent.status === "blocked" || agent.status === "failed" ? "border-amber-300/25 bg-amber-200/[.05]" : "border-white/8 bg-white/[.025]"}`}><div className="flex items-start justify-between"><div className="text-3xl">{agent.emoji}</div><div className="flex items-center gap-1.5 text-[10px] text-white/45"><StatusIcon status={agent.status} /> {statusLabel(agent.status)}</div></div><div className="mt-5 text-sm font-medium">{agent.name}</div><div className="mt-1 text-[10px] uppercase tracking-[.16em] text-white/35">{agent.department}</div><div className="mt-2 line-clamp-2 text-[11px] leading-4 text-white/45">{agent.detail}</div>{agent.output && <div className="mt-3 flex items-center gap-1 text-[10px] text-[#e99472]">View work <ChevronDown className="h-3 w-3" /></div>}{expanded === agent.id && agent.output && <div className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-5 text-white/70">{agent.output}</div>}</button>; })}</div>
        </section>}

        {error && <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</section>}

        {final && <section className="mt-6 rounded-3xl border border-black/8 bg-white p-5 shadow-sm md:p-8"><div className="flex items-center justify-between"><div><div className="text-[10px] font-semibold uppercase tracking-[.24em] text-[#8b948d]">Chief deliverable</div><h2 className="mt-1 text-2xl font-semibold tracking-tight">Mission complete</h2></div><div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Saved to memory</div></div><div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-[#465049]">{final}</div></section>}

        <section className="mt-8 rounded-3xl border border-black/7 bg-white p-5 md:p-6"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4" /><div className="text-sm font-semibold">Phase 2 is live</div></div><div className="mt-3 grid gap-3 text-xs leading-5 text-[#667168] md:grid-cols-3"><div>Independent agents execute in parallel instead of waiting one-by-one.</div><div>Missions, tasks and agent runs persist in Neon and survive refreshes.</div><div>Critical missing inputs pause the mission and ask you instead of hallucinating.</div></div></section>
      </div>
    </main>
  );
}

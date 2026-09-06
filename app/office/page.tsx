"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Loader2,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  XCircle,
} from "lucide-react";

type AgentStatus = "standby" | "queued" | "working" | "completed" | "blocked" | "failed";

type PlanTask = {
  id: string;
  agent: string;
  title: string;
  instruction: string;
  dependsOn: string[];
};

type OfficePlan = {
  missionType: string;
  objective: string;
  summary: string;
  tasks: PlanTask[];
};

type AgentView = {
  id: string;
  name: string;
  emoji: string;
  department: string;
  status: AgentStatus;
  detail: string;
  output?: string;
};

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

function statusLabel(status: AgentStatus) {
  if (status === "working") return "Working";
  if (status === "queued") return "Queued";
  if (status === "completed") return "Done";
  if (status === "blocked") return "Needs attention";
  if (status === "failed") return "Failed";
  return "Standby";
}

function StatusIcon({ status }: { status: AgentStatus }) {
  if (status === "working") return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "blocked") return <ShieldAlert className="h-3.5 w-3.5" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5" />;
  return <CircleDashed className="h-3.5 w-3.5" />;
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
  const [agents, setAgents] = useState<Record<string, AgentView>>(() =>
    Object.fromEntries(roster.map((agent) => [agent.id, { ...agent, status: "standby" as AgentStatus, detail: "Ready when needed" }])),
  );

  const activeAgents = useMemo(() => Object.values(agents).filter((agent) => agent.status !== "standby"), [agents]);
  const workingCount = useMemo(() => activeAgents.filter((agent) => agent.status === "working").length, [activeAgents]);
  const attentionCount = useMemo(() => activeAgents.filter((agent) => ["blocked", "failed"].includes(agent.status)).length, [activeAgents]);
  const completedCount = useMemo(() => activeAgents.filter((agent) => agent.status === "completed").length, [activeAgents]);

  function resetRun() {
    setPlan(null);
    setFinal("");
    setError("");
    setGrounded(false);
    setSourceCount(0);
    setExpanded(null);
    setAgents(Object.fromEntries(roster.map((agent) => [agent.id, { ...agent, status: "standby" as AgentStatus, detail: "Ready when needed" }])));
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

  async function runMission(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = mission.trim();
    if (!trimmed || running) return;

    resetRun();
    setRunning(true);

    try {
      const response = await fetch("/api/office/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ mission: trimmed, grounded: true, maxAgents: 6 }),
      });

      if (!response.ok || !response.body) {
        const detail = await response.text();
        throw new Error(detail || "Mission could not be started.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame
            .split("\n")
            .find((line) => line.startsWith("data:"))
            ?.slice(5)
            .trim();

          if (data) {
            const payload = JSON.parse(data);
            if (payload.type === "agent") applyAgentEvent(payload);
            if (payload.type === "plan") setPlan(payload.plan as OfficePlan);
            if (payload.type === "context") {
              setGrounded(Boolean(payload.grounded));
              setSourceCount(Array.isArray(payload.sources) ? payload.sources.length : 0);
            }
            if (payload.type === "done") setFinal(String(payload.final || ""));
            if (payload.type === "error") throw new Error(String(payload.error || "Mission failed."));
          }

          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (missionError) {
      setError(missionError instanceof Error ? missionError.message : "Mission failed unexpectedly.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#08100d] text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white" aria-label="Back to KretivOS">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-lime-300/70">KretivOS</p>
              <h1 className="text-sm font-semibold text-zinc-100">The Office</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-lime-300/15 bg-lime-300/5 px-3 py-1.5 text-[11px] text-lime-200/80">
            <span className={`h-2 w-2 rounded-full ${running ? "animate-pulse bg-lime-300" : "bg-lime-300/60"}`} />
            {running ? "Team at work" : "Office ready"}
          </div>
        </div>

        <section className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,.95fr)] lg:items-start">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-lime-300/60">Your ideas. A whole team behind them.</p>
            <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Give KretivOS one objective.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">Chief assembles only the specialists needed, runs the work in dependency order, sends factual tasks through research tools, reviews the result, then returns one decision-ready deliverable.</p>

            <form onSubmit={runMission} className="mt-8 rounded-3xl border border-white/10 bg-[#0d1713] p-3 shadow-2xl shadow-black/20">
              <textarea
                value={mission}
                onChange={(event) => setMission(event.target.value)}
                placeholder="Describe a goal, client, project or problem…"
                className="min-h-40 w-full resize-none rounded-2xl bg-transparent px-4 py-4 text-base leading-7 text-zinc-100 outline-none placeholder:text-zinc-600"
              />
              <div className="flex items-center justify-between gap-3 border-t border-white/8 px-2 pt-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Sparkles className="h-3.5 w-3.5 text-lime-300/70" />
                  Chief chooses up to 6 specialists
                </div>
                <button
                  type="submit"
                  disabled={!mission.trim() || running}
                  className="inline-flex items-center gap-2 rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-semibold text-[#0b120f] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {running ? "Running" : "Start mission"}
                  {!running && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            </form>

            {!mission && (
              <div className="mt-4 flex flex-wrap gap-2">
                {examples.map((example, index) => (
                  <button key={example} type="button" onClick={() => setMission(example)} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-zinc-400 transition hover:border-lime-300/20 hover:bg-lime-300/5 hover:text-zinc-200">
                    Example {index + 1}
                  </button>
                ))}
              </div>
            )}

            {error && <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{error}</div>}

            {plan && (
              <div className="mt-7 rounded-3xl border border-white/10 bg-[#0b1411] p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime-300/10 text-lime-200"><Target className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-300/60">Mission plan</p>
                    <h3 className="mt-1 text-lg font-semibold text-white">{plan.objective}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{plan.summary}</p>
                  </div>
                </div>
                <div className="mt-5 space-y-2">
                  {plan.tasks.map((task, index) => (
                    <div key={task.id} className="flex gap-3 rounded-2xl border border-white/7 bg-white/[0.025] px-4 py-3">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/5 text-[11px] font-semibold text-zinc-500">{index + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200">{task.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">{agents[task.agent]?.name || task.agent}{task.dependsOn.length ? ` · after ${task.dependsOn.join(", ")}` : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:sticky lg:top-5">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Agents at work" value={`${workingCount}/${activeAgents.length || roster.length}`} icon={<Users className="h-4 w-4" />} />
              <Metric label="Completed" value={String(completedCount)} icon={<CheckCircle2 className="h-4 w-4" />} />
              <Metric label="Needs attention" value={String(attentionCount)} icon={<ShieldAlert className="h-4 w-4" />} />
              <Metric label="Grounding" value={grounded ? `${sourceCount} sources` : "General"} icon={<Bot className="h-4 w-4" />} />
            </div>

            <div className="mt-3 overflow-hidden rounded-3xl border border-white/10 bg-[#0b1411] shadow-2xl shadow-black/20">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><span className="h-2 w-2 rounded-full bg-lime-300" />The office floor</div>
                <span className="text-xs text-zinc-600">Live status</span>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-[radial-gradient(circle_at_50%_0%,rgba(163,230,53,.055),transparent_42%)] p-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
                {roster.map((rosterAgent) => {
                  const agent = agents[rosterAgent.id];
                  const isActive = agent.status !== "standby";
                  return (
                    <button
                      type="button"
                      key={agent.id}
                      onClick={() => isActive && setExpanded(expanded === agent.id ? null : agent.id)}
                      className={`min-h-28 rounded-2xl border p-3 text-left transition ${agent.status === "working" ? "border-lime-300/30 bg-lime-300/[0.07] shadow-lg shadow-lime-950/20" : agent.status === "failed" || agent.status === "blocked" ? "border-amber-300/20 bg-amber-300/[0.04]" : isActive ? "border-white/10 bg-white/[0.035]" : "border-white/[0.055] bg-black/10 opacity-55"}`}
                    >
                      <div className={`mb-3 text-2xl ${agent.status === "working" ? "animate-pulse" : ""}`}>{agent.emoji}</div>
                      <p className="truncate text-xs font-semibold text-zinc-200">{agent.name}</p>
                      <div className={`mt-1 flex items-center gap-1 text-[10px] ${agent.status === "working" ? "text-lime-300" : agent.status === "completed" ? "text-emerald-300/80" : agent.status === "blocked" || agent.status === "failed" ? "text-amber-300" : "text-zinc-600"}`}>
                        <StatusIcon status={agent.status} />{statusLabel(agent.status)}
                      </div>
                    </button>
                  );
                })}
              </div>

              {expanded && agents[expanded] && agents[expanded].status !== "standby" && (
                <div className="border-t border-white/10 bg-black/10 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{agents[expanded].emoji} {agents[expanded].name}</p>
                      <p className="mt-1 text-xs text-zinc-500">{agents[expanded].detail}</p>
                    </div>
                    <button type="button" onClick={() => setExpanded(null)} className="text-zinc-600 hover:text-zinc-300"><ChevronDown className="h-4 w-4" /></button>
                  </div>
                  {agents[expanded].output && <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/8 bg-black/20 p-4 font-sans text-xs leading-6 text-zinc-400">{agents[expanded].output}</pre>}
                </div>
              )}
            </div>
          </div>
        </section>

        {final && (
          <section className="rounded-3xl border border-lime-300/15 bg-gradient-to-b from-lime-300/[0.055] to-transparent p-5 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-lime-300 text-[#0b120f]"><Sparkles className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300/70">Chief deliverable</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Mission complete</h3>
              </div>
            </div>
            <pre className="mt-6 whitespace-pre-wrap font-sans text-sm leading-7 text-zinc-300 sm:text-[15px]">{final}</pre>
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b1411] p-4">
      <div className="flex items-center justify-between gap-2 text-zinc-600">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em]">{label}</p>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">{value}</p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, FileText, Loader2, RefreshCw, ShieldAlert, Sparkles, Star } from "lucide-react";

export default function MissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [rating, setRating] = useState(0);

  async function load() {
    setLoading(true);
    try { const r = await fetch(`/api/office/history?id=${encodeURIComponent(id)}`, { cache: "no-store" }); const p = await r.json(); if (r.ok) setData(p); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [id]);

  async function retry(taskKey: string) {
    const note = (feedback[taskKey] || "").trim();
    if (!note) return;
    setRetrying(taskKey);
    try {
      await fetch("/api/office/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ missionId: id, taskKey, feedback: note }) });
      setFeedback((current) => ({ ...current, [taskKey]: "" }));
      await load();
    } finally { setRetrying(null); }
  }

  async function resolveApproval(approvalId: string, decision: "approve" | "reject") {
    await fetch("/api/office/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: approvalId, decision, execute: decision === "approve" }) });
    await load();
  }

  async function sendRating(value: number) {
    setRating(value);
    await fetch("/api/office/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "mission", targetId: id, rating: value }) });
  }

  if (loading && !data) return <main className="min-h-screen bg-[#111413] text-white"><div className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-12 text-sm text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading mission…</div></main>;
  if (!data) return <main className="min-h-screen bg-[#111413] p-8 text-white">Mission not found.</main>;

  const mission = data.mission || {};
  const pending = (data.approvals || []).filter((item: any) => item.status === "pending");
  return <main className="min-h-screen bg-[#111413] text-white">
    <header className="border-b border-white/8 bg-[#111413]/90"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-7"><Link href="/office" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"><ArrowLeft className="h-4 w-4" /> AI Office</Link><button onClick={() => void load()} className="rounded-lg border border-white/10 p-2"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div></header>
    <div className="mx-auto max-w-7xl px-4 py-7 md:px-7">
      <section className="rounded-[28px] border border-white/8 bg-[#191d1b] p-5 md:p-7"><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-[10px] uppercase tracking-[.2em] text-[#d8ff53]">{mission.workspace_name || "General workspace"}</div><h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-[-.03em] md:text-5xl">{mission.objective || mission.title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/40">{mission.summary || mission.mission}</p></div><div className="grid min-w-[280px] grid-cols-2 gap-2"><Stat label="Status" value={String(mission.status || "").replaceAll("_", " ")} /><Stat label="Quality" value={mission.quality_score ? `${mission.quality_score}/100` : "—"} /><Stat label="Budget" value={String(mission.budget_mode || "balanced").replaceAll("_", " ")} /><Stat label="Artifacts" value={String(data.artifacts?.length || 0)} /></div></div></section>

      {pending.length > 0 && <section className="mt-5 rounded-[24px] border border-amber-300/20 bg-amber-300/[.05] p-5"><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-300" /><h2 className="text-sm font-semibold">Approval required</h2></div><div className="mt-3 grid gap-2 md:grid-cols-2">{pending.map((item: any) => <div key={item.id} className="rounded-xl border border-white/8 bg-black/15 p-3"><div className="text-xs font-medium">{item.title}</div><div className="mt-1 text-[10px] text-white/35">{item.summary}</div><div className="mt-3 flex gap-2"><button onClick={() => void resolveApproval(item.id, "approve")} className="rounded-lg bg-[#d8ff53] px-3 py-2 text-[10px] font-semibold text-black">Approve & execute</button><button onClick={() => void resolveApproval(item.id, "reject")} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-white/50">Reject</button></div></div>)}</div></section>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-[24px] border border-white/8 bg-[#181c1a] p-5"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#d8ff53]" /><h2 className="text-lg font-semibold">Agent workstreams</h2></div><div className="mt-4 space-y-3">{(data.tasks || []).map((task: any) => <div key={task.task_key} className={`rounded-2xl border p-4 ${task.stale ? "border-amber-300/20 bg-amber-300/[.035]" : "border-white/8 bg-white/[.025]"}`}><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold">{task.title}</div><div className="mt-1 text-[10px] uppercase tracking-[.14em] text-white/25">{task.agent_id} · {task.status}{task.retry_count ? ` · revision ${task.retry_count}` : ""}</div></div>{task.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Clock3 className="h-4 w-4 text-white/25" />}</div>{task.output && <div className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/20 p-3 text-[11px] leading-5 text-white/55">{task.output}</div>}<div className="mt-3 flex gap-2"><input value={feedback[task.task_key] || ""} onChange={(e) => setFeedback((current) => ({ ...current, [task.task_key]: e.target.value }))} placeholder="Give feedback and rerun only this agent…" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[10px] outline-none" /><button onClick={() => void retry(task.task_key)} disabled={!feedback[task.task_key]?.trim() || retrying === task.task_key} className="rounded-lg border border-[#d8ff53]/25 px-3 py-2 text-[10px] text-[#d8ff53] disabled:opacity-30">{retrying === task.task_key ? "Running…" : "Rerun"}</button></div></div>)}</div></section>

        <div className="space-y-5"><section className="rounded-[24px] border border-white/8 bg-[#181c1a] p-5"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-[#d8ff53]" /><h2 className="text-lg font-semibold">Deliverables</h2></div><div className="mt-4 space-y-2">{(data.artifacts || []).map((item: any) => <div key={item.id} className="rounded-xl border border-white/8 bg-white/[.025] p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-medium">{item.title}</div><div className="mt-1 text-[10px] text-white/30">{item.artifact_type.replaceAll("_", " ")} · v{item.version}</div></div><span className="rounded-full bg-white/[.05] px-2 py-1 text-[9px] text-white/40">{item.status.replaceAll("_", " ")}</span></div>{item.destination && <div className="mt-2 text-[10px] text-emerald-300">Executed → {item.destination}</div>}</div>)}</div></section>
        <section className="rounded-[24px] border border-white/8 bg-[#181c1a] p-5"><h2 className="text-lg font-semibold">Mission timeline</h2><div className="mt-4 space-y-3">{(data.events || []).map((event: any) => <div key={event.id} className="flex gap-3"><div className="mt-1 h-2 w-2 rounded-full bg-[#d8ff53]" /><div><div className="text-xs capitalize">{String(event.event_type).replaceAll(".", " ")}</div><div className="mt-1 text-[10px] text-white/25">{new Date(event.created_at).toLocaleString("en-MY")}</div></div></div>)}</div></section>
        <section className="rounded-[24px] border border-white/8 bg-[#181c1a] p-5"><div className="text-xs font-medium">Rate this mission</div><div className="mt-3 flex gap-1">{[1,2,3,4,5].map((value) => <button key={value} onClick={() => void sendRating(value)} className="p-1"><Star className={`h-5 w-5 ${value <= rating ? "fill-[#d8ff53] text-[#d8ff53]" : "text-white/20"}`} /></button>)}</div><p className="mt-2 text-[10px] leading-5 text-white/30">Ratings feed the Phase 5 agent-performance layer.</p></section></div>
      </div>

      {mission.final_output && <section className="mt-5 rounded-[24px] bg-[#f3f3ed] p-5 text-[#20251f] md:p-7"><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-black/35">Chief final</div><div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-black/65">{mission.final_output}</div></section>}
    </div>
  </main>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-white/[.025] p-3"><div className="text-[9px] uppercase tracking-[.14em] text-white/25">{label}</div><div className="mt-1 truncate text-sm font-medium capitalize">{value}</div></div>;
}

"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  ArrowLeft, CheckCircle2, Clock3, FileText, Loader2, RefreshCw, ShieldAlert,
  Sparkles, Star, History, ArrowRight, Boxes, RotateCcw, Coins, Braces,
} from "lucide-react";
import OfficeRichText from "@/components/office-rich-text";
import PersistedTaskList from "../../PersistedTaskList";

export default function MissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [rating, setRating] = useState(0);
  const [error, setError] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/office/history?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load this mission.");
      setData(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load this mission."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [id]);

  async function retry(taskKey: string) {
    const note = (feedback[taskKey] || "").trim();
    if (!note) return;
    setRetrying(taskKey);
    setError("");
    try {
      const response = await fetch("/api/office/retry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId: id, taskKey, feedback: note }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "The task could not be revised. Your feedback has been kept.");
      setFeedback((current) => ({ ...current, [taskKey]: "" }));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Task revision failed."); }
    finally { setRetrying(null); }
  }

  async function resolveApproval(approvalId: string, decision: "approve" | "reject") {
    if (approvalBusy) return;
    setApprovalBusy(true); setError("");
    try {
    const response = await fetch("/api/office/approvals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: approvalId, decision, execute: decision === "approve" }),
    });
    if (!response.ok) throw new Error((await response.json()).error || "Approval could not be saved.");
    await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Approval failed."); }
    finally { setApprovalBusy(false); }
  }

  async function sendRating(value: number) {
    setError("");
    try {
    const response = await fetch("/api/office/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "mission", targetId: id, rating: value }),
    });
    if (!response.ok) throw new Error("Rating could not be saved.");
    setRating(value);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Rating could not be saved."); }
  }

  if (loading && !data) return <main className="min-h-screen bg-[#0c100d] text-white"><div className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-12 text-sm text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading mission…</div></main>;
  if (!data) return <main className="min-h-screen bg-[#0c100d] p-8 text-white"><p role="alert">{error || "Mission not found."}</p><Link href="/office" className="mt-4 inline-flex min-h-11 items-center underline">Back to office</Link></main>;

  const mission = data.mission || {};
  const pending = (data.approvals || []).filter((item: any) => item.status === "pending");
  const artifacts = data.artifacts || [];
  const tasks = data.tasks || [];
  const hasRevisions = tasks.some((task: { retry_count?: number; stale?: boolean }) => task.stale || Number(task.retry_count) > 0);
  const events = data.events || [];
  const totalEvidence = artifacts.reduce((sum: number, item: any) => sum + (Array.isArray(item.evidence) ? item.evidence.length : 0), 0);
  const totalTokens = Number(mission.total_tokens || 0);
  const estimatedCost = Number(mission.estimated_cost || 0);

  return <main className="min-h-screen bg-[#0c100d] text-white">
    <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#0c100d]/95 backdrop-blur-xl"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-7"><Link href="/office" className="inline-flex items-center gap-2 text-[11px] text-white/55 hover:text-white"><ArrowLeft className="h-4 w-4" /> AI Office</Link><button type="button" aria-label="Refresh mission" disabled={loading} onClick={() => void load()} className="rounded-xl border border-white/10 bg-white/[.03] p-2"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div></header>

    <div className="mx-auto max-w-7xl px-4 py-5 md:px-7 md:py-7">
      {error && <p role="alert" className="mb-4 rounded-xl border border-amber-300/30 p-4 text-sm text-amber-200">{error}</p>}
      {hasRevisions && <p role="status" className="mb-4 rounded-xl border border-amber-300/30 p-4 text-sm leading-6 text-amber-200">Specialist work has revisions. Check outputs marked stale before using them. Task revisions do not automatically regenerate Chief’s saved final result; use “Continue as new mission” if the overall recommendation needs updating.</p>}
      <section className="rounded-[28px] border border-white/[.08] bg-[#141815] p-5 md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[.2em] text-[#d9ff62]">{mission.workspace_name || "General workspace"}</div>
            <h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-[-.035em] md:text-5xl">{mission.objective || mission.title}</h1>
            <p className="mt-3 max-w-3xl text-[11px] leading-6 text-white/38 md:text-sm">{mission.summary || mission.mission}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/office?workspace=${encodeURIComponent(mission.workspace_id || "")}&mission=${encodeURIComponent(`Continue from mission: ${mission.objective || mission.title}. Review what changed, preserve valid evidence, and improve the next actions.`)}`} className="inline-flex items-center gap-1.5 rounded-xl border border-[#d9ff62]/20 bg-[#d9ff62]/[.05] px-3 py-2 text-[9px] text-[#d9ff62]">Continue as new mission <ArrowRight className="h-3 w-3" /></Link>
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:min-w-[320px]">
            <Stat label="Status" value={String(mission.status || "").replaceAll("_", " ")} />
            <Stat label="Quality" value={mission.quality_score ? `${mission.quality_score}/100` : "—"} />
            <Stat label="Deliverables" value={String(artifacts.length)} />
            <Stat label="Evidence" value={String(totalEvidence)} />
            <Stat label="Tokens" value={totalTokens ? totalTokens.toLocaleString("en-MY") : "—"} icon={<Braces className="h-3 w-3" />} />
            <Stat label="Est. cost" value={estimatedCost > 0 ? `$${estimatedCost.toFixed(4)}` : "—"} icon={<Coins className="h-3 w-3" />} />
          </div>
        </div>
      </section>

      {mission.final_output && <section className="mt-4 overflow-hidden rounded-[28px] bg-[#f1f2ea] p-5 text-[#182018] md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[.18em] text-black/35">Chief final</div><h2 className="mt-1 text-xl font-semibold tracking-[-.02em] md:text-2xl">Decision-ready outcome</h2></div>{mission.quality_score && <div className="inline-flex items-center gap-1 rounded-full bg-black/[.06] px-2.5 py-1 text-[9px]"><Star className="h-3 w-3 fill-current" /> {mission.quality_score}/100</div>}</div>
        <div className="mt-4"><OfficeRichText content={mission.final_output} tone="light" /></div>
      </section>}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-[24px] border border-white/[.07] bg-[#141815] p-4 md:p-5">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Boxes className="h-4 w-4 text-[#d9ff62]" /><div><div className="text-[8px] uppercase tracking-[.17em] text-white/25">Deliverables</div><h2 className="text-[15px] font-semibold">What the room produced</h2></div></div><span className="rounded-full bg-white/[.04] px-2 py-1 text-[8px] text-white/30">{artifacts.length}</span></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{artifacts.map((item: any) => <div key={item.id} className="rounded-xl border border-white/[.07] bg-white/[.018] p-3"><div className="flex items-start gap-2"><FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d9ff62]" /><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-medium">{item.title}</div><div className="mt-1 text-[8px] text-white/28">{String(item.artifact_type).replaceAll("_", " ")} · v{item.version}</div><div className="mt-2 flex flex-wrap gap-1.5"><span className="inline-flex rounded-full bg-white/[.04] px-2 py-1 text-[8px] text-white/36">{String(item.status).replaceAll("_", " ")}</span>{Array.isArray(item.evidence) && item.evidence.length > 0 && <span className="inline-flex rounded-full bg-sky-400/[.07] px-2 py-1 text-[8px] text-sky-200/70">{item.evidence.length} evidence</span>}</div>{item.destination && <div className="mt-2 text-[8px] text-emerald-300">Executed → {item.destination}</div>}</div></div></div>)}{!artifacts.length && <Empty text="No deliverables yet." />}</div>
        </section>

        <section className="rounded-[24px] border border-white/[.07] bg-[#141815] p-4 md:p-5">
          <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-300" /><div><div className="text-[8px] uppercase tracking-[.17em] text-white/25">Action center</div><h2 className="text-[15px] font-semibold">Approvals & execution</h2></div></div>
          <div className="mt-4 space-y-2">{pending.map((item: any) => <div key={item.id} className="rounded-xl border border-amber-300/12 bg-amber-300/[.035] p-3"><div className="text-[10px] font-medium">{item.title}</div><div className="mt-1 text-[8px] leading-4 text-white/32">{item.summary}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={approvalBusy} onClick={() => void resolveApproval(item.id, "approve")} className="rounded-lg bg-[#d9ff62] px-3 py-2 text-[9px] font-semibold text-black">Approve & execute</button><button type="button" disabled={approvalBusy} onClick={() => void resolveApproval(item.id, "reject")} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] text-white/45">Reject</button></div></div>)}{!pending.length && <Empty text="Nothing waiting for approval." />}</div>
          <div className="mt-4 rounded-xl border border-white/[.06] bg-black/15 p-3"><div className="text-[9px] font-medium">After approval</div><p className="mt-1 text-[8px] leading-4 text-white/30">Approved artifacts are pushed into Funnel Builder, Documents, Projects or Knowledge and stay linked back to this mission.</p></div>
        </section>
      </div>

      <div className="mt-4"><PersistedTaskList tasks={tasks} retrying={retrying} feedback={feedback} setFeedback={setFeedback} onRetry={key => void retry(key)} /></div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_.55fr]">
        <section className="rounded-[24px] border border-white/[.07] bg-[#141815] p-4 md:p-5"><div className="flex items-center gap-2"><History className="h-4 w-4 text-[#d9ff62]" /><h2 className="text-[15px] font-semibold">Mission timeline</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{events.map((event: any) => <div key={event.id} className="flex gap-3"><div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#d9ff62]" /><div><div className="text-[9px] capitalize">{String(event.event_type).replaceAll(".", " ")}</div><div className="mt-1 text-[8px] text-white/25">{new Date(event.created_at).toLocaleString("en-MY")}</div></div></div>)}</div></section>
        <section className="rounded-[24px] border border-white/[.07] bg-[#141815] p-4 md:p-5"><div className="text-[10px] font-medium">Rate this mission</div><div className="mt-3 flex gap-1">{[1,2,3,4,5].map((value) => <button key={value} type="button" aria-label={`Rate mission ${value} out of 5`} aria-pressed={value === rating} onClick={() => void sendRating(value)} className="min-h-11 min-w-11 p-1"><Star className={`h-5 w-5 ${value <= rating ? "fill-[#d8ff53] text-[#d8ff53]" : "text-white/20"}`} /></button>)}</div><p className="mt-2 text-[8px] leading-4 text-white/30">Ratings feed the AI Office learning and specialist-performance layer.</p><Link href="/office" className="mt-4 inline-flex items-center gap-1.5 text-[9px] text-[#d9ff62]">Back to classroom <ArrowRight className="h-3 w-3" /></Link></section>
      </div>
    </div>
  </main>;
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-3"><div className="flex items-center justify-between gap-2 text-[8px] uppercase tracking-[.14em] text-white/25"><span>{label}</span>{icon}</div><div className="mt-1 truncate text-[12px] font-medium capitalize">{value}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-[9px] text-white/30">{text}</div>;
}

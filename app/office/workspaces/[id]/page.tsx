"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, Building2, ChevronRight, FileText, Loader2, Sparkles, Target } from "lucide-react";

export default function OfficeWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mission, setMission] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/office/workspaces?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        const payload = await response.json();
        if (active && response.ok) setData(payload);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [id]);

  if (loading) return <main className="min-h-screen bg-[#111413] p-8 text-white"><div className="flex items-center gap-2 text-sm text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading client memory…</div></main>;
  if (!data) return <main className="min-h-screen bg-[#111413] p-8 text-white">Workspace not found.</main>;

  const workspace = data.workspace || {};
  const startHref = mission.trim() ? `/office?workspace=${encodeURIComponent(id)}&mission=${encodeURIComponent(mission.trim())}` : `/office?workspace=${encodeURIComponent(id)}`;
  return <main className="min-h-screen bg-[#111413] text-white">
    <header className="border-b border-white/8"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-7"><Link href="/office" className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-white"><ArrowLeft className="h-4 w-4" /> AI Office</Link><span className="text-[10px] uppercase tracking-[.18em] text-[#d8ff53]">Client workspace</span></div></header>
    <div className="mx-auto max-w-7xl px-4 py-7 md:px-7">
      <section className="rounded-[28px] border border-white/8 bg-[#191d1b] p-5 md:p-7"><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d8ff53] text-black"><Building2 className="h-5 w-5" /></div><h1 className="mt-5 text-3xl font-semibold tracking-[-.035em] md:text-5xl">{workspace.name}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/40">{workspace.summary || workspace.brand_description || workspace.customer_notes || "Persistent memory for this client's missions, deliverables and lessons."}</p><div className="mt-4 flex flex-wrap gap-2 text-[10px] text-white/35">{workspace.industry && <span className="rounded-full border border-white/10 px-2.5 py-1">{workspace.industry}</span>}{workspace.brand_name && <span className="rounded-full border border-white/10 px-2.5 py-1">Brand: {workspace.brand_name}</span>}{workspace.customer_status && <span className="rounded-full border border-white/10 px-2.5 py-1">{workspace.customer_status}</span>}</div></div><div className="grid min-w-[260px] grid-cols-2 gap-2"><Metric label="Missions" value={data.missions?.length || 0} /><Metric label="Artifacts" value={data.artifacts?.length || 0} /></div></div></section>

      <section className="mt-5 rounded-[24px] border border-[#d8ff53]/15 bg-[#d8ff53]/[.04] p-5"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#d8ff53]" /><div className="text-sm font-semibold">Start from this client's memory</div></div><div className="mt-3 flex flex-col gap-2 md:flex-row"><input value={mission} onChange={(e) => setMission(e.target.value)} placeholder="e.g. Sales dropped this month — diagnose and build recovery plan…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs outline-none" /><Link href={startHref} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d8ff53] px-4 py-3 text-xs font-semibold text-black">Open in AI Office <ChevronRight className="h-3.5 w-3.5" /></Link></div></section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-[24px] border border-white/8 bg-[#181c1a] p-5"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-[#d8ff53]" /><h2 className="text-lg font-semibold">Mission history</h2></div><div className="mt-4 space-y-2">{(data.missions || []).map((item: any) => <Link key={item.id} href={`/office/missions/${item.id}`} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[.025] p-3 transition hover:bg-white/[.05]"><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{item.objective || item.title}</div><div className="mt-1 text-[10px] text-white/30">{String(item.status).replaceAll("_", " ")} · {item.artifact_count || 0} artifacts</div></div>{item.quality_score && <span className="rounded-full bg-[#d8ff53]/10 px-2 py-1 text-[9px] text-[#d8ff53]">{item.quality_score}/100</span>}<ChevronRight className="h-3.5 w-3.5 text-white/20" /></Link>)}{!data.missions?.length && <Empty text="No missions yet for this client." />}</div></section>

        <section className="rounded-[24px] border border-white/8 bg-[#181c1a] p-5"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-[#d8ff53]" /><h2 className="text-lg font-semibold">Reusable deliverables</h2></div><div className="mt-4 space-y-2">{(data.artifacts || []).map((item: any) => <Link key={item.id} href={`/office/missions/${item.mission_id}`} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[.025] p-3 transition hover:bg-white/[.05]"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[.05]"><FileText className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{item.title}</div><div className="mt-1 text-[10px] text-white/30">{String(item.artifact_type).replaceAll("_", " ")} · {String(item.status).replaceAll("_", " ")}</div></div><ChevronRight className="h-3.5 w-3.5 text-white/20" /></Link>)}{!data.artifacts?.length && <Empty text="No reusable artifacts yet." />}</div></section>
      </div>
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-white/8 bg-white/[.025] p-4"><div className="text-[9px] uppercase tracking-[.15em] text-white/25">{label}</div><div className="mt-2 text-3xl font-semibold">{value}</div></div>;
}
function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-white/30">{text}</div>; }

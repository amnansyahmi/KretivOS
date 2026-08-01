"use client";

import { useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function HRMSAIInsight({ task, period, metrics, context, label = "Review with AI" }: { task: "attendance_review" | "shift_review" | "payroll_review"; period: string; metrics: any[]; context?: string; label?: string }) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function review() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/hr/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, period, metrics, context }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI review failed.");
      setResult(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "AI review is unavailable."); }
    finally { setLoading(false); }
  }
  if (!result) return <Card className="border-[#d8d2c6] bg-[#f3efe7]"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#202c25] text-white"><BrainCircuit className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">KretivOS AI review</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Uses anonymised totals only. AI does not approve, reject, discipline or change payroll.</p>{error && <p className="mt-2 text-xs text-red-600">{error}</p>}</div><Button onClick={review} disabled={loading || !metrics.length}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}{loading ? "Reviewing…" : label}</Button></CardContent></Card>;
  return <Card className="overflow-hidden border-[#202c25]/15 bg-white"><CardContent className="p-0"><div className="flex items-start gap-3 bg-[#202c25] p-5 text-white"><BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-[#ef9a79]" /><div className="min-w-0 flex-1"><div className="text-[9px] font-semibold uppercase tracking-[.16em] text-white/45">{result.source === "ai-nonymauz-cloud" ? "AI-nonymauz-cloud" : "Safe fallback"}</div><h3 className="mt-1 font-semibold">{result.headline}</h3><p className="mt-2 text-xs leading-5 text-white/65">{result.summary}</p></div><Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={review} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Button></div><div className="grid gap-4 p-5 lg:grid-cols-2"><div className="space-y-2">{result.findings?.map((item: any, index: number) => <div key={index} className="rounded-xl border bg-[#fbfaf7] p-3"><div className="flex items-center gap-2 text-xs font-semibold">{item.severity === "important" ? <AlertTriangle className="h-4 w-4 text-red-500" /> : <CheckCircle2 className="h-4 w-4 text-[#ba5c42]" />}{item.title}</div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.detail}</p></div>)}</div><div><div className="text-xs font-semibold">Suggested human checks</div><ol className="mt-3 space-y-2">{result.actions?.map((item: string, index: number) => <li key={index} className="flex gap-2 text-xs leading-5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f1ece2] text-[9px] font-semibold">{index + 1}</span>{item}</li>)}</ol></div></div></CardContent></Card>;
}

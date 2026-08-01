"use client";

/**
 * Budget and forecast.
 *
 * Moved out of the dashboard and into Accounting, because a forecast nobody can
 * compare against actuals is a spreadsheet with opinions. It sat next to the
 * ledger claiming an annual income figure while the accounts said something
 * entirely different, and nothing related the two.
 *
 * It stays visually distinct and is never merged into the profit and loss: this
 * is what the team intends to happen, and the ledger is what did. The variance
 * between them is the only reason to keep both.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HandCoins, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/toast";
import { RowSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const money = (n: number) => `RM${Number(n || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;
const team = ["Amirul Hafiz", "Nurfadilah (Ila)", "Muhammad Afiq", "Amnan", "Ajam (Multazam)"];

const projectionRows = [
  { month: "Bulan 1", unitsWeek: 250, weekly: 500, monthly: 2000, incentive: 0, stage: "Warm-up" },
  { month: "Bulan 2", unitsWeek: 1250, weekly: 2500, monthly: 10000, incentive: 0, stage: "Scaling" },
  { month: "Bulan 3", unitsWeek: 2500, weekly: 5000, monthly: 20000, incentive: 2200, stage: "+ Insentif" },
  ...Array.from({ length: 9 }, (_, i) => ({ month: `Bulan ${i + 4}`, unitsWeek: 7500, weekly: 15000, monthly: 60000, incentive: 16500, stage: "Full speed" })),
];

function Stat({ label, value, note }: any) {
  return <Card className="bg-white/80"><CardContent className="p-5">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
    <div className="mt-2 text-xs text-muted-foreground">{note}</div>
  </CardContent></Card>;
}

/**
 * Shared scenario inputs. The sliders write through to Neon on release rather
 * than on every pixel of drag, so one adjustment is one round trip and the
 * numbers on screen stay live while it saves.
 */
function useProjectionScenario() {
  const { error: toastError } = useToast();
  const [scenario, setScenario] = useState({ companyPct: 10, members: 5, totalFees: 572000, totalIncentive: 150700 });
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projection", { cache: "no-store" })
      .then(response => response.json().then(payload => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => {
        if (cancelled) return;
        if (!ok || !payload.scenario) { setShared(false); return; }
        setScenario({
          companyPct: payload.scenario.companyPct,
          members: payload.scenario.members,
          totalFees: payload.scenario.totalFees,
          totalIncentive: payload.scenario.totalIncentive,
        });
      })
      .catch(() => { if (!cancelled) setShared(false); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const commit = useCallback(async (next: { companyPct: number; members: number }) => {
    if (!shared) return;
    try {
      const response = await fetch("/api/projection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Unable to save the scenario.");
    } catch (cause) {
      toastError(cause instanceof Error ? cause.message : "Unable to save the scenario.");
    }
  }, [shared, toastError]);

  return { scenario, setScenario, commit, loading, shared };
}

export function BudgetForecast() {
  const { scenario, setScenario, commit, loading, shared } = useProjectionScenario();
  const { companyPct, members, totalFees, totalIncentive } = scenario;
  const grand = totalFees + totalIncentive;
  const company = grand * companyPct / 100; const teamTotal = grand - company; const perPerson = teamTotal / members;
  const set = (patch: Partial<typeof scenario>) => setScenario(current => ({ ...current, ...patch }));

  return <div>
    <ForecastVsActual />

    {!loading && !shared && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      These inputs are not being shared with the team. Apply <code className="rounded bg-white/70 px-1">db/migrations/0007_shared_planner_projection.sql</code> to the Neon database.
    </div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="12-month Kretivco income" value={money(grand)} note="Fees + performance incentive" /><Stat label="Company / year" value={money(company)} note={`${companyPct}% of total`} /><Stat label="Team / year" value={money(teamTotal)} note={`${100 - companyPct}% distributed`} /><Stat label="Per person / year" value={money(perPerson)} note={`${members} team members`} /></div>
    <Card className="mt-5 bg-white/80"><CardContent className="grid gap-5 p-5 md:grid-cols-2"><label className="text-xs font-medium">Company share: {companyPct}%<input type="range" min="0" max="50" value={companyPct} onChange={e => set({ companyPct: Number(e.target.value) })} onPointerUp={() => commit({ companyPct, members })} onKeyUp={() => commit({ companyPct, members })} className="mt-3 w-full accent-accent" /></label><label className="text-xs font-medium">Team members: {members}<input type="range" min="1" max="10" value={members} onChange={e => set({ members: Number(e.target.value) })} onPointerUp={() => commit({ companyPct, members })} onKeyUp={() => commit({ companyPct, members })} className="mt-3 w-full accent-accent" /></label></CardContent></Card>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <Card className="overflow-hidden bg-white/80"><CardHeader><CardTitle>Monthly projection</CardTitle></CardHeader><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-background text-muted-foreground"><tr><th className="px-4 py-3">Month</th><th className="px-4 py-3 text-right">Units / week</th><th className="px-4 py-3 text-right">Fee / month</th><th className="px-4 py-3 text-right">Incentive</th><th className="px-4 py-3 text-right">Company</th><th className="px-4 py-3 text-right">Per person</th></tr></thead><tbody>{projectionRows.map(r => { const total = r.monthly + r.incentive, co = total * companyPct / 100, pp = (total - co) / members; return <tr key={r.month} className="border-t"><td className="px-4 py-3 font-medium">{r.month}<div className="text-[9px] text-muted-foreground">{r.stage}</div></td><td className="px-4 py-3 text-right">{r.unitsWeek.toLocaleString()}</td><td className="px-4 py-3 text-right">{money(r.monthly)}</td><td className="px-4 py-3 text-right">{r.incentive ? money(r.incentive) : "—"}</td><td className="px-4 py-3 text-right">{money(co)}</td><td className="px-4 py-3 text-right font-semibold">{money(pp)}</td></tr>})}</tbody></table></div></Card>
      <Card className="bg-foreground text-white"><CardHeader><CardTitle>Annual distribution</CardTitle></CardHeader><CardContent><div className="rounded-xl bg-white/5 p-4"><div className="text-xs text-white/45">Kretivco company allocation</div><div className="mt-2 text-3xl font-semibold">{money(company)}</div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-accent-muted" style={{ width: `${companyPct}%` }} /></div></div><div className="mt-5 space-y-3">{team.slice(0, members).map((x, i) => <div key={i} className="flex items-center justify-between border-b border-white/10 pb-3 text-sm"><span className="text-white/65">{x || `Member ${i + 1}`}</span><span className="font-medium">{money(perPerson)}</span></div>)}</div><div className="mt-5 rounded-lg border border-white/10 p-3 text-xs leading-relaxed text-white/55">Scenario reference: management fees {money(totalFees)} + incentive {money(totalIncentive)}. Marketplace surplus is excluded and can be added as a separate actual-data line.</div></CardContent></Card>
    </div>
  </div>;
}

/**
 * Forecast against what the ledger actually recorded.
 *
 * This is the whole reason the forecast belongs beside the accounts. On its own
 * it is a set of assumptions; next to the ledger it becomes a question — are we
 * ahead or behind, and by how much.
 *
 * Actuals are read from posted income only. Nothing here writes to the ledger,
 * and the forecast is never merged into the profit and loss.
 */
function ForecastVsActual() {
  const [actual, setActual] = useState<{ month: string; income: number }[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounting/reports", { cache: "no-store" })
      .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => {
        if (cancelled) return;
        if (!ok) { setUnavailable(true); return; }
        setActual([{ month: payload.range?.to?.slice(0, 7) ?? "", income: Number(payload.profitAndLoss?.totalIncome || 0) }]);
      })
      .catch(() => { if (!cancelled) setUnavailable(true); });
    return () => { cancelled = true; };
  }, []);

  if (unavailable) return null;

  const forecastToDate = projectionRows.slice(0, 12).reduce((sum, row) => sum + row.monthly + row.incentive, 0);
  const actualToDate = actual?.[0]?.income ?? 0;
  const variance = actualToDate - forecastToDate;
  const ahead = variance >= 0;

  return <Card className="mb-5 overflow-hidden bg-foreground text-white"><CardContent className="p-6">
    <div className="text-[10px] uppercase tracking-[.2em] text-white/45">Forecast against the ledger</div>
    {!actual && <div className="mt-4"><RowSkeleton rows={1} /></div>}
    {actual && <>
      <div className="mt-4 grid gap-5 sm:grid-cols-3">
        <div>
          <div className="text-xs text-white/45">Forecast, 12 months</div>
          <div className="mt-2 text-2xl font-semibold">{money(forecastToDate)}</div>
        </div>
        <div>
          <div className="text-xs text-white/45">Actually recorded</div>
          <div className="mt-2 text-2xl font-semibold">{money(actualToDate)}</div>
        </div>
        <div>
          <div className="text-xs text-white/45">Variance</div>
          <div className={cn("mt-2 flex items-center gap-2 text-2xl font-semibold", ahead ? "text-emerald-300" : "text-accent-muted")}>
            {ahead ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            {money(Math.abs(variance))}
          </div>
        </div>
      </div>
      <p className="mt-5 max-w-2xl text-[11px] leading-relaxed text-white/45">
        Actuals are posted income from the ledger over the reporting window; the forecast is the full
        twelve-month scenario below. They are deliberately never combined — this is what the team
        intends, and the accounts are what happened.
      </p>
    </>}
  </CardContent></Card>;
}

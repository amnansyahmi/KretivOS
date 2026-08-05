"use client";

/**
 * Leave, from the point of view of the person taking it.
 *
 * The leave screen was built for whoever approves: a flat list of requests with
 * Approve and Reject on each. An employee opening it saw their own requests and
 * nothing they actually wanted — not how many days they had left, and not
 * whether the week they were eyeing was already a public holiday or the week
 * two colleagues were away.
 *
 * So the same tab answers a different question depending on who is looking. The
 * balance first, because that is what decides whether to ask at all, then a
 * calendar, then the requests themselves.
 */

import { useMemo, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { entitlementFor, toLeaveRules, type LeaveTypeRule } from "@/lib/leave-entitlement";
import { cn } from "@/lib/utils";

const localDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const monthTitle = (value: string) => new Date(`${value}-01T00:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", month: "long", year: "numeric" });
const dateLabel = (value?: string) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" }) : "—";

function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * What is left of each entitlement this year.
 *
 * Pending requests are counted against the balance alongside approved ones. A
 * balance that ignores what you have already asked for invites asking twice for
 * days that only exist once.
 */
export function myLeaveBalances(rules: LeaveTypeRule[], employee: any, requests: any[], year: number) {
  return rules.filter((rule) => rule.deductsBalance).map((rule) => {
    const override = Number(employee?.leaveEntitlements?.[rule.name] || 0);
    const recorded = override > 0 ? override
      : rule.kind === "annual" ? Number(employee?.annualLeaveBalance || 0)
        : rule.kind === "sick" ? Number(employee?.medicalLeaveBalance || 0)
          : undefined;

    const { days: entitlement } = entitlementFor({
      rules, typeName: rule.name,
      startDate: String(employee?.startDate || ""),
      asOf: `${year}-12-31`,
      recordedDays: recorded,
    });

    const committed = requests
      .filter((item) => item.type === rule.name && String(item.startDate || "").startsWith(String(year)) && ["Pending", "Approved"].includes(item.status))
      .reduce((sum, item) => sum + Number(item.days || 0), 0);
    const taken = requests
      .filter((item) => item.type === rule.name && String(item.startDate || "").startsWith(String(year)) && item.status === "Approved")
      .reduce((sum, item) => sum + Number(item.days || 0), 0);

    return { name: rule.name, entitlement, taken, pending: committed - taken, remaining: Math.max(0, entitlement - committed) };
  });
}

export function HRMyLeave({ employee, requests, publicHolidays, settings, onCreate, onCancel, onEdit }: any) {
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const year = Number(localDate().slice(0, 4));
  const rules = useMemo(() => toLeaveRules(settings?.leaveTypes), [settings]);
  const balances = useMemo(() => myLeaveBalances(rules, employee, requests, year), [rules, employee, requests, year]);

  const holidays = useMemo(() => new Map<string, string>((publicHolidays || []).map((item: any) => [String(item.date), String(item.name)])), [publicHolidays]);
  const leaveDays = useMemo(() => {
    const map = new Map<string, { type: string; status: string }>();
    for (const request of requests) {
      if (!["Pending", "Approved"].includes(request.status)) continue;
      const start = String(request.startDate || "");
      const end = String(request.endDate || start);
      if (!start) continue;
      const cursor = new Date(`${start}T00:00:00Z`);
      const last = new Date(`${end}T00:00:00Z`);
      for (let guard = 0; guard < 400 && cursor <= last; guard += 1) {
        map.set(cursor.toISOString().slice(0, 10), { type: request.type, status: request.status });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    return map;
  }, [requests]);

  const [yearNumber, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(yearNumber, monthNumber - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(yearNumber, monthNumber, 0)).getUTCDate();
  const cells: (number | null)[] = Array.from({ length: firstDay + dayCount }, (_, index) => index < firstDay ? null : index - firstDay + 1);
  while (cells.length % 7) cells.push(null);
  const today = localDate();

  const upcoming = requests
    .filter((item: any) => ["Pending", "Approved"].includes(item.status) && String(item.endDate || item.startDate) >= today)
    .sort((a: any, b: any) => String(a.startDate).localeCompare(String(b.startDate)));

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{balances.map((balance) => <Card key={balance.name} className="border-black/8 bg-white/90"><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{balance.name}</div>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-2xl font-semibold">{balance.remaining}</span>
        <span className="mb-1 text-[10px] text-muted-foreground">of {balance.entitlement} days left</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5">
        <div className="h-full rounded-full bg-accent" style={{ width: `${balance.entitlement ? Math.min(100, (balance.entitlement - balance.remaining) / balance.entitlement * 100) : 0}%` }} />
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">{balance.taken} taken{balance.pending > 0 ? ` · ${balance.pending} awaiting approval` : ""}</div>
    </CardContent></Card>)}</div>

    <Card className="border-black/8 bg-white/90"><CardContent className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">My leave calendar</h2>
          <p className="mt-1 text-xs text-muted-foreground">Your approved and pending leave, and the public holidays you do not need to ask for.</p>
        </div>
        <Button size="sm" onClick={onCreate}><Plus className="h-3.5 w-3.5" />Apply for leave</Button>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-background p-2">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
        <button className="text-sm font-semibold" onClick={() => setMonth(localDate().slice(0, 7))}>{monthTitle(month)}</button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="px-1 py-2 text-center text-[9px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{day}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">{cells.map((day, index) => {
        if (!day) return <div key={`empty-${index}`} className="min-h-16 rounded-lg bg-black/[.015]" />;
        const date = `${month}-${String(day).padStart(2, "0")}`;
        const holiday = holidays.get(date);
        const leave = leaveDays.get(date);
        return <div key={date} className={cn("min-h-16 rounded-lg border bg-card p-1.5", date === today && "border-accent")}>
          <div className={cn("text-[10px] font-medium", date === today && "text-accent")}>{day}</div>
          {holiday && <div title={holiday} className="mt-1 truncate rounded bg-cat-holiday px-1 py-0.5 text-[8px] font-medium text-cat-holiday-foreground">{holiday}</div>}
          {leave && <div title={`${leave.type} · ${leave.status}`} className={cn("mt-1 truncate rounded px-1 py-0.5 text-[8px] font-medium", leave.status === "Approved" ? "bg-cat-leave text-cat-leave-foreground" : "bg-amber-100 text-amber-800")}>{leave.status === "Approved" ? leave.type : "Pending"}</div>}
        </div>;
      })}</div>
    </CardContent></Card>

    <Card className="border-black/8 bg-white/90"><CardContent className="p-5">
      <h2 className="font-semibold">My requests</h2>
      <div className="mt-4 space-y-2">
        {upcoming.length > 0 && <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Upcoming</div>}
        {[...upcoming, ...requests.filter((item: any) => !upcoming.includes(item))].map((item: any) => <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted"><CalendarCheck className="h-4 w-4 text-accent" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{item.type}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{dateLabel(item.startDate)} – {dateLabel(item.endDate)} · {item.days} day{item.days === 1 ? "" : "s"}{typeof item.balanceAfterRequest === "number" ? ` · ${item.balanceAfterRequest} left after this` : ""}</div>
            {item.approverNote && <div className="mt-1 text-[11px] text-muted-foreground">Note: {item.approverNote}</div>}
          </div>
          <StatusBadge value={item.status} />
          <div className="flex gap-2">
            {["Pending", "Rejected"].includes(item.status) && <Button size="sm" variant="outline" onClick={() => onEdit(item)}>Edit</Button>}
            {["Pending", "Approved"].includes(item.status) && <Button size="sm" variant="outline" onClick={() => onCancel(item.id)}>Cancel</Button>}
          </div>
        </div>)}
        {!requests.length && <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">You have not applied for any leave yet.</div>}
      </div>
    </CardContent></Card>
  </div>;
}

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
import { CalendarCheck, ChevronLeft, ChevronRight, Info, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { toLeaveRules } from "@/lib/leave-entitlement";
import { myLeaveBalances } from "@/lib/my-hr-summary";
import { describeLeaveDuration, shortLeaveLabel } from "@/lib/leave-request";
import { fixedHolidays, mergeHolidays, missingGazettedHolidays } from "@/lib/work-calendar";
import { cn } from "@/lib/utils";

const localDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const monthTitle = (value: string) => new Date(`${value}-01T00:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", month: "long", year: "numeric" });
const dateLabel = (value?: string) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" }) : "—";

function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function HRMyLeave({ employee, requests, publicHolidays, settings, onCreate, onCancel, onEdit }: any) {
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [selected, setSelected] = useState("");
  const year = Number(localDate().slice(0, 4));
  const rules = useMemo(() => toLeaveRules(settings?.leaveTypes), [settings]);
  const balances = useMemo(() => myLeaveBalances(rules, employee, requests, year), [rules, employee, requests, year]);

  /*
   * The configured list, plus the Malaysian holidays that fall on the same date
   * every year. Without the second half the calendar was simply blank until
   * somebody typed a year of dates in by hand, which is the state it was
   * actually shipped in. Configured entries always win — a state variation or a
   * company day was chosen deliberately.
   */
  const holidays = useMemo(() => {
    const configured = (publicHolidays || []).filter((item: any) => item?.date && item?.name);
    const seeded = fixedHolidays(Number(month.slice(0, 4)), String(settings?.attendance?.state || "Selangor"));
    const configuredDates = new Set(configured.map((item: any) => String(item.date)));
    return new Map<string, { name: string; confirmed: boolean }>(
      mergeHolidays(configured, seeded).map((item) => [item.date, { name: item.name, confirmed: configuredDates.has(item.date) }]),
    );
  }, [publicHolidays, month, settings]);

  /* The ones nobody can seed, so the gap is visible rather than discovered. */
  const missingHolidays = useMemo(
    () => missingGazettedHolidays((publicHolidays || []) as any, Number(month.slice(0, 4))),
    [publicHolidays, month],
  );
  const leaveDays = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const request of requests) {
      if (!["Pending", "Approved"].includes(request.status)) continue;
      const start = String(request.startDate || "");
      const end = String(request.endDate || start);
      if (!start) continue;
      const cursor = new Date(`${start}T00:00:00Z`);
      const last = new Date(`${end}T00:00:00Z`);
      for (let guard = 0; guard < 400 && cursor <= last; guard += 1) {
        const date = cursor.toISOString().slice(0, 10);
        map.set(date, [...(map.get(date) ?? []), request]);
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

      <div className="mt-4 grid grid-cols-7 gap-1">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="py-2 text-center text-[9px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{day}</div>)}</div>
      {/*
        * Every day is a button. On a phone there is no room to print what is on
        * a date inside a cell the width of a fingertip, so the cell carries a
        * dot and the detail opens underneath — which also gives the leave on
        * that day somewhere to be cancelled from.
        */}
      <div className="grid grid-cols-7 gap-1">{cells.map((day, index) => {
        if (!day) return <div key={`empty-${index}`} className="aspect-square rounded-lg bg-black/[.015] sm:min-h-16" />;
        const date = `${month}-${String(day).padStart(2, "0")}`;
        const holiday = holidays.get(date);
        const dayLeave = leaveDays.get(date) ?? [];
        const approved = dayLeave.find((item: any) => item.status === "Approved");
        const isSelected = selected === date;
        return <button
          key={date}
          type="button"
          onClick={() => setSelected(isSelected ? "" : date)}
          aria-label={`${dateLabel(date)}${holiday ? ` · ${holiday.name}` : ""}${dayLeave.length ? ` · ${dayLeave.length} leave request` : ""}`}
          aria-pressed={isSelected}
          className={cn(
            "flex aspect-square flex-col items-center rounded-lg border bg-card p-1 text-left transition sm:aspect-auto sm:min-h-16 sm:items-stretch sm:p-1.5",
            date === today && "border-accent",
            isSelected && "border-foreground ring-1 ring-foreground",
          )}
        >
          <span className={cn("text-[11px] font-medium sm:text-[10px]", date === today && "text-accent")}>{day}</span>
          {/* Phones get dots; there is room for words from the small breakpoint up. */}
          <span className="mt-auto flex gap-0.5 sm:hidden">
            {holiday && <span className="h-1.5 w-1.5 rounded-full bg-cat-holiday-foreground" />}
            {dayLeave.length > 0 && <span className={cn("h-1.5 w-1.5 rounded-full", approved ? "bg-cat-leave-foreground" : "bg-amber-500")} />}
          </span>
          <span className="hidden w-full sm:block">
            {holiday && <span className="mt-1 block truncate rounded bg-cat-holiday px-1 py-0.5 text-[8px] font-medium text-cat-holiday-foreground">{holiday.name}</span>}
            {dayLeave.map((item: any) => <span key={item.id} className={cn("mt-1 block truncate rounded px-1 py-0.5 text-[8px] font-medium", item.status === "Approved" ? "bg-cat-leave text-cat-leave-foreground" : "bg-amber-100 text-amber-800")}>{item.status === "Approved" ? item.type : "Pending"}</span>)}
          </span>
        </button>;
      })}</div>

      {selected && <DayDetail
        date={selected}
        holiday={holidays.get(selected)}
        leave={leaveDays.get(selected) ?? []}
        onClose={() => setSelected("")}
        onEdit={onEdit}
        onCancel={onCancel}
      />}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cat-holiday-foreground" />Public holiday</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cat-leave-foreground" />Approved leave</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Pending</span>
      </div>

      {missingHolidays.length > 0 && <p className="mt-3 flex items-start gap-2 rounded-xl bg-background p-3 text-[10px] leading-4 text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        Holidays that follow the Hijri and lunar calendars are gazetted each year and are not shown until HR adds them: {missingHolidays.slice(0, 4).join(", ")}{missingHolidays.length > 4 ? ` and ${missingHolidays.length - 4} more` : ""}.
      </p>}
    </CardContent></Card>

    <Card className="border-black/8 bg-white/90"><CardContent className="p-5">
      <h2 className="font-semibold">My requests</h2>
      <div className="mt-4 space-y-2">
        {upcoming.length > 0 && <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Upcoming</div>}
        {[...upcoming, ...requests.filter((item: any) => !upcoming.includes(item))].map((item: any) => <LeaveRequestRow key={item.id} item={item} onEdit={onEdit} onCancel={onCancel} />)}
        {!requests.length && <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">You have not applied for any leave yet.</div>}
      </div>
    </CardContent></Card>
  </div>;
}

/**
 * One request, laid out for a phone first.
 *
 * It was a single flex row: icon, text, status, Edit, Cancel. On a narrow
 * screen the fixed-width children took what they needed and left the text
 * column about ninety pixels wide, so "Annual Leave" broke over two lines and
 * the dates ran down six. The row now stacks, and the buttons sit on their own
 * line where they have room to be tapped.
 */
function LeaveRequestRow({ item, onEdit, onCancel }: any) {
  return <div className="rounded-xl border bg-card p-3">
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted"><CalendarCheck className="h-4 w-4 text-accent" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{item.type}</span>
          <StatusBadge value={item.status} />
        </div>
        <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
          {item.startDate === item.endDate ? dateLabel(item.startDate) : `${dateLabel(item.startDate)} – ${dateLabel(item.endDate)}`}
          <br className="sm:hidden" />
          <span className="hidden sm:inline"> · </span>
          {describeLeaveDuration(item)}
          {typeof item.balanceAfterRequest === "number" ? ` · ${item.balanceAfterRequest} left after this` : ""}
        </div>
        {item.reason && <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.reason}</p>}
        {item.approverNote && <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Note: {item.approverNote}</p>}
      </div>
    </div>
    {(["Pending", "Rejected", "Approved"].includes(item.status)) && <div className="mt-3 flex gap-2 border-t pt-3">
      {["Pending", "Rejected"].includes(item.status) && <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => onEdit(item)}>Edit</Button>}
      {["Pending", "Approved"].includes(item.status) && <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => onCancel(item.id)}>Cancel</Button>}
    </div>}
  </div>;
}

/** What is on a tapped day, and what can be done about it. */
function DayDetail({ date, holiday, leave, onClose, onEdit, onCancel }: any) {
  return <div className="mt-3 rounded-xl border bg-background p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="text-sm font-semibold">{dateLabel(date)}</div>
      <button onClick={onClose} aria-label="Close day detail" className="text-muted-foreground"><X className="h-4 w-4" /></button>
    </div>

    {holiday && <div className="mt-3 rounded-lg bg-cat-holiday px-3 py-2">
      <div className="text-xs font-semibold text-cat-holiday-foreground">{holiday.name}</div>
      <div className="mt-0.5 text-[10px] text-cat-holiday-foreground/80">{holiday.confirmed ? "Public holiday · no need to apply" : "Standard public holiday · not yet confirmed by HR"}</div>
    </div>}

    {leave.map((item: any) => <div key={item.id} className="mt-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold">{item.type}</span>
        <StatusBadge value={item.status} />
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[9px] font-medium text-muted-foreground">{shortLeaveLabel(item)}</span>
      </div>
      <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{describeLeaveDuration(item)}{item.startDate !== item.endDate ? ` · ${dateLabel(item.startDate)} – ${dateLabel(item.endDate)}` : ""}</div>
      {item.reason && <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.reason}</p>}
      <div className="mt-3 flex gap-2">
        {["Pending", "Rejected"].includes(item.status) && <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => onEdit(item)}>Edit</Button>}
        {["Pending", "Approved"].includes(item.status) && <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => onCancel(item.id)}>Cancel</Button>}
      </div>
    </div>)}

    {!holiday && !leave.length && <p className="mt-3 text-xs text-muted-foreground">Nothing on this day. A working day, as far as leave is concerned.</p>}
  </div>;
}

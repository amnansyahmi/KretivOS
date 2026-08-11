"use client";

/**
 * The screens an employee pushes into from a tab.
 *
 * These used to be links out to `/hr`. Installed on a home screen that is a
 * one-way door: the workspace is a fifteen-section sidebar built for a desktop,
 * it has no back button of its own inside a standalone window, and tapping "My
 * payslips" therefore dropped somebody out of the app they had just opened with
 * no way back short of force-quitting it.
 *
 * So everything an employee does about themselves lives here, in the app. The
 * one deliberate exception is "Open the full HR workspace", which is a stated
 * choice to leave rather than a surprise.
 */

import { useMemo, useState } from "react";
import {
  Building2, CalendarDays, ChevronLeft, ChevronRight, Download, FileText, Info,
  Megaphone, PartyPopper, Wallet, X,
} from "lucide-react";
import { AppCard } from "@/components/hr-app-shell";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { holidayMap, leaveDayMap, monthCells, shiftMonth } from "@/lib/leave-calendar";
import { missingGazettedHolidays } from "@/lib/work-calendar";
import { toLeaveRules } from "@/lib/leave-entitlement";
import { myLeaveBalances } from "@/lib/my-hr-summary";
import { describeLeaveDuration, shortLeaveLabel } from "@/lib/leave-request";
import { entriesForPeriod, formatDuration, summariseByProject, timesheetCsv, toHours, totalMinutes } from "@/lib/timesheet";
import { cn } from "@/lib/utils";

const localDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const money = (value: unknown) => `MYR ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayLabel = (value?: string) => value
  ? new Date(`${String(value).slice(0, 10)}T00:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" })
  : "—";
const monthTitle = (value: string) => new Date(`${value}-01T00:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", month: "long", year: "numeric" });
const periodLabel = (value: string) => /^\d{4}-\d{2}$/.test(String(value)) ? monthTitle(String(value)) : String(value || "—");

/**
 * The leave calendar, on a phone.
 *
 * The workspace prints what is on a date inside the cell. There is no room for
 * that at a seventh of a phone's width, so a cell carries a dot and the day
 * opens underneath — which is also where the leave on that day can be edited
 * or cancelled from.
 */
export function AppLeaveCalendar({ data, session, onApply, onEditLeave, onCancelLeave }: any) {
  const employee = data.employees.find((item: any) => item.id === session.userId);
  const requests = data.leaveRequests;
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [selected, setSelected] = useState("");
  const today = localDate();

  const state = String(data.settings?.attendance?.state || "Selangor");
  const holidays = useMemo(
    () => holidayMap(data.settings?.publicHolidays, Number(month.slice(0, 4)), state),
    [data.settings, month, state],
  );
  const missing = useMemo(
    () => missingGazettedHolidays((data.settings?.publicHolidays || []) as any, Number(month.slice(0, 4))),
    [data.settings, month],
  );
  const leaveDays = useMemo(() => leaveDayMap(requests), [requests]);
  /*
   * Types with nothing in them are dropped. Replacement leave is earned rather
   * than granted and Emergency leave is usually carved out of annual, so both
   * sit at zero for most people all year — and four cards, two of them reading
   * "0 of 0 left", bury the two numbers somebody opened this screen to read.
   * A type reappears the moment it has an entitlement or a day taken against it.
   */
  const balances = useMemo(
    () => myLeaveBalances(toLeaveRules(data.settings?.leaveTypes), employee, requests, Number(today.slice(0, 4)))
      .filter((balance) => balance.entitlement > 0 || balance.taken > 0 || balance.pending > 0),
    [data.settings, employee, requests, today],
  );

  const cells = monthCells(month);
  const upcoming = requests
    .filter((item: any) => ["Pending", "Approved"].includes(item.status) && String(item.endDate || item.startDate) >= today)
    .sort((a: any, b: any) => String(a.startDate).localeCompare(String(b.startDate)));

  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3">{balances.map((balance) => <AppCard key={balance.name}>
      <div className="truncate text-[11px] text-muted-foreground">{balance.name.replace(/ Leave$/, "")}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums">{balance.remaining}</span>
        <span className="text-[10px] text-muted-foreground">of {balance.entitlement} left</span>
      </div>
      {/* Tracks what is left, matching the figure above it — and matching
          Home, where the same bar was filled the other way round. */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-accent" style={{ width: `${balance.entitlement ? Math.min(100, balance.remaining / balance.entitlement * 100) : 0}%` }} />
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground">{balance.taken} taken{balance.pending > 0 ? ` · ${balance.pending} pending` : ""}</div>
    </AppCard>)}</div>

    <AppCard>
      <div className="flex items-center gap-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition active:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => setMonth(today.slice(0, 7))} className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{monthTitle(month)}</button>
        <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition active:bg-secondary"><ChevronRight className="h-4 w-4" /></button>
      </div>

      <div className="mt-3 grid grid-cols-7">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <div key={index} className="py-1 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{day}</div>)}</div>

      <div className="grid grid-cols-7 gap-0.5">{cells.map((date, index) => {
        if (!date) return <div key={`empty-${index}`} className="aspect-square" />;
        const holiday = holidays.get(date);
        const dayLeave = leaveDays.get(date) ?? [];
        const approved = dayLeave.some((item: any) => item.status === "Approved");
        const isSelected = selected === date;

        return <button
          key={date}
          onClick={() => setSelected(isSelected ? "" : date)}
          aria-label={`${dayLabel(date)}${holiday ? ` · ${holiday.name}` : ""}${dayLeave.length ? ` · ${dayLeave.length} leave request` : ""}`}
          aria-pressed={isSelected}
          className={cn(
            "flex aspect-square flex-col items-center justify-center gap-1 rounded-xl transition",
            isSelected ? "bg-foreground text-white" : date === today ? "bg-secondary" : "active:bg-secondary",
          )}
        >
          <span className={cn("text-xs font-medium tabular-nums", !isSelected && date === today && "text-accent")}>{Number(date.slice(-2))}</span>
          <span className="flex h-1.5 items-center gap-0.5">
            {/*
              * Holiday and pending were both drawn in the accent, which are the
              * same hue eleven degrees apart — at six pixels they were one
              * colour. Pending is now the leave colour hollowed out, which also
              * says the right thing: asked for, not yet real. On a selected
              * cell the ground is dark, so both take light counterparts.
              */}
            {holiday && <span className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-background" : "bg-cat-holiday-foreground")} />}
            {dayLeave.length > 0 && <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              approved
                ? (isSelected ? "bg-accent-muted" : "bg-cat-leave-foreground")
                : (isSelected ? "border border-accent-muted" : "border border-cat-leave-foreground"),
            )} />}
          </span>
        </button>;
      })}</div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cat-holiday-foreground" />Public holiday</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cat-leave-foreground" />Approved</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-cat-leave-foreground" />Pending</span>
      </div>

      {selected && <div className="mt-3 rounded-xl bg-background p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs font-semibold">{dayLabel(selected)}</div>
          <button onClick={() => setSelected("")} aria-label="Close day detail" className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>

        {holidays.get(selected) && <div className="mt-2 rounded-lg bg-cat-holiday px-3 py-2">
          <div className="text-[11px] font-semibold text-cat-holiday-foreground">{holidays.get(selected)!.name}</div>
          <div className="mt-0.5 text-[10px] text-cat-holiday-foreground/80">{holidays.get(selected)!.confirmed ? "Public holiday · no need to apply" : "Standard public holiday · not yet confirmed by HR"}</div>
        </div>}

        {(leaveDays.get(selected) ?? []).map((item: any) => <div key={item.id} className="mt-2 rounded-lg border border-black/8 bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">{item.type}</span>
            <StatusBadge value={item.status} />
            <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-medium text-muted-foreground">{shortLeaveLabel(item)}</span>
          </div>
          <div className="mt-1 text-[10px] leading-4 text-muted-foreground">{describeLeaveDuration(item)}{item.startDate !== item.endDate ? ` · ${dayLabel(item.startDate)} – ${dayLabel(item.endDate)}` : ""}</div>
          {item.reason && <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{item.reason}</p>}
          <div className="mt-2 flex gap-2">
            {["Pending", "Rejected"].includes(item.status) && <Button size="sm" variant="outline" className="h-8 flex-1 text-[11px]" onClick={() => onEditLeave(item)}>Edit</Button>}
            {["Pending", "Approved"].includes(item.status) && <Button size="sm" variant="outline" className="h-8 flex-1 text-[11px]" onClick={() => onCancelLeave(item.id)}>Cancel</Button>}
          </div>
        </div>)}

        {!holidays.get(selected) && !(leaveDays.get(selected) ?? []).length && <p className="mt-2 text-[11px] text-muted-foreground">Nothing on this day — an ordinary working day.</p>}
      </div>}

      {/* The dates nobody can seed, so the gap is visible rather than discovered. */}
      {missing.length > 0 && <p className="mt-3 flex items-start gap-2 rounded-xl bg-background p-3 text-[10px] leading-4 text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        Holidays that follow the Hijri and lunar calendars are gazetted each year and are not shown until HR adds them: {missing.slice(0, 3).join(", ")}{missing.length > 3 ? ` and ${missing.length - 3} more` : ""}.
      </p>}
    </AppCard>

    <Button className="h-12 w-full" onClick={onApply}><CalendarDays className="h-4 w-4" />Apply for leave</Button>

    <AppCard title="Coming up">
      <div className="space-y-2.5">{upcoming.slice(0, 5).map((item: any) => <div key={item.id} className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{item.type}</div>
          <div className="text-[10px] text-muted-foreground">{item.startDate === item.endDate ? dayLabel(item.startDate) : `${dayLabel(item.startDate)} – ${dayLabel(item.endDate)}`} · {describeLeaveDuration(item)}</div>
        </div>
        <StatusBadge value={item.status} />
      </div>)}
      {!upcoming.length && <p className="text-xs text-muted-foreground">No leave booked. The calendar above shows the holidays you do not need to ask for.</p>}</div>
    </AppCard>
  </div>;
}

/**
 * Payslips.
 *
 * Only issued ones reach here — the snapshot filters drafts out before the app
 * ever sees them, because a draft is the workings and the figures move.
 * Tapping one opens the breakdown in place; the printable version is a
 * separate page that stays inside the app's scope, so it opens in the same
 * window and comes back with its own Back link.
 */
export function AppPayslips({ data }: any) {
  const [open, setOpen] = useState("");
  const payslips = [...(data.payroll || [])].sort((a: any, b: any) => String(b.period).localeCompare(String(a.period)));

  return <div className="space-y-3">
    {payslips.map((item: any) => {
      const expanded = open === item.id;
      const lines = ([
        ["Basic salary", item.basicSalary],
        ["Allowances", item.allowances],
        ["Overtime", item.overtimePay],
        ["Bonus", item.bonus],
        ["Gross pay", item.grossPay],
        ["EPF (employee)", -Number(item.epfEmployee || 0)],
        ["SOCSO (employee)", -Number(item.socsoEmployee || 0)],
        ["EIS (employee)", -Number(item.eisEmployee || 0)],
        ["PCB / MTD", -Number(item.pcb || 0)],
        ["Other deductions", -Number(item.deductions || 0)],
        // `Number(undefined)` is NaN, and NaN passes a bare `!== 0` — which is
        // how a payslip with no overtime still printed "Overtime MYR 0.00".
      ] as [string, unknown][]).filter(([label, value]) => Number(value || 0) !== 0 || label === "Gross pay");

      return <AppCard key={item.id}>
        <button onClick={() => setOpen(expanded ? "" : item.id)} aria-expanded={expanded} className="flex w-full items-center gap-3 text-left">
          <Wallet className="h-5 w-5 shrink-0 text-foreground" strokeWidth={1.6} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{periodLabel(item.period)}</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">Net pay {money(item.netPay)}</span>
          </span>
          <StatusBadge value={item.status} />
          <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", expanded && "rotate-90")} />
        </button>

        {expanded && <div className="mt-3 border-t border-black/5 pt-3">
          <dl className="space-y-1.5">{lines.map(([label, value]) => <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className={cn("text-right text-xs tabular-nums", Number(value) < 0 ? "text-muted-foreground" : "font-medium")}>{Number(value) < 0 ? `(${money(Math.abs(Number(value)))})` : money(value)}</dd>
          </div>)}</dl>

          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-black/5 pt-3">
            <span className="text-xs font-semibold">Net pay</span>
            <span className="text-base font-semibold tabular-nums">{money(item.netPay)}</span>
          </div>

          {/*
            * `back` returns here rather than to the workspace, so the printable
            * payslip is a step inside the app instead of an exit from it.
            */}
          <Button variant="outline" className="mt-3 w-full bg-card" asChild>
            <a href={`/hr/payslip/${item.id}?back=/hr/app`}><Download className="h-4 w-4" />Open printable payslip</a>
          </Button>
        </div>}
      </AppCard>;
    })}

    {!payslips.length && <AppCard>
      <div className="py-8 text-center">
        <Wallet className="mx-auto h-6 w-6 text-muted-foreground" strokeWidth={1.6} />
        <p className="mt-3 text-sm font-semibold">No payslips yet</p>
        <p className="mt-1 text-xs text-muted-foreground">A payslip appears here once HR closes the pay period. Drafts are not shown.</p>
      </div>
    </AppCard>}
  </div>;
}

/** Documents addressed to you, plus the company-wide ones. */
export function AppDocuments({ data, session }: any) {
  const documents = [...(data.documents || [])]
    .sort((a: any, b: any) => Number(Boolean(b.employeeId === session.userId)) - Number(Boolean(a.employeeId === session.userId)) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  return <div className="space-y-3">
    {documents.map((item: any) => <AppCard key={item.id}>
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-foreground" strokeWidth={1.6} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-5">{item.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
            {item.category && <span className="rounded-full bg-muted px-2 py-0.5">{item.category}</span>}
            <span>{item.employeeId === session.userId ? "Yours" : "Everyone"}</span>
            {item.expiryDate && <span>Expires {dayLabel(item.expiryDate)}</span>}
          </div>
          {item.notes && <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{item.notes}</p>}
          {item.assetId && <Button size="sm" variant="outline" className="mt-2 h-8 bg-card text-[11px]" asChild>
            <a href={`/api/hr/files/${item.assetId}`} target="_blank" rel="noreferrer">Open</a>
          </Button>}
        </div>
      </div>
    </AppCard>)}

    {!documents.length && <AppCard>
      <div className="py-8 text-center">
        <FileText className="mx-auto h-6 w-6 text-muted-foreground" strokeWidth={1.6} />
        <p className="mt-3 text-sm font-semibold">Nothing filed yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Contracts, letters and policies HR shares with you appear here.</p>
      </div>
    </AppCard>}
  </div>;
}

/** Announcements and what is on the team calendar, read-only. */
export function AppTeam({ data }: any) {
  const today = localDate();
  const announcements = [...(data.announcements || [])]
    .filter((item: any) => item.status === "Published")
    .sort((a: any, b: any) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.publishAt || "").localeCompare(String(a.publishAt || "")));
  const events = [...(data.events || [])]
    .filter((item: any) => item.status !== "Cancelled" && String(item.endDate || item.startDate) >= today)
    .sort((a: any, b: any) => String(a.startDate).localeCompare(String(b.startDate)));

  return <div className="space-y-4">
    <AppCard title="Upcoming">
      <div className="space-y-3">{events.slice(0, 6).map((item: any) => <div key={item.id} className="flex items-start gap-3">
        <PartyPopper className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.6} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{item.title}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {item.startDate === item.endDate ? dayLabel(item.startDate) : `${dayLabel(item.startDate)} – ${dayLabel(item.endDate)}`}
            {item.location ? ` · ${item.location}` : ""}
          </div>
        </div>
      </div>)}
      {!events.length && <p className="text-xs text-muted-foreground">Nothing on the team calendar.</p>}</div>
    </AppCard>

    <div className="space-y-3">{announcements.map((item: any) => <AppCard key={item.id}>
      <div className="flex items-start gap-3">
        <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.6} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{item.title}</span>
            {item.pinned && <span className="rounded-full bg-accent-tint px-2 py-0.5 text-[9px] font-medium text-accent-tint-foreground">Pinned</span>}
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-4 text-muted-foreground">{item.body}</p>
          <div className="mt-1.5 text-[10px] text-muted-foreground">{item.category} · {dayLabel(item.publishAt)}</div>
        </div>
      </div>
    </AppCard>)}

    {!announcements.length && <AppCard>
      <div className="py-8 text-center">
        <Megaphone className="mx-auto h-6 w-6 text-muted-foreground" strokeWidth={1.6} />
        <p className="mt-3 text-sm font-semibold">No announcements</p>
        <p className="mt-1 text-xs text-muted-foreground">Company news from HR lands here.</p>
      </div>
    </AppCard>}</div>
  </div>;
}

/** Your own attendance, most recent first. */
export function AppAttendance({ data }: any) {
  const records = [...(data.attendance || [])].sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))).slice(0, 60);

  return <div className="space-y-3">
    {records.map((item: any) => <AppCard key={item.id || item.date}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{dayLabel(item.date)}</div>
          <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
            {item.checkIn || "—"} – {item.checkOut || "—"}
            {Number(item.overtimeMinutes) > 0 ? ` · ${(Number(item.overtimeMinutes) / 60).toFixed(1)}h overtime` : ""}
          </div>
        </div>
        <StatusBadge value={item.status || "Present"} />
      </div>
    </AppCard>)}

    {!records.length && <AppCard>
      <div className="py-8 text-center">
        <Building2 className="mx-auto h-6 w-6 text-muted-foreground" strokeWidth={1.6} />
        <p className="mt-3 text-sm font-semibold">Nothing recorded</p>
        <p className="mt-1 text-xs text-muted-foreground">Clock in from Home and the day appears here.</p>
      </div>
    </AppCard>}
  </div>;
}

/**
 * The fields an employee may fill in about themselves.
 *
 * The same set the server enforces, and deliberately short of the
 * determinations: tax residency and whether EPF, SOCSO and EIS apply are HR's
 * judgement, not something the person affected by them should be able to
 * change. Title, department and salary are not here for the same reason.
 */
const DETAIL_FIELDS: { field: string; label: string; type?: string; hint?: string }[] = [
  { field: "phone", label: "Phone", type: "tel" },
  { field: "emergencyContact", label: "Emergency contact", hint: "Name and number" },
  { field: "location", label: "Location" },
  { field: "dateOfBirth", label: "Date of birth", type: "date" },
  { field: "identificationNumber", label: "NRIC", hint: "Payroll cannot run without this" },
  { field: "nationality", label: "Nationality" },
  { field: "maritalStatus", label: "Marital status" },
  { field: "incomeTaxNumber", label: "Income tax number", hint: "Leave blank until LHDN issues one" },
  { field: "epfNumber", label: "EPF number", hint: "Leave blank if this is your first job" },
  { field: "socsoNumber", label: "SOCSO number" },
  { field: "bankName", label: "Bank" },
  { field: "bankAccountNumber", label: "Bank account number" },
];

export function AppDetails({ data, session, onSave, saving, error }: any) {
  const employee = data.employees.find((item: any) => item.id === session.userId) || {};
  const [draft, setDraft] = useState<Record<string, string>>(
    () => Object.fromEntries(DETAIL_FIELDS.map(({ field }) => [field, String(employee[field] ?? "")])),
  );

  const set = (field: string, value: string) => setDraft((current) => ({ ...current, [field]: value }));

  return <div className="space-y-4">
    <AppCard>
      <div className="text-xs leading-5 text-muted-foreground">
        Your title, department, salary and leave entitlement are set by HR and are not editable here.
        Everything below is yours to keep current.
      </div>
    </AppCard>

    <AppCard title="My details">
      <div className="space-y-3">{DETAIL_FIELDS.map(({ field, label, type, hint }) => <div key={field}>
        <Label htmlFor={`detail-${field}`} className="text-[11px]">{label}</Label>
        <Input
          id={`detail-${field}`}
          type={type || "text"}
          value={draft[field] ?? ""}
          onChange={(event) => set(field, event.target.value)}
          className="mt-1 h-11"
        />
        {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
      </div>)}</div>
    </AppCard>

    {error && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-xs text-destructive">{error}</p>}

    <Button className="h-12 w-full" disabled={saving} onClick={() => onSave(draft)}>
      {saving ? "Saving…" : "Save my details"}
    </Button>
  </div>;
}

/**
 * The monthly timesheet, and a file to send somebody.
 *
 * The Timesheet tab answers "what did I do today"; this answers "what did I do
 * this month, and can I prove it". They are different questions, which is why
 * the link at the foot of the tab used to point at the tab it was already on
 * and appear to do nothing when tapped.
 *
 * The export is generated in the browser rather than fetched, so it works with
 * whatever the app already has and needs no endpoint of its own.
 */
export function AppTimesheetReport({ data, session }: any) {
  const [month, setMonth] = useState(() => localDate().slice(0, 7));

  const mine = (data.timesheets || []).filter((entry: any) => entry.employeeId === session.userId);
  const entries = entriesForPeriod(mine, session.userId, month);
  const minutes = totalMinutes(entries);
  const billableMinutes = totalMinutes(entries.filter((entry: any) => entry.billable));
  const byProject = summariseByProject(entries);
  const days = new Set(entries.map((entry: any) => entry.date)).size;

  function download() {
    const employee = data.employees.find((item: any) => item.id === session.userId);
    const csv = timesheetCsv(entries, () => employee?.name || session.name);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `timesheet-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="space-y-4">
    <AppCard>
      <div className="flex items-center gap-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition active:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => setMonth(localDate().slice(0, 7))} className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{monthTitle(month)}</button>
        <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition active:bg-secondary"><ChevronRight className="h-4 w-4" /></button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        {([["Logged", `${toHours(minutes)}h`], ["Billable", `${toHours(billableMinutes)}h`], ["Days", String(days)]] as const).map(([label, value]) => <div key={label}>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
        </div>)}
      </div>
    </AppCard>

    <AppCard title="By project">
      <div className="space-y-3">{byProject.map((row: any) => <div key={row.project}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-xs">{row.project || "No project"}</span>
          <span className="shrink-0 text-xs font-semibold tabular-nums">{toHours(row.minutes)}h</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent" style={{ width: `${minutes ? Math.max(3, row.minutes / minutes * 100) : 0}%` }} />
        </div>
      </div>)}
      {!byProject.length && <p className="text-xs text-muted-foreground">Nothing logged this month.</p>}</div>
    </AppCard>

    <Button variant="outline" className="h-12 w-full bg-card" disabled={!entries.length} onClick={download}>
      <Download className="h-4 w-4" />Export {month} as CSV
    </Button>

    <AppCard title="Every entry">
      <div className="space-y-3">{entries.map((entry: any) => <div key={entry.id} className="flex items-start gap-3 border-b border-black/5 pb-3 last:border-0 last:pb-0">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium leading-4">{entry.task}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {dayLabel(entry.date)} · {entry.startTime}–{entry.endTime}{entry.project ? ` · ${entry.project}` : ""}
          </div>
        </div>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums">{formatDuration(entry.durationMinutes)}</span>
      </div>)}
      {!entries.length && <p className="text-xs text-muted-foreground">Nothing logged this month.</p>}</div>
    </AppCard>
  </div>;
}

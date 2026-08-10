"use client";

/**
 * The tabs of the employee app.
 *
 * Each answers one question and stops. Home is "what is today and what can I
 * do"; Timesheet is "what did I work on"; Requests is "where did my leave and
 * claims get to"; Inbox is what HR has told me; Profile is my record.
 *
 * What an employee reaches for monthly rather than daily — payslips, the leave
 * calendar, documents — is a screen pushed over a tab rather than a link out to
 * `/hr`; those live in `hr-app-detail-screens.tsx`, and the reason they are not
 * links is written there.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, CalendarCheck, CalendarPlus, Camera, ChevronLeft, ChevronRight, Clock3, ExternalLink,
  FileText, HandCoins, ListChecks, LogOut, Megaphone, PartyPopper, Pencil, Plus, Receipt, ShieldCheck,
  Trash2, Wallet,
} from "lucide-react";
import { AppAction, AppCard } from "@/components/hr-app-shell";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { myLeaveBalances, todayStatus, type TodayStatus } from "@/lib/my-hr-summary";
import { toLeaveRules } from "@/lib/leave-entitlement";
import { describeLeaveDuration } from "@/lib/leave-request";
import { formatDuration, toHours, totalMinutes } from "@/lib/timesheet";
import { fixedHolidays, mergeHolidays } from "@/lib/work-calendar";
import { cn } from "@/lib/utils";

const money = (value: unknown) => `MYR ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayLabel = (value?: string) => value
  ? new Date(`${String(value).slice(0, 10)}T00:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" })
  : "—";
const longDate = (value: string) => new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "long", day: "numeric", month: "long", year: "numeric" });

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function initials(name: string) {
  return String(name || "").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

/**
 * How long since clocking in, counted live.
 *
 * A duration that only updates on reload is worse than no duration — somebody
 * checking whether they can leave reads a stale number as a current one. Ticks
 * once a minute, which is the resolution the figure is shown at anyway.
 */
function useElapsed(since: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [since]);

  if (!since) return null;
  const started = new Date(since).getTime();
  if (!Number.isFinite(started)) return null;
  const minutes = Math.max(0, Math.floor((now - started) / 60_000));
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

export function AppHome({ data, session, today, onTab, onOpenLeave, onOpenClaim, onClock, onOpenHR }: any) {
  const employee = data.employees.find((item: any) => item.id === session.userId);
  const leave = data.leaveRequests;
  const claims = data.claims;

  const holidays = useMemo(() => {
    const configured = (data.settings?.publicHolidays || []).filter((item: any) => item?.date && item?.name);
    const year = Number(today.slice(0, 4));
    return mergeHolidays(configured, [...fixedHolidays(year, String(data.settings?.attendance?.state || "Selangor")), ...fixedHolidays(year + 1, String(data.settings?.attendance?.state || "Selangor"))]);
  }, [data.settings, today]);

  const status: TodayStatus = todayStatus({
    date: today,
    attendance: data.attendance,
    leave,
    holidayName: holidays.find((item) => item.date === today)?.name ?? "",
  });
  const record = data.attendance.find((item: any) => item.date === today);
  const elapsed = useElapsed(status.state === "clocked_in" ? (record?.checkInAt ?? null) : null);

  const balances = useMemo(
    () => myLeaveBalances(toLeaveRules(data.settings?.leaveTypes), employee, leave, Number(today.slice(0, 4))),
    [data.settings, employee, leave, today],
  );
  const pendingClaims = claims.filter((item: any) => item.status === "Pending");
  const pendingClaimTotal = pendingClaims.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
  const nextHoliday = holidays.find((item) => item.date >= today);
  const daysToHoliday = nextHoliday
    ? Math.round((new Date(`${nextHoliday.date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000)
    : 0;

  const announcement = [...(data.announcements || [])]
    .filter((item: any) => item.status === "Published")
    .sort((a: any, b: any) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.publishAt || "").localeCompare(String(a.publishAt || "")))[0];

  const recent = [
    ...leave.map((item: any) => ({ id: `l-${item.id}`, kind: "Leave", label: item.type, date: item.startDate, status: item.status })),
    ...claims.map((item: any) => ({ id: `c-${item.id}`, kind: "Claim", label: item.category, date: item.claimDate, status: item.status })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);

  return <div className="space-y-4">
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-white">{initials(employee?.name || session.name)}</div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold leading-tight">{greeting(new Date().getHours())}, {String(employee?.name || session.name).split(" ")[0]}</h2>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{employee?.title || "Team member"}{employee?.department ? ` · ${employee.department}` : ""}</p>
        <p className="text-[11px] text-muted-foreground">{longDate(today)}</p>
      </div>
    </div>

    <AppCard>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-foreground" strokeWidth={1.8} />
          <span className="text-sm font-semibold">Attendance</span>
        </div>
        <StatusBadge value={status.state === "clocked_in" ? "Clocked In" : status.state === "clocked_out" ? "Completed" : status.state === "leave" ? "On Leave" : status.state === "holiday" ? "Holiday" : "Not clocked in"} />
      </div>

      {status.state === "clocked_in" && <div className="mt-4">
        <div className="text-xs text-muted-foreground">Clocked in <span className="font-semibold text-foreground">{record?.checkIn}</span></div>
        <div className="mt-3 text-[11px] text-muted-foreground">Work duration</div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tabular-nums tracking-tight">{elapsed ? `${String(elapsed.hours).padStart(2, "0")}:${String(elapsed.minutes).padStart(2, "0")}` : "—"}</span>
          <span className="text-xs text-muted-foreground">hrs</span>
        </div>
      </div>}

      {status.state !== "clocked_in" && <div className="mt-4">
        <div className="text-base font-semibold">{status.headline}</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{status.detail}</p>
      </div>}

      {/* Straight into the camera: routing to the workspace to clock in was the
          one action the app existed for and did not perform. */}
      {status.action && <Button className="mt-4 h-12 w-full text-sm" onClick={() => onClock(status.action === "clock_in" ? "check_in" : "check_out")}>
        <Camera className="h-4 w-4" />{status.action === "clock_in" ? "Clock In" : "Clock Out"}
      </Button>}
    </AppCard>

    {/* Glyphs only — no tile, no border, no colour fill. */}
    <div className="grid grid-cols-4 gap-1">
      <AppAction icon={CalendarPlus} label="Apply Leave" onClick={onOpenLeave} />
      <AppAction icon={Receipt} label="Submit Claim" onClick={onOpenClaim} />
      <AppAction icon={Camera} label="Clock In/Out" onClick={() => onClock(status.action === "clock_out" ? "check_out" : "check_in")} />
      <AppAction icon={ListChecks} label="Log Task" onClick={() => onTab("timesheet")} />
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      <AppCard title="Leave Balance" action={<button onClick={() => onOpenHR("leave")} className="text-[11px] font-semibold text-accent">View all</button>}>
        <div className="space-y-3">{balances.slice(0, 2).map((balance) => <div key={balance.name}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">{balance.name.replace(/ Leave$/, "")}</span>
            <span className="shrink-0 text-sm font-semibold">{balance.remaining} <span className="text-[10px] font-normal text-muted-foreground">days</span></span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-accent" style={{ width: `${balance.entitlement ? Math.max(4, balance.remaining / balance.entitlement * 100) : 0}%` }} />
          </div>
        </div>)}
        {!balances.length && <p className="text-xs text-muted-foreground">No leave entitlement recorded yet.</p>}</div>
      </AppCard>

      <AppCard title="Pending Claim" action={<button onClick={() => onTab("requests")} className="text-[11px] font-semibold text-accent">View claims</button>}>
        {pendingClaims.length ? <>
          <p className="text-xs text-muted-foreground">{pendingClaims.length} claim{pendingClaims.length === 1 ? "" : "s"} awaiting approval</p>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{money(pendingClaimTotal)}</div>
        </> : <p className="text-xs text-muted-foreground">Nothing awaiting approval.</p>}
      </AppCard>
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      <AppCard title="Upcoming Holiday">
        {nextHoliday ? <div className="flex items-start gap-3">
          <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={1.6} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{nextHoliday.name}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{dayLabel(nextHoliday.date)}</div>
            <div className="mt-1 text-[11px] font-semibold text-accent">{daysToHoliday === 0 ? "Today" : `${daysToHoliday} day${daysToHoliday === 1 ? "" : "s"} to go`}</div>
          </div>
        </div> : <p className="text-xs text-muted-foreground">No holiday scheduled. HR adds the gazetted dates each year.</p>}
      </AppCard>

      <AppCard title="Recent Requests" action={<button onClick={() => onTab("requests")} className="text-[11px] font-semibold text-accent">View all</button>}>
        <div className="space-y-2.5">{recent.map((item) => <div key={item.id} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{item.kind} · {item.label}</div>
            <div className="text-[10px] text-muted-foreground">{dayLabel(item.date)}</div>
          </div>
          <StatusBadge value={item.status} />
        </div>)}
        {!recent.length && <p className="text-xs text-muted-foreground">Nothing submitted yet.</p>}</div>
      </AppCard>
    </div>

    {announcement && <button onClick={() => onOpenHR("team")} className="flex w-full items-start gap-3 rounded-2xl border border-black/8 bg-card p-4 text-left shadow-sm transition active:bg-secondary">
      <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={1.6} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{announcement.title}</div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{announcement.body}</p>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>}
  </div>;
}

export function AppRequests({ data, focus, onOpenLeave, onOpenClaim, onEditLeave, onCancelLeave, onOpenHR }: any) {
  const [filter, setFilter] = useState<"all" | "leave" | "claims">(focus || "all");

  // Arriving from "My claims" or a claim notification should land on claims,
  // not on everything with claims somewhere in it.
  useEffect(() => { if (focus) setFilter(focus); }, [focus]);

  const rows = [
    ...(filter === "claims" ? [] : data.leaveRequests.map((item: any) => ({
      id: `l-${item.id}`, kind: "Leave", title: item.type, meta: describeLeaveDuration(item),
      date: item.startDate, endDate: item.endDate, status: item.status, note: item.approverNote, amount: null,
      record: item,
    }))),
    ...(filter === "leave" ? [] : data.claims.map((item: any) => ({
      id: `c-${item.id}`, kind: "Claim", title: item.category, meta: item.description,
      date: item.claimDate, endDate: item.claimDate, status: item.status, note: item.approverNote, amount: item.amount,
      record: null,
    }))),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return <div className="space-y-4">
    <div className="flex gap-2">
      {(["all", "leave", "claims"] as const).map((item) => <button
        key={item}
        onClick={() => setFilter(item)}
        className={cn("rounded-full px-4 py-2 text-xs font-semibold capitalize transition", filter === item ? "bg-foreground text-white" : "bg-card text-muted-foreground")}
      >{item}</button>)}
    </div>

    <div className="grid grid-cols-2 gap-3">
      <Button variant="outline" className="h-11 bg-card" onClick={onOpenLeave}><CalendarPlus className="h-4 w-4" />Apply leave</Button>
      <Button variant="outline" className="h-11 bg-card" onClick={onOpenClaim}><Receipt className="h-4 w-4" />Submit claim</Button>
    </div>

    <div className="space-y-3">{rows.map((row: any) => <AppCard key={row.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{row.title}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-medium text-muted-foreground">{row.kind}</span>
          </div>
          <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {row.date === row.endDate ? dayLabel(row.date) : `${dayLabel(row.date)} – ${dayLabel(row.endDate)}`}
            {row.meta ? ` · ${row.meta}` : ""}
          </div>
          {row.note && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Note: {row.note}</p>}
        </div>
        <div className="shrink-0 text-right">
          <StatusBadge value={row.status} />
          {row.amount !== null && <div className="mt-1.5 text-sm font-semibold">{money(row.amount)}</div>}
        </div>
      </div>

      {/* Withdrawing a request you no longer need is the commonest thing to
          want from this list, and it was only possible in the workspace. */}
      {row.record && ["Pending", "Rejected", "Approved"].includes(row.status) && <div className="mt-3 flex gap-2 border-t border-black/5 pt-3">
        {["Pending", "Rejected"].includes(row.status) && <Button size="sm" variant="outline" className="h-9 flex-1 text-[11px]" onClick={() => onEditLeave(row.record)}>Edit</Button>}
        {["Pending", "Approved"].includes(row.status) && <Button size="sm" variant="outline" className="h-9 flex-1 text-[11px]" onClick={() => onCancelLeave(row.record.id)}>Cancel</Button>}
      </div>}
    </AppCard>)}

    {!rows.length && <AppCard>
      <div className="py-8 text-center">
        <FileText className="mx-auto h-6 w-6 text-muted-foreground" strokeWidth={1.6} />
        <p className="mt-3 text-sm font-semibold">Nothing here yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Leave requests and claims you submit will appear here.</p>
      </div>
    </AppCard>}</div>

    <button onClick={() => onOpenHR("leave")} className="flex w-full items-center justify-center gap-2 py-2 text-xs font-semibold text-accent">
      Open the leave calendar<ArrowRight className="h-3.5 w-3.5" />
    </button>
  </div>;
}

export function AppInbox({ notifications, loading, onOpen, onMarkAllRead }: any) {
  const unread = notifications.filter((item: any) => !item.read).length;

  return <div className="space-y-4">
    {unread > 0 && <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">{unread} unread</p>
      <button onClick={onMarkAllRead} className="text-xs font-semibold text-accent">Mark all read</button>
    </div>}

    <div className="space-y-2">{notifications.map((item: any) => <button
      key={item.id}
      onClick={() => onOpen(item)}
      className={cn("flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition active:bg-secondary", item.read ? "border-black/8 bg-card/60" : "border-accent/25 bg-card shadow-sm")}
    >
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-accent")} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-5">{item.title}</span>
        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{item.body}</span>
        <span className="mt-1.5 block text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>)}</div>

    {!notifications.length && !loading && <AppCard>
      <div className="py-8 text-center">
        <Megaphone className="mx-auto h-6 w-6 text-muted-foreground" strokeWidth={1.6} />
        <p className="mt-3 text-sm font-semibold">Nothing new</p>
        <p className="mt-1 text-xs text-muted-foreground">Leave, claim and payroll updates land here.</p>
      </div>
    </AppCard>}
  </div>;
}

/**
 * Whether this is running as an installed app.
 *
 * Two checks because iOS never implemented the standard one: Safari sets a
 * non-standard `navigator.standalone` and ignores `display-mode`.
 */
function useInstalled() {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches
      || (window.navigator as any).standalone === true;
    setInstalled(Boolean(standalone));
  }, []);
  return installed;
}

export function AppProfile({ data, session, onOpenHR, onOpenWorkspace, onSignOut, authEnabled }: any) {
  const employee = data.employees.find((item: any) => item.id === session.userId);
  const installed = useInstalled();

  const rows: [string, string][] = [
    ["Employee number", employee?.employeeNumber || ""],
    ["Department", employee?.department || ""],
    ["Started", employee?.startDate ? dayLabel(employee.startDate) : ""],
    ["Phone", employee?.phone || ""],
    ["Emergency contact", employee?.emergencyContact || ""],
    ["Bank", employee?.bankName ? `${employee.bankName} ····${String(employee.bankAccountNumber || "").slice(-4)}` : ""],
  ];
  const missing = rows.filter(([, value]) => !value).length;

  return <div className="space-y-4">
    <div className="flex flex-col items-center py-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-foreground text-xl font-semibold text-white">{initials(employee?.name || session.name)}</div>
      <h2 className="mt-3 text-lg font-semibold">{employee?.name || session.name}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{employee?.title || "Team member"}</p>
    </div>

    {missing > 0 && <button onClick={() => onOpenHR("profile")} className="flex w-full items-start gap-3 rounded-2xl border border-accent/30 bg-accent-tint p-4 text-left">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-tint-foreground" strokeWidth={1.6} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-accent-tint-foreground">{missing} detail{missing === 1 ? "" : "s"} still missing</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-accent-tint-foreground/80">Payroll works from these. Tap to fill them in.</span>
      </span>
    </button>}

    <AppCard title="My details" action={<button onClick={() => onOpenHR("profile")} className="text-[11px] font-semibold text-accent">Edit</button>}>
      <dl className="space-y-2.5">{rows.map(([label, value]) => <div key={label} className="flex items-baseline justify-between gap-3 border-b border-black/5 pb-2.5 last:border-0 last:pb-0">
        <dt className="text-[11px] text-muted-foreground">{label}</dt>
        <dd className={cn("text-right text-xs font-medium", !value && "text-accent")}>{value || "Not recorded"}</dd>
      </div>)}</dl>
    </AppCard>

    {/* Every one of these opens a screen in the app. None of them leaves it. */}
    <div className="space-y-2">
      {([
        ["payslips", Wallet, "My payslips"],
        ["timesheet", Clock3, "My timesheet"],
        ["claims", HandCoins, "My claims"],
        ["attendance", CalendarCheck, "My attendance"],
        ["documents", FileText, "HR documents"],
        ["team", Megaphone, "Team hub"],
      ] as const).map(([section, Icon, label]) => (
        <button key={section} onClick={() => onOpenHR(section)} className="flex w-full items-center gap-3 rounded-2xl border border-black/8 bg-card p-4 text-left transition active:bg-secondary">
          <Icon className="h-5 w-5 shrink-0 text-foreground" strokeWidth={1.6} />
          <span className="flex-1 text-sm font-medium">{label}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}
    </div>

    {/*
      * Shown only when this is running in a browser tab. Installed, it would be
      * instructions for something already done.
      */}
    {!installed && <AppCard title="Add to your home screen">
      <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-4 text-muted-foreground">
        <li>Open this page in Safari, not inside another app.</li>
        <li>Tap Share, then <span className="font-medium text-foreground">Add to Home Screen</span>.</li>
        <li>Name it and tap Add. It opens full screen, with the camera available for clocking in.</li>
      </ol>
      <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
        On iPhone the long-press menu on a home-screen icon only offers Edit, Share and Delete — Apple does not support app shortcuts for web apps, so there is nothing to add there. Everything is one tap from Home instead.
      </p>
    </AppCard>}

    {/*
      * The only way out of the app, and it says so. Everything else on this
      * screen stays here; this one is a deliberate step into the desktop
      * workspace, which has no way back into a standalone window.
      */}
    <button onClick={onOpenWorkspace} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-black/8 bg-card p-4 text-sm font-medium transition active:bg-secondary">
      Open the full HR workspace<ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
    </button>

    {authEnabled && <Button variant="outline" className="w-full bg-card text-destructive" onClick={onSignOut}>
      <LogOut className="h-4 w-4" />Sign out
    </Button>}
  </div>;
}


const localDate = (input = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(input);
const parseDay = (value: string) => new Date(`${value}T00:00:00+08:00`);
const addDays = (value: string, count: number) => { const date = parseDay(value); date.setDate(date.getDate() + count); return localDate(date); };
const mondayOf = (value: string) => { const date = parseDay(value); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); return localDate(date); };
const weekdayShort = (value: string) => parseDay(value).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "narrow" });

/**
 * The timesheet, sized for a thumb.
 *
 * A week strip rather than the workspace's seven stacked cards: on a phone the
 * question is almost always "what did I do today, and what have I not written
 * up yet", and a strip answers both in one glance — a dot under a day says it
 * has something on it, and the gaps are the days that do not.
 *
 * One day at a time below it, because a day holds as many tasks as it took and
 * showing seven days of them at once is how a log becomes a wall.
 */
export function AppTimesheet({ data, session, onAdd, onEdit, onDelete, onOpenHR }: any) {
  const today = localDate();
  const [selected, setSelected] = useState(today);
  const weekStart = mondayOf(selected);
  const week = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  const mine = (data.timesheets || []).filter((entry: any) => entry.employeeId === session.userId);
  const byDay = (date: string) => mine
    .filter((entry: any) => entry.date === date)
    .sort((a: any, b: any) => String(a.startTime).localeCompare(String(b.startTime)));

  const dayEntries = byDay(selected);
  const weekMinutes = totalMinutes(mine.filter((entry: any) => entry.date >= weekStart && entry.date <= week[6]));

  return <div className="space-y-4">
    <AppCard>
      <div className="flex items-center gap-2">
        <button onClick={() => setSelected(addDays(weekStart, -7))} aria-label="Previous week" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition active:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-xs font-semibold">{parseDay(weekStart).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short" })} – {parseDay(week[6]).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short" })}</div>
          <div className="text-[10px] text-muted-foreground">{toHours(weekMinutes)}h logged this week</div>
        </div>
        <button onClick={() => setSelected(addDays(weekStart, 7))} aria-label="Next week" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition active:bg-secondary"><ChevronRight className="h-4 w-4" /></button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1">{week.map((date) => {
        const count = byDay(date).length;
        const isSelected = date === selected;
        return <button
          key={date}
          onClick={() => setSelected(date)}
          aria-label={`${parseDay(date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long" })}, ${count} task${count === 1 ? "" : "s"}`}
          aria-pressed={isSelected}
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl py-2 transition",
            isSelected ? "bg-foreground text-white" : date === today ? "bg-secondary" : "active:bg-secondary",
          )}
        >
          <span className={cn("text-[9px] uppercase", isSelected ? "text-white/60" : "text-muted-foreground")}>{weekdayShort(date)}</span>
          <span className="text-sm font-semibold tabular-nums">{Number(date.slice(-2))}</span>
          {/* A dot means the day has something on it; a gap means it does not. */}
          <span className={cn("h-1 w-1 rounded-full", count ? (isSelected ? "bg-accent-muted" : "bg-accent") : "bg-transparent")} />
        </button>;
      })}</div>
    </AppCard>

    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold">{parseDay(selected).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "long", day: "numeric", month: "long" })}</h2>
        <p className="text-[11px] text-muted-foreground">{dayEntries.length ? `${formatDuration(totalMinutes(dayEntries))} · ${dayEntries.length} task${dayEntries.length === 1 ? "" : "s"}` : "Nothing logged"}</p>
      </div>
      <Button size="sm" className="shrink-0" onClick={() => onAdd(selected)}><Plus className="h-3.5 w-3.5" />Add task</Button>
    </div>

    <div className="space-y-2">{dayEntries.map((entry: any) => <AppCard key={entry.id}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-5">{entry.task}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
            <span className="tabular-nums">{entry.startTime}–{entry.endTime}</span>
            <span className="font-semibold text-foreground-soft">{formatDuration(entry.durationMinutes)}</span>
            {entry.project && <span className="rounded-full bg-muted px-2 py-0.5">{entry.project}</span>}
            {entry.billable && <span className="rounded-full bg-accent-tint px-2 py-0.5 text-accent-tint-foreground">Billable</span>}
          </div>
          {entry.notes && <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{entry.notes}</p>}
          {entry.overlapWarning && <p className="mt-1.5 text-[11px] text-accent">{entry.overlapWarning}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={() => onEdit(entry)} aria-label={`Edit ${entry.task}`} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition active:bg-secondary"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => onDelete(entry.id)} aria-label={`Delete ${entry.task}`} className="flex h-8 w-8 items-center justify-center rounded-full text-destructive transition active:bg-secondary"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </AppCard>)}

    {!dayEntries.length && <AppCard>
      <div className="py-8 text-center">
        <ListChecks className="mx-auto h-6 w-6 text-muted-foreground" strokeWidth={1.6} />
        <p className="mt-3 text-sm font-semibold">Nothing logged yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Add what you worked on and how long it took.</p>
      </div>
    </AppCard>}</div>

    <button onClick={() => onOpenHR("timesheet")} className="flex w-full items-center justify-center gap-2 py-2 text-xs font-semibold text-accent">
      Monthly report and export<ArrowRight className="h-3.5 w-3.5" />
    </button>
  </div>;
}

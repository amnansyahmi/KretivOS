"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  MapPin,
  Megaphone,
  Pencil,
  Pin,
  Plus,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TeamMember = {
  id: string;
  name: string;
  title?: string;
  department?: string;
  managerId?: string;
  status?: string;
  workMode?: string;
};

type CalendarEntry = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  type: "Event" | "Holiday" | "Leave" | "Lifecycle";
  meta?: string;
  location?: string;
};

const dateLabel = (value?: string) => value
  ? new Date(`${value.slice(0, 10)}T00:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" })
  : "—";

function malaysiaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function monthValue() {
  return malaysiaToday().slice(0, 7);
}

function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(value: string) {
  return new Date(`${value}-01T00:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", month: "long", year: "numeric" });
}

function eventTone(type: CalendarEntry["type"]) {
  return ({
    Event: "bg-[#e9f1ec] text-[#33533e]",
    Holiday: "bg-[#fff0e9] text-[#9b4a36]",
    Leave: "bg-[#eef1fa] text-[#3f4f80]",
    Lifecycle: "bg-[#f4edfa] text-[#694582]",
  } as const)[type];
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function HRTeamHub({
  announcements,
  events,
  publicHolidays,
  leaveRequests,
  lifecycle,
  directory,
  query,
  canManage,
  onCreateAnnouncement,
  onCreateEvent,
  onEditAnnouncement,
  onEditEvent,
  onDeleteAnnouncement,
  onDeleteEvent,
}: any) {
  const [month, setMonth] = useState(monthValue);
  const today = malaysiaToday();
  const term = String(query || "").trim().toLowerCase();

  const visibleAnnouncements = useMemo(() => [...(announcements || [])]
    .filter((item: any) => {
      if (term && ![item.title, item.body, item.category].join(" ").toLowerCase().includes(term)) return false;
      if (canManage) return true;
      return item.status === "Published" && (!item.publishAt || item.publishAt.slice(0, 10) <= today) && (!item.expiresAt || item.expiresAt.slice(0, 10) >= today);
    })
    .sort((a: any, b: any) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.publishAt || b.createdAt).localeCompare(String(a.publishAt || a.createdAt))), [announcements, canManage, term, today]);

  const calendarEntries = useMemo<CalendarEntry[]>(() => {
    const custom = (events || []).filter((item: any) => item.status !== "Cancelled").map((item: any) => ({
      id: `event-${item.id}`,
      title: item.title,
      startDate: item.startDate,
      endDate: item.endDate || item.startDate,
      type: "Event" as const,
      meta: item.eventType || "Team event",
      location: item.location,
    }));
    const holidays = (publicHolidays || []).map((item: any) => ({
      id: `holiday-${item.date}-${item.name}`,
      title: item.name,
      startDate: item.date,
      endDate: item.date,
      type: "Holiday" as const,
      meta: "Public holiday",
    }));
    const leave = (leaveRequests || []).filter((item: any) => item.status === "Approved").map((item: any) => ({
      id: `leave-${item.id}`,
      title: `${item.employeeName || "Team member"} · ${item.type}`,
      startDate: item.startDate,
      endDate: item.endDate || item.startDate,
      type: "Leave" as const,
      meta: item.halfDay ? "Half day" : `${item.days || 1} working day${Number(item.days || 1) === 1 ? "" : "s"}`,
    }));
    const cases = (lifecycle || []).filter((item: any) => item.dueDate && !["Completed", "Cancelled"].includes(item.status)).map((item: any) => ({
      id: `lifecycle-${item.id}`,
      title: item.title,
      startDate: item.dueDate,
      endDate: item.dueDate,
      type: "Lifecycle" as const,
      meta: `${item.employeeName || "Team member"} · ${item.type}`,
    }));
    return [...custom, ...holidays, ...leave, ...cases].filter((item) => item.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
  }, [events, publicHolidays, leaveRequests, lifecycle]);

  const monthEntries = calendarEntries.filter((entry) => entry.startDate.slice(0, 7) <= month && entry.endDate.slice(0, 7) >= month);
  const activeDirectory = (directory || []).filter((item: TeamMember) => item.status !== "alumni" && item.status !== "inactive");
  const departments = Array.from(new Set(activeDirectory.map((item: TeamMember) => item.department || "Unassigned"))).sort();
  const awayToday = calendarEntries.filter((entry) => entry.type === "Leave" && entry.startDate <= today && entry.endDate >= today).length;
  const liveAnnouncementCount = (announcements || []).filter((item: any) => item.status === "Published" && (!item.publishAt || item.publishAt.slice(0, 10) <= today) && (!item.expiresAt || item.expiresAt.slice(0, 10) >= today)).length;

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <HubStat icon={Megaphone} label="Live announcements" value={liveAnnouncementCount} note="Current team updates" />
      <HubStat icon={CalendarDays} label="This month" value={monthEntries.length} note="Events, leave and key dates" />
      <HubStat icon={UsersRound} label="Team directory" value={activeDirectory.length} note={`${departments.length} department${departments.length === 1 ? "" : "s"}`} />
      <HubStat icon={GitBranch} label="Away today" value={awayToday} note="Approved leave" />
    </div>

    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <Card className="border-black/8 bg-white/90">
        <CardContent className="p-5">
          <SectionHeader icon={Megaphone} title="Announcements" note="A single source for company and people updates." action={canManage ? <Button size="sm" onClick={onCreateAnnouncement}><Plus className="h-3.5 w-3.5" />New</Button> : null} />
          <div className="mt-5 space-y-3">
            {visibleAnnouncements.map((item: any) => <article key={item.id} className={cn("rounded-2xl border p-4", item.pinned ? "border-[#ba5c42]/30 bg-[#fff8f4]" : "bg-[#fbfaf7]") }>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.pinned && <span className="inline-flex items-center gap-1 rounded-full bg-[#ba5c42] px-2 py-1 text-[9px] font-semibold text-white"><Pin className="h-2.5 w-2.5" />Pinned</span>}
                    <span className="rounded-full bg-black/5 px-2 py-1 text-[9px] font-medium text-muted-foreground">{item.category || "General"}</span>
                    {canManage && <AnnouncementStatus value={item.status} />}
                  </div>
                  <h3 className="mt-3 text-sm font-semibold leading-5">{item.title}</h3>
                </div>
                {canManage && <div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditAnnouncement(item)} aria-label={`Edit ${item.title}`}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => onDeleteAnnouncement(item.id)} aria-label={`Delete ${item.title}`}><Trash2 className="h-3.5 w-3.5" /></Button></div>}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[#667067]">{item.body}</p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-muted-foreground"><span>{item.publishAt ? `Published ${dateLabel(item.publishAt)}` : "Publish date not set"}</span>{item.expiresAt && <span>Until {dateLabel(item.expiresAt)}</span>}</div>
            </article>)}
            {!visibleAnnouncements.length && <EmptyState icon={Megaphone} title="No announcements yet" note={term ? "No announcement matches your search." : "Publish a team update, policy notice or important reminder."} action={canManage ? onCreateAnnouncement : undefined} />}
          </div>
        </CardContent>
      </Card>

      <Card className="border-black/8 bg-white/90">
        <CardContent className="p-5">
          <SectionHeader icon={CalendarDays} title="Team calendar" note="Approved leave, events, holidays and lifecycle deadlines." action={canManage ? <Button size="sm" onClick={onCreateEvent}><Plus className="h-3.5 w-3.5" />Event</Button> : null} />
          <div className="mt-5 flex items-center justify-between rounded-xl bg-[#f7f4ed] p-2">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setMonth((value) => shiftMonth(value, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
            <button className="text-sm font-semibold" onClick={() => setMonth(monthValue())}>{monthTitle(month)}</button>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setMonth((value) => shiftMonth(value, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <CalendarGrid month={month} entries={calendarEntries} />
          <div className="mt-4 space-y-2 sm:hidden">
            {monthEntries.map((entry) => <CalendarRow key={entry.id} entry={entry} />)}
            {!monthEntries.length && <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">No calendar entries this month.</div>}
          </div>
          {canManage && (events || []).length > 0 && <div className="mt-5 border-t pt-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Manage team events</div>
            <div className="space-y-2">{(events || []).filter((item: any) => item.startDate?.slice(0, 7) === month).map((item: any) => <div key={item.id} className="flex items-center gap-3 rounded-xl bg-[#f7f4ed] p-3"><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{item.title}</div><div className="mt-1 truncate text-[9px] text-muted-foreground">{dateLabel(item.startDate)}{item.location ? ` · ${item.location}` : ""} · {item.status}</div></div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditEvent(item)} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => onDeleteEvent(item.id)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>
          </div>}
        </CardContent>
      </Card>
    </div>

    <Card className="border-black/8 bg-white/90">
      <CardContent className="p-5">
        <SectionHeader icon={GitBranch} title="Organisation chart" note="Reporting lines come directly from each employee's manager field." />
        <OrganisationChart directory={activeDirectory.filter((item: TeamMember) => !term || [item.name, item.title, item.department].join(" ").toLowerCase().includes(term))} />
      </CardContent>
    </Card>
  </div>;
}

function CalendarGrid({ month, entries }: { month: string; entries: CalendarEntry[] }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = Array.from({ length: firstDay + dayCount }, (_, index) => index < firstDay ? null : index - firstDay + 1);
  while (cells.length % 7) cells.push(null);
  const today = malaysiaToday();

  return <div className="mt-4 hidden sm:block">
    <div className="grid grid-cols-7 gap-1">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="px-1 py-2 text-center text-[9px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{day}</div>)}</div>
    <div className="grid grid-cols-7 gap-1">{cells.map((day, index) => {
      if (!day) return <div key={`empty-${index}`} className="min-h-24 rounded-lg bg-black/[.015]" />;
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const dayEntries = entries.filter((entry) => entry.startDate <= date && entry.endDate >= date);
      return <div key={date} className={cn("min-h-24 rounded-lg border bg-[#fbfaf7] p-1.5", date === today && "border-[#ba5c42]") }>
        <div className={cn("mb-1 text-[10px] font-medium", date === today && "text-[#ba5c42]")}>{day}</div>
        <div className="space-y-1">{dayEntries.slice(0, 3).map((entry) => <div key={entry.id} title={entry.title} className={cn("truncate rounded px-1.5 py-1 text-[8px] font-medium", eventTone(entry.type))}>{entry.title}</div>)}{dayEntries.length > 3 && <div className="px-1 text-[8px] text-muted-foreground">+{dayEntries.length - 3} more</div>}</div>
      </div>;
    })}</div>
  </div>;
}

function CalendarRow({ entry }: { entry: CalendarEntry }) {
  return <div className="flex items-start gap-3 rounded-xl border bg-[#fbfaf7] p-3">
    <div className={cn("rounded-lg px-2 py-1 text-[9px] font-semibold", eventTone(entry.type))}>{entry.type}</div>
    <div className="min-w-0 flex-1"><div className="text-xs font-semibold">{entry.title}</div><div className="mt-1 text-[9px] text-muted-foreground">{dateLabel(entry.startDate)}{entry.endDate !== entry.startDate ? ` – ${dateLabel(entry.endDate)}` : ""}{entry.meta ? ` · ${entry.meta}` : ""}</div>{entry.location && <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground"><MapPin className="h-3 w-3" />{entry.location}</div>}</div>
  </div>;
}

function OrganisationChart({ directory }: { directory: TeamMember[] }) {
  const people = [...directory].sort((a, b) => (a.department || "").localeCompare(b.department || "") || a.name.localeCompare(b.name));
  const byId = new Map(people.map((person) => [person.id, person]));
  const reports = new Map<string, TeamMember[]>();
  for (const person of people) {
    if (!person.managerId || !byId.has(person.managerId) || person.managerId === person.id) continue;
    reports.set(person.managerId, [...(reports.get(person.managerId) || []), person]);
  }
  const roots = people.filter((person) => !person.managerId || !byId.has(person.managerId) || person.managerId === person.id);
  const rows: { person: TeamMember; depth: number }[] = [];
  const visited = new Set<string>();
  const visit = (person: TeamMember, depth: number) => {
    if (visited.has(person.id)) return;
    visited.add(person.id);
    rows.push({ person, depth });
    for (const report of (reports.get(person.id) || []).sort((a, b) => a.name.localeCompare(b.name))) visit(report, Math.min(depth + 1, 5));
  };
  for (const root of roots) visit(root, 0);
  for (const person of people) visit(person, 0);

  if (!rows.length) return <EmptyState icon={UsersRound} title="No reporting lines yet" note="Add employees and assign a manager in People to build this chart automatically." />;

  return <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
    <div className="space-y-2">{rows.map(({ person, depth }) => <div key={person.id} style={{ paddingLeft: `${depth * 18}px` }}>
      <div className="relative flex items-center gap-3 rounded-xl border bg-[#fbfaf7] p-3">{depth > 0 && <div className="absolute -left-3 top-1/2 h-px w-3 bg-black/15" />}<div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold", depth === 0 ? "bg-[#202c25] text-white" : "bg-[#eee9df] text-[#4e5a52]")}>{initials(person.name)}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{person.name}</div><div className="mt-1 truncate text-[10px] text-muted-foreground">{person.title || "Role not set"} · {person.department || "Unassigned"}</div></div>{(reports.get(person.id) || []).length > 0 && <span className="rounded-full bg-black/5 px-2 py-1 text-[9px] text-muted-foreground">{reports.get(person.id)?.length} direct</span>}</div>
    </div>)}</div>
    <div className="grid content-start gap-2 sm:grid-cols-2 xl:grid-cols-1">{Array.from(new Set(people.map((person) => person.department || "Unassigned"))).sort().map((department) => <div key={department} className="flex items-center justify-between rounded-xl bg-[#f7f4ed] p-3"><div><div className="text-xs font-semibold">{department}</div><div className="mt-1 text-[9px] text-muted-foreground">Department</div></div><div className="text-lg font-semibold">{people.filter((person) => (person.department || "Unassigned") === department).length}</div></div>)}</div>
  </div>;
}

function SectionHeader({ icon: Icon, title, note, action }: any) {
  return <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1ece2] text-[#ba5c42]"><Icon className="h-4 w-4" /></div><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p></div></div>{action}</div>;
}

function HubStat({ icon: Icon, label, value, note }: any) {
  return <Card className="border-black/8 bg-white/90"><CardContent className="flex items-center justify-between gap-3 p-4"><div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{note}</div></div><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1ece2] text-[#ba5c42]"><Icon className="h-4 w-4" /></div></CardContent></Card>;
}

function AnnouncementStatus({ value }: { value: string }) {
  const tone = value === "Published" ? "bg-emerald-50 text-emerald-700" : value === "Draft" ? "bg-amber-50 text-amber-700" : "bg-black/5 text-muted-foreground";
  return <span className={cn("rounded-full px-2 py-1 text-[9px] font-medium", tone)}>{value}</span>;
}

function EmptyState({ icon: Icon, title, note, action }: any) {
  return <div className="rounded-2xl border border-dashed p-8 text-center"><Icon className="mx-auto h-6 w-6 text-muted-foreground" /><div className="mt-3 text-sm font-semibold">{title}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>{action && <Button size="sm" className="mt-4" onClick={action}><Plus className="h-3.5 w-3.5" />Create</Button>}</div>;
}

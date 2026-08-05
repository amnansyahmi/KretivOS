"use client";

/**
 * The daily task log.
 *
 * Attendance says when somebody was at work; this says what the hours went
 * into. For an agency that is the more useful half — it is what shows a
 * retainer running at twice the hours it was priced for, and the only honest
 * basis for quoting the next one.
 *
 * A day holds as many tasks as it took, which is the shape the first version
 * got wrong: one "Log task" button at the top made a day look like it had room
 * for one thing. Every day now carries its own Add, its own running total, and
 * its tasks listed underneath — so a second task is the obvious next action
 * rather than a rediscovery of the button at the top of the page.
 *
 * Laid out for a phone first: the row that used to squeeze a task, a time range
 * and two buttons onto one line now stacks, because logging happens on a phone
 * at the end of a day far more often than at a desk.
 */

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Copy, ListChecks, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateInput, MonthInput } from "@/components/date-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  entriesForPeriod, formatDuration, summariseByDay, summariseByProject, toHours,
  totalMinutes, validateEntry, type TimesheetEntry,
} from "@/lib/timesheet";
import { cn } from "@/lib/utils";

type View = "week" | "month";

const localDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const parseDate = (value: string) => new Date(`${value}T00:00:00+08:00`);
const addDays = (value: string, count: number) => { const date = parseDate(value); date.setDate(date.getDate() + count); return localDate(date); };
const monday = (value: string) => { const date = parseDate(value); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); return localDate(date); };
const dayName = (value: string) => parseDate(value).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "long" });
const dayShort = (value: string) => parseDate(value).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short" });
const monthTitle = (value: string) => new Date(`${value}-01T00:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", month: "long", year: "numeric" });

export function HRMSTimesheet({ entries, employees, session, canSeeEveryone, employeeName, query, onSave, onDelete }: any) {
  const [view, setView] = useState<View>("week");
  const [weekStart, setWeekStart] = useState(() => monday(localDate()));
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [employeeId, setEmployeeId] = useState(canSeeEveryone ? "" : session.userId);
  const [editing, setEditing] = useState<TimesheetEntry | null>(null);

  const week = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const term = String(query || "").trim().toLowerCase();

  const visible = useMemo(() => (entries as TimesheetEntry[]).filter((entry) => {
    if (employeeId && entry.employeeId !== employeeId) return false;
    if (term && ![entry.task, entry.project, entry.notes].join(" ").toLowerCase().includes(term)) return false;
    return true;
  }), [entries, employeeId, term]);

  const inWeek = visible.filter((entry) => String(entry.date) >= weekStart && String(entry.date) <= week[6]);
  const inMonth = visible.filter((entry) => String(entry.date).startsWith(month));
  const scoped = view === "week" ? inWeek : inMonth;

  const byProject = summariseByProject(scoped);
  const scopedMinutes = totalMinutes(scoped);

  function blank(date: string): TimesheetEntry {
    return { employeeId: employeeId || session.userId, date, task: "", startTime: "09:00", endTime: "10:00", project: "", notes: "", billable: false };
  }

  /**
   * A new task starting where the last one on that day finished.
   *
   * The overwhelmingly common case is logging a day in order after the fact, so
   * the next task begins when the previous one ended rather than at nine again.
   */
  function nextFor(date: string): TimesheetEntry {
    const onDay = scoped.filter((entry) => entry.date === date).sort((a, b) => String(a.endTime).localeCompare(String(b.endTime)));
    const last = onDay[onDay.length - 1];
    if (!last?.endTime) return blank(date);
    const [hour, minute] = String(last.endTime).split(":").map(Number);
    const end = `${String(Math.min(23, hour + 1)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return { ...blank(date), startTime: last.endTime, endTime: end, project: last.project };
  }

  return <div className="space-y-4">
    <div className="overflow-x-auto rounded-2xl border bg-card p-1.5 shadow-sm">
      <div className="flex min-w-max gap-1">{([["week", "This week"], ["month", "Monthly report"]] as const).map(([id, label]) => (
        <button key={id} onClick={() => setView(id)} className={cn("rounded-xl px-4 py-2.5 text-xs font-semibold sm:text-sm", view === id ? "bg-foreground text-white" : "text-muted-foreground hover:bg-background")}>{label}</button>
      ))}</div>
    </div>

    <Card className="border-black/8 bg-white/90"><CardContent className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{view === "week" ? "Weekly task log" : "Monthly report"}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{canSeeEveryone
            ? "What the team's hours went into. Attendance records when people were here; this records what they worked on."
            : "What your hours went into. A day can hold as many tasks as it took."}</p>
        </div>
        {canSeeEveryone && <Select className="sm:w-52" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
          <option value="">Everyone</option>
          {employees.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {view === "week" ? <>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" className="min-w-0 flex-1 truncate sm:flex-none" onClick={() => setWeekStart(monday(localDate()))}>{dayShort(weekStart)} – {dayShort(week[6])}</Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week"><ChevronRight className="h-4 w-4" /></Button>
        </> : <MonthInput value={month} onChange={(event) => setMonth(event.target.value)} className="max-w-44" />}
        <div className="ml-auto shrink-0 text-right">
          <div className="text-lg font-semibold">{toHours(scopedMinutes)}h</div>
          <div className="text-[10px] text-muted-foreground">{view === "week" ? "this week" : "this month"}</div>
        </div>
      </div>
    </CardContent></Card>

    {byProject.length > 0 && <Card className="border-black/8 bg-white/90"><CardContent className="p-4 sm:p-5">
      <h3 className="text-sm font-semibold">Where the {view === "week" ? "week" : "month"} went</h3>
      <div className="mt-3 space-y-2.5">{byProject.map((row) => <div key={row.project}>
        <div className="flex justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium">{row.project}</span><span className="shrink-0 text-muted-foreground">{formatDuration(row.minutes)}</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-accent" style={{ width: `${scopedMinutes ? row.minutes / scopedMinutes * 100 : 0}%` }} /></div>
      </div>)}</div>
    </CardContent></Card>}

    {view === "week" && <div className="space-y-3">{week.map((date) => {
      const dayEntries = inWeek.filter((entry) => entry.date === date).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
      const minutes = totalMinutes(dayEntries);
      const isToday = date === localDate();
      return <Card key={date} className={cn("border-black/8 bg-white/90", !dayEntries.length && "bg-white/60")}><CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-semibold">{dayName(date)}</span>
              <span className="text-[11px] text-muted-foreground">{dayShort(date)}</span>
              {isToday && <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-semibold text-white">Today</span>}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{dayEntries.length ? `${formatDuration(minutes)} · ${dayEntries.length} task${dayEntries.length === 1 ? "" : "s"}` : "Nothing logged"}</div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setEditing(nextFor(date))} aria-label={`Add a task on ${dayName(date)}`}><Plus className="h-3.5 w-3.5" />Add</Button>
        </div>

        {dayEntries.length > 0 && <div className="mt-3 space-y-2">{dayEntries.map((entry) => <TaskRow
          key={entry.id}
          entry={entry}
          showWho={canSeeEveryone && !employeeId}
          employeeName={employeeName}
          onEdit={() => setEditing({ ...entry })}
          onDuplicate={() => setEditing({ ...entry, id: undefined, task: entry.task, startTime: entry.endTime, endTime: entry.endTime })}
          onDelete={() => onDelete(entry.id)}
        />)}</div>}
      </CardContent></Card>;
    })}</div>}

    {view === "month" && <MonthlyReport entries={inMonth} month={month} canSeeEveryone={canSeeEveryone} employeeName={employeeName} />}

    {view === "week" && !inWeek.length && <div className="rounded-2xl border border-dashed bg-white/50 p-10 text-center">
      <ListChecks className="mx-auto h-7 w-7 text-muted-foreground" />
      <div className="mt-3 font-semibold">Nothing logged this week</div>
      <p className="mt-1 text-xs text-muted-foreground">Use Add on any day to log what you worked on.</p>
    </div>}

    {editing && <EntryDialog
      draft={editing}
      setDraft={setEditing}
      employees={employees}
      canPickEmployee={canSeeEveryone}
      onClose={() => setEditing(null)}
      onSave={async () => { await onSave(editing); setEditing(null); }}
    />}
  </div>;
}

/**
 * One logged task.
 *
 * Stacked rather than laid out in a row: on a phone the time range, the task,
 * the project and two icon buttons cannot share a line without the task text
 * collapsing to a column two words wide.
 */
function TaskRow({ entry, showWho, employeeName, onEdit, onDuplicate, onDelete }: any) {
  return <div className="rounded-xl border bg-card p-3">
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-5">{entry.task}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 tabular-nums"><Clock3 className="h-3 w-3" />{entry.startTime}–{entry.endTime}</span>
          <span className="font-semibold text-foreground-soft">{formatDuration(entry.durationMinutes)}</span>
          {entry.project && <span className="rounded-full bg-black/5 px-2 py-0.5">{entry.project}</span>}
          {entry.billable && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">Billable</span>}
          {showWho && <span>{employeeName(entry.employeeId)}</span>}
        </div>
        {entry.notes && <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{entry.notes}</p>}
        {entry.overlapWarning && <p className="mt-1.5 text-[11px] text-amber-700">{entry.overlapWarning}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDuplicate} aria-label={`Log another task after ${entry.task}`}><Copy className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label={`Edit ${entry.task}`}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={onDelete} aria-label={`Delete ${entry.task}`}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  </div>;
}

/**
 * The month, per person and per day.
 *
 * This is the half that moved out of Attendance, where it sat next to hours
 * *worked* and invited the two to be read as the same number. They are not:
 * attendance is when somebody was clocked in, this is what they wrote down.
 */
function MonthlyReport({ entries, month, canSeeEveryone, employeeName }: any) {
  const days = summariseByDay(entries);
  const people = useMemo(() => {
    const byPerson = new Map<string, { id: string; minutes: number; entries: number; billable: number }>();
    for (const entry of entries as TimesheetEntry[]) {
      const id = String(entry.employeeId ?? "");
      const row = byPerson.get(id) ?? { id, minutes: 0, entries: 0, billable: 0 };
      row.minutes += Math.max(0, Number(entry.durationMinutes) || 0);
      row.entries += 1;
      if (entry.billable) row.billable += Math.max(0, Number(entry.durationMinutes) || 0);
      byPerson.set(id, row);
    }
    return [...byPerson.values()].sort((a, b) => b.minutes - a.minutes);
  }, [entries]);

  function csv() {
    const headers = ["Date", "Team member", "Task", "Project", "From", "To", "Hours", "Billable", "Notes"];
    const rows = [...entries].sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)) || String(a.startTime).localeCompare(String(b.startTime)))
      .map((entry: any) => [entry.date, employeeName(entry.employeeId), entry.task, entry.project || "", entry.startTime, entry.endTime, toHours(entry.durationMinutes), entry.billable ? "Yes" : "No", entry.notes || ""]);
    const content = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `timesheet-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!entries.length) return <div className="rounded-2xl border border-dashed bg-white/50 p-10 text-center">
    <CalendarDays className="mx-auto h-7 w-7 text-muted-foreground" />
    <div className="mt-3 font-semibold">Nothing logged in {monthTitle(month)}</div>
  </div>;

  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={csv}><Printer className="h-3.5 w-3.5" />Export CSV</Button>
    </div>

    {canSeeEveryone && people.length > 1 && <Card className="overflow-hidden border-black/8 bg-white/90"><CardContent className="p-0">
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs">
        <thead className="bg-background"><tr><th className="p-4">Team member</th><th className="p-4">Tasks</th><th className="p-4">Logged</th><th className="p-4">Billable</th></tr></thead>
        <tbody>{people.map((row) => <tr key={row.id} className="border-t">
          <td className="p-4 font-semibold">{employeeName(row.id)}</td>
          <td className="p-4">{row.entries}</td>
          <td className="p-4 tabular-nums">{formatDuration(row.minutes)}</td>
          <td className="p-4 tabular-nums">{formatDuration(row.billable)}</td>
        </tr>)}</tbody>
      </table></div>
    </CardContent></Card>}

    <Card className="border-black/8 bg-white/90"><CardContent className="p-4 sm:p-5">
      <h3 className="text-sm font-semibold">Day by day</h3>
      <div className="mt-3 space-y-2">{days.map((day) => <div key={day.date} className="flex items-center gap-3 rounded-xl bg-background p-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">{dayShort(day.date)}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{day.entries} task{day.entries === 1 ? "" : "s"}{day.billableMinutes > 0 ? ` · ${formatDuration(day.billableMinutes)} billable` : ""}</div>
        </div>
        <div className="shrink-0 text-sm font-semibold tabular-nums">{formatDuration(day.minutes)}</div>
      </div>)}</div>
    </CardContent></Card>
  </div>;
}

function EntryDialog({ draft, setDraft, employees, canPickEmployee, onClose, onSave }: any) {
  const update = (key: string, value: any) => setDraft({ ...draft, [key]: value });
  // Shown as the form is filled rather than on submit, so a backwards time is
  // corrected where it was typed.
  const problems = validateEntry(draft);
  const problemFor = (field: string) => problems.find((problem) => problem.field === field)?.message;

  return <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/45 sm:items-center sm:p-4">
    <Card className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-b-none bg-background sm:rounded-2xl">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{draft.id ? "Edit task" : "Log task"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">What you worked on, and between what times.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close task editor"><X className="h-4 w-4" /></Button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {canPickEmployee && <Label wide label="Team member">
            <Select value={draft.employeeId} onChange={(event) => update("employeeId", event.target.value)}>
              {employees.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Label>}
          <Label wide label="Task" problem={problemFor("task")}>
            <Input value={draft.task || ""} onChange={(event) => update("task", event.target.value)} placeholder="Storyboard revisions for Chef Ammar" />
          </Label>
          <Label label="Date" problem={problemFor("date")}>
            <DateInput value={draft.date || ""} onChange={(event) => update("date", event.target.value)} />
          </Label>
          <Label label="Project or client">
            <Input value={draft.project || ""} onChange={(event) => update("project", event.target.value)} />
          </Label>
          <Label label="From" problem={problemFor("startTime")}>
            <Input type="time" value={draft.startTime || ""} onChange={(event) => update("startTime", event.target.value)} />
          </Label>
          <Label label="To" problem={problemFor("endTime")}>
            <Input type="time" value={draft.endTime || ""} onChange={(event) => update("endTime", event.target.value)} />
          </Label>
          <label className="flex items-center gap-3 rounded-xl border bg-card p-3 text-xs font-medium sm:col-span-2">
            <input type="checkbox" className="h-4 w-4" checked={Boolean(draft.billable)} onChange={(event) => update("billable", event.target.checked)} />
            Billable to the client
          </label>
          <Label wide label="Notes">
            <Textarea value={draft.notes || ""} onChange={(event) => update("notes", event.target.value)} className="min-h-24" />
          </Label>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{problems.length ? "Fix the highlighted fields" : formatDuration(validDuration(draft))}</div>
          <div className="hidden flex-1 sm:block" />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 sm:flex-none" onClick={onSave} disabled={problems.length > 0}>Save task</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>;
}

function validDuration(draft: TimesheetEntry) {
  const [startHour, startMinute] = String(draft.startTime || "").split(":").map(Number);
  const [endHour, endMinute] = String(draft.endTime || "").split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some((part) => !Number.isFinite(part))) return 0;
  return Math.max(0, (endHour * 60 + endMinute) - (startHour * 60 + startMinute));
}

function Label({ label, problem, wide, children }: { label: string; problem?: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={cn("block text-xs font-medium text-foreground-soft", wide && "sm:col-span-2")}>
    <span className="flex items-center justify-between gap-2">{label}{problem && <span className="text-[10px] font-normal text-red-600">{problem}</span>}</span>
    <div className="mt-2">{children}</div>
  </label>;
}

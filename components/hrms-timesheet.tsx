"use client";

/**
 * The daily task log.
 *
 * Attendance says when somebody was at work; this says what the hours went
 * into. For an agency that is the more useful half — it is what shows a
 * retainer running at twice the hours it was priced for, and the only honest
 * basis for quoting the next one.
 *
 * Built around the week rather than the month, because logging is a daily habit
 * and the question being asked is almost always "what have I not written up
 * yet". A month view answers a different question, and gets it later.
 */

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ListChecks, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateInput } from "@/components/date-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDuration, summariseByDay, summariseByProject, toHours, totalMinutes,
  validateEntry, type TimesheetEntry,
} from "@/lib/timesheet";
import { cn } from "@/lib/utils";

const localDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const parseDate = (value: string) => new Date(`${value}T00:00:00+08:00`);
const addDays = (value: string, count: number) => { const date = parseDate(value); date.setDate(date.getDate() + count); return localDate(date); };
const monday = (value: string) => { const date = parseDate(value); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); return localDate(date); };
const dayLabel = (value: string) => parseDate(value).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short" });

export function HRMSTimesheet({ entries, employees, session, canSeeEveryone, employeeName, query, onSave, onDelete }: any) {
  const [weekStart, setWeekStart] = useState(() => monday(localDate()));
  const [employeeId, setEmployeeId] = useState(canSeeEveryone ? "" : session.userId);
  const [editing, setEditing] = useState<TimesheetEntry | null>(null);

  const week = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const weekEnd = week[6];
  const term = String(query || "").trim().toLowerCase();

  const mine = useMemo(() => (entries as TimesheetEntry[])
    .filter((entry) => {
      const date = String(entry.date || "");
      if (date < weekStart || date > weekEnd) return false;
      if (employeeId && entry.employeeId !== employeeId) return false;
      if (term && ![entry.task, entry.project, entry.notes].join(" ").toLowerCase().includes(term)) return false;
      return true;
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.startTime).localeCompare(String(b.startTime))), [entries, weekStart, weekEnd, employeeId, term]);

  const byDay = summariseByDay(mine);
  const byProject = summariseByProject(mine);
  const weekMinutes = totalMinutes(mine);

  function blank(date: string): TimesheetEntry {
    return { employeeId: employeeId || session.userId, date, task: "", startTime: "09:00", endTime: "10:00", project: "", notes: "", billable: false };
  }

  return <div className="space-y-4">
    <Card className="border-black/8 bg-white/90"><CardContent className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Weekly task log</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{canSeeEveryone ? "What the team's hours went into. Attendance records when people were here; this records what they worked on." : "What your hours went into. Log a task with the time you started and finished."}</p>
        </div>
        {canSeeEveryone && <Select className="w-full sm:w-52" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
          <option value="">Everyone</option>
          {employees.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>}
        <Button onClick={() => setEditing(blank(localDate()))}><Plus className="h-4 w-4" />Log task</Button>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setWeekStart(monday(localDate()))}>{dayLabel(weekStart)} – {dayLabel(weekEnd)}</Button>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week"><ChevronRight className="h-4 w-4" /></Button>
        <div className="flex-1" />
        <div className="text-right">
          <div className="text-lg font-semibold">{toHours(weekMinutes)}h</div>
          <div className="text-[10px] text-muted-foreground">logged this week</div>
        </div>
      </div>
    </CardContent></Card>

    {byProject.length > 0 && <Card className="border-black/8 bg-white/90"><CardContent className="p-5">
      <h3 className="text-sm font-semibold">Where the week went</h3>
      <div className="mt-3 space-y-2">{byProject.map((row) => <div key={row.project}>
        <div className="flex justify-between text-xs"><span className="font-medium">{row.project}</span><span className="text-muted-foreground">{formatDuration(row.minutes)}</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-accent" style={{ width: `${weekMinutes ? row.minutes / weekMinutes * 100 : 0}%` }} /></div>
      </div>)}</div>
    </CardContent></Card>}

    <div className="space-y-3">{week.map((date) => {
      const day = byDay.find((row) => row.date === date);
      const dayEntries = mine.filter((entry) => entry.date === date);
      return <Card key={date} className={cn("border-black/8 bg-white/90", !dayEntries.length && "opacity-70")}><CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{dayLabel(date)}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">{day ? `${formatDuration(day.minutes)} across ${day.entries} task${day.entries === 1 ? "" : "s"}` : "Nothing logged"}</div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing(blank(date))}><Plus className="h-3.5 w-3.5" />Add</Button>
        </div>

        {dayEntries.length > 0 && <div className="mt-3 space-y-2">{dayEntries.map((entry) => <div key={entry.id} className="flex flex-wrap items-start gap-3 rounded-xl border bg-card p-3">
          <div className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{entry.startTime}–{entry.endTime}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{entry.task}</div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
              {entry.project && <span>{entry.project}</span>}
              {canSeeEveryone && !employeeId && <span>{employeeName(entry.employeeId)}</span>}
              {entry.billable && <span className="text-accent">Billable</span>}
            </div>
            {entry.notes && <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{entry.notes}</p>}
            {entry.overlapWarning && <p className="mt-1 text-[11px] text-amber-700">{entry.overlapWarning}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-semibold tabular-nums">{formatDuration(entry.durationMinutes)}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing({ ...entry })} aria-label="Edit entry"><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => onDelete(entry.id)} aria-label="Delete entry"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>)}</div>}
      </CardContent></Card>;
    })}</div>

    {!mine.length && <div className="rounded-2xl border border-dashed bg-white/50 p-10 text-center">
      <ListChecks className="mx-auto h-7 w-7 text-muted-foreground" />
      <div className="mt-3 font-semibold">Nothing logged this week</div>
      <p className="mt-1 text-xs text-muted-foreground">Log what you worked on, and how long it took.</p>
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

        <div className="mt-6 flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{problems.length ? "Fix the highlighted fields" : formatDuration(validDuration(draft))}</div>
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={problems.length > 0}>Save task</Button>
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

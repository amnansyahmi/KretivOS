/**
 * Daily task logging.
 *
 * Attendance answers when somebody was at work; it says nothing about what the
 * hours went into. For an agency that is the more valuable half — it is what
 * tells you a retainer is running at twice the hours it is priced for, and it
 * is the only honest basis for quoting the next one.
 *
 * Kept separate from attendance on purpose. Attendance is evidence, captured
 * with a photo and a location and not editable after the fact; a timesheet is a
 * description somebody writes, corrects, and writes more of. Merging them would
 * either make attendance editable or make task notes as rigid as a clock-in.
 *
 * Pure, and asserted directly in `timesheet.test.ts`.
 */

export type TimesheetEntry = {
  id?: string;
  employeeId?: string;
  date?: string;
  task?: string;
  /** "HH:MM", 24-hour. */
  startTime?: string;
  endTime?: string;
  /** Derived from the times; stored so reports do not re-parse every row. */
  durationMinutes?: number;
  project?: string;
  category?: string;
  notes?: string;
  billable?: boolean;
  /**
   * A photograph of the work, optionally. A storyboard frame or a site photo
   * says more about a day than a line of text does, and a timesheet is the
   * record a client dispute over billed hours is settled from.
   */
  attachmentId?: string;
  /** Set by the API when the entry shares minutes with another on the same day. */
  overlapWarning?: string;
};

const clean = (value: unknown) => String(value ?? "").trim();

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isTime(value: unknown) {
  return TIME.test(clean(value));
}

export function minutesFromTime(value: string): number | null {
  const match = TIME.exec(clean(value));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Minutes between two times on the same day.
 *
 * A finish before the start is rejected rather than wrapped past midnight. An
 * entry ending at 02:00 is almost always a mistyped 14:00, and silently
 * crediting sixteen hours is worse than asking.
 */
export function durationBetween(startTime: string, endTime: string): number | null {
  const start = minutesFromTime(startTime);
  const end = minutesFromTime(endTime);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

export function formatDuration(minutes: unknown): string {
  const total = Math.max(0, Math.round(num(minutes)));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Hours to two places, for totals people read rather than compute with. */
export function toHours(minutes: unknown): number {
  return Math.round(num(minutes) / 60 * 100) / 100;
}

export type TimesheetProblem = { field: string; message: string };

/** Everything wrong with an entry, so a form can show it all at once. */
export function validateEntry(entry: TimesheetEntry): TimesheetProblem[] {
  const problems: TimesheetProblem[] = [];
  if (!clean(entry.employeeId)) problems.push({ field: "employeeId", message: "Select a team member." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(entry.date))) problems.push({ field: "date", message: "A valid date is required." });
  if (!clean(entry.task)) problems.push({ field: "task", message: "Describe the task." });
  if (!isTime(clean(entry.startTime))) problems.push({ field: "startTime", message: "Start time must be HH:MM." });
  if (!isTime(clean(entry.endTime))) problems.push({ field: "endTime", message: "End time must be HH:MM." });
  if (isTime(clean(entry.startTime)) && isTime(clean(entry.endTime)) && durationBetween(clean(entry.startTime), clean(entry.endTime)) === null) {
    problems.push({ field: "endTime", message: "End time must be after the start time." });
  }
  return problems;
}

/** An entry with its duration worked out and its text tidied. */
export function normaliseEntry(entry: TimesheetEntry): TimesheetEntry {
  const startTime = clean(entry.startTime);
  const endTime = clean(entry.endTime);
  return {
    ...entry,
    employeeId: clean(entry.employeeId),
    date: clean(entry.date),
    task: clean(entry.task).slice(0, 300),
    startTime,
    endTime,
    durationMinutes: durationBetween(startTime, endTime) ?? 0,
    project: clean(entry.project).slice(0, 120),
    category: clean(entry.category).slice(0, 60),
    attachmentId: clean(entry.attachmentId),
    notes: clean(entry.notes).slice(0, 1000),
    billable: Boolean(entry.billable),
  };
}

/**
 * Entries that overlap one already logged.
 *
 * Two tasks cannot occupy the same minute, and the usual cause is logging the
 * afternoon twice rather than genuine multitasking. Reported rather than
 * refused: somebody who really was in a call while a render ran should be able
 * to say so, and a warning tells them the day will read as longer than it was.
 */
export function overlapsWith(entry: TimesheetEntry, existing: TimesheetEntry[]): TimesheetEntry[] {
  const start = minutesFromTime(clean(entry.startTime));
  const end = minutesFromTime(clean(entry.endTime));
  if (start === null || end === null) return [];

  return existing.filter((other) => {
    if (other.id && other.id === entry.id) return false;
    if (clean(other.employeeId) !== clean(entry.employeeId)) return false;
    if (clean(other.date) !== clean(entry.date)) return false;
    const otherStart = minutesFromTime(clean(other.startTime));
    const otherEnd = minutesFromTime(clean(other.endTime));
    if (otherStart === null || otherEnd === null) return false;
    return start < otherEnd && otherStart < end;
  });
}

export type DaySummary = { date: string; minutes: number; entries: number; billableMinutes: number };

/** One row per day worked, newest first. */
export function summariseByDay(entries: TimesheetEntry[]): DaySummary[] {
  const byDate = new Map<string, DaySummary>();
  for (const entry of entries) {
    const date = clean(entry.date);
    if (!date) continue;
    const row = byDate.get(date) ?? { date, minutes: 0, entries: 0, billableMinutes: 0 };
    row.minutes += Math.max(0, num(entry.durationMinutes));
    row.entries += 1;
    if (entry.billable) row.billableMinutes += Math.max(0, num(entry.durationMinutes));
    byDate.set(date, row);
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Where a period's hours went, largest first. */
export function summariseByProject(entries: TimesheetEntry[]) {
  const byProject = new Map<string, { project: string; minutes: number; entries: number }>();
  for (const entry of entries) {
    const project = clean(entry.project) || "Unassigned";
    const row = byProject.get(project) ?? { project, minutes: 0, entries: 0 };
    row.minutes += Math.max(0, num(entry.durationMinutes));
    row.entries += 1;
    byProject.set(project, row);
  }
  return [...byProject.values()].sort((a, b) => b.minutes - a.minutes);
}

export function totalMinutes(entries: TimesheetEntry[]) {
  return entries.reduce((sum, entry) => sum + Math.max(0, num(entry.durationMinutes)), 0);
}

/** Entries for one person in one "YYYY-MM", earliest first. */
export function entriesForPeriod(entries: TimesheetEntry[], employeeId: string, period: string) {
  return entries
    .filter((entry) => clean(entry.employeeId) === clean(employeeId) && clean(entry.date).startsWith(clean(period)))
    .sort((a, b) => clean(a.date).localeCompare(clean(b.date)) || clean(a.startTime).localeCompare(clean(b.startTime)));
}

/**
 * One CSV cell, escaped.
 *
 * Every field is quoted rather than only the ones that need it. A task
 * description is free text: it contains commas, quotation marks and the
 * occasional newline pasted out of a brief, and any of those unquoted turns one
 * row into two or shifts every column after it. Quoting unconditionally costs a
 * few bytes and removes the question.
 */
function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

/**
 * A timesheet as CSV, for the export button.
 *
 * CRLF line endings because the file is opened in Excel far more often than
 * anywhere else, and Excel on Windows is the one reader that still cares.
 *
 * `employeeName` is passed in rather than looked up: the employee app knows
 * only its own user, the workspace knows everybody, and neither should have to
 * hand this function a directory it does not have.
 */
export function timesheetCsv(entries: TimesheetEntry[], employeeName: (id: string) => string): string {
  const headers = ["Date", "Team member", "Task", "Project", "From", "To", "Hours", "Billable", "Notes"];
  const rows = [...(Array.isArray(entries) ? entries : [])]
    .sort((a, b) => clean(a.date).localeCompare(clean(b.date)) || clean(a.startTime).localeCompare(clean(b.startTime)))
    .map((entry) => [
      entry.date, employeeName(clean(entry.employeeId)), entry.task, entry.project ?? "",
      entry.startTime, entry.endTime, toHours(entry.durationMinutes), entry.billable ? "Yes" : "No", entry.notes ?? "",
    ]);

  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

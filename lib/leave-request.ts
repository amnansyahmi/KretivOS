/**
 * What makes a leave request valid, and what it says once it is.
 *
 * The rules lived only on the server, so a request with the dates the wrong way
 * round was typed, submitted, refused, and then had to be typed again. The
 * server still checks — a browser is not a permission — but the form can now
 * say so while it is being filled in.
 *
 * Half days also needed a half they referred to. "0.5 days" told a manager
 * somebody was away for part of a day and left them to guess which part, which
 * is the one thing the request existed to communicate.
 *
 * Pure, and asserted directly in `leave-request.test.ts`.
 */

export type HalfDaySession = "first" | "second";

export const HALF_DAY_SESSIONS: { id: HalfDaySession; label: string; short: string }[] = [
  { id: "first", label: "First half · morning", short: "AM" },
  { id: "second", label: "Second half · afternoon", short: "PM" },
];

export type LeaveDraft = {
  employeeId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  halfDay?: boolean;
  halfDaySession?: string;
  reason?: string;
};

export type LeaveProblem = { field: string; message: string };

const clean = (value: unknown) => String(value ?? "").trim();
const isDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(clean(value));

export function toHalfDaySession(value: unknown): HalfDaySession {
  return clean(value) === "second" ? "second" : "first";
}

/**
 * Everything wrong with a draft, so a form can mark each field at once.
 *
 * Ordered by the field's position on the form rather than by severity: somebody
 * fixing three problems works top to bottom, and a list that jumps around reads
 * as three separate complaints.
 */
export function validateLeaveRequest(draft: LeaveDraft): LeaveProblem[] {
  const problems: LeaveProblem[] = [];
  const startDate = clean(draft.startDate);
  const endDate = clean(draft.endDate);

  if (!clean(draft.employeeId)) problems.push({ field: "employeeId", message: "Select a team member." });
  if (!clean(draft.type)) problems.push({ field: "type", message: "Choose a leave type." });

  if (!isDate(startDate)) problems.push({ field: "startDate", message: "Choose a start date." });
  if (!isDate(endDate)) problems.push({ field: "endDate", message: "Choose an end date." });

  if (isDate(startDate) && isDate(endDate) && endDate < startDate) {
    problems.push({ field: "endDate", message: "The end date cannot be before the start date." });
  }
  if (draft.halfDay && isDate(startDate) && isDate(endDate) && startDate !== endDate) {
    problems.push({ field: "endDate", message: "A half day covers one date, so the start and end must match." });
  }

  return problems;
}

export function leaveProblemFor(problems: LeaveProblem[], field: string) {
  return problems.find((problem) => problem.field === field)?.message ?? "";
}

/**
 * How a request reads once made.
 *
 * A half day names its half, because "0.5 days" is exactly the detail a
 * handover needs and exactly the one it was leaving out.
 */
export function describeLeaveDuration(record: LeaveDraft & { days?: number }): string {
  if (record.halfDay) {
    const session = HALF_DAY_SESSIONS.find((item) => item.id === toHalfDaySession(record.halfDaySession));
    return `Half day · ${session?.label ?? "First half · morning"}`;
  }
  const days = Number(record.days ?? 0);
  return `${days} working day${days === 1 ? "" : "s"}`;
}

/** The short form, for a calendar cell or a badge. */
export function shortLeaveLabel(record: LeaveDraft & { days?: number }): string {
  if (record.halfDay) return HALF_DAY_SESSIONS.find((item) => item.id === toHalfDaySession(record.halfDaySession))?.short ?? "AM";
  const days = Number(record.days ?? 0);
  return `${days}d`;
}

/** Normalises the half-day fields, so a full-day request never carries a stale session. */
export function normaliseHalfDay<T extends LeaveDraft>(draft: T): T & { halfDay: boolean; halfDaySession: HalfDaySession | "" } {
  const halfDay = Boolean(draft.halfDay);
  return {
    ...draft,
    halfDay,
    // Cleared when the request stops being a half day, so a record cannot say
    // "three days, second half".
    halfDaySession: halfDay ? toHalfDaySession(draft.halfDaySession) : "",
  };
}

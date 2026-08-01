/**
 * Turning a database date into a YYYY-MM-DD string.
 *
 * The codebase was doing this with `String(row.some_date).slice(0, 10)`, which
 * is correct only when the driver hands back a string. It does not: both
 * node-postgres and the Neon serverless driver parse a `date` column into a JS
 * Date, and `String(new Date(...))` is "Sat Aug 01 2026 …", whose first ten
 * characters are "Sat Aug 01". That is not a date, and every caller that fed it
 * to the ledger, to an aging bucket or to an LHDN submission was passing
 * nonsense. Invoice posting failed outright on it.
 *
 * Local components, not toISOString: pg parses a bare `date` into *local*
 * midnight. In a UTC deployment the two agree, but on a machine at UTC+8
 * toISOString would roll the calendar day backwards, so an invoice issued on
 * the 1st would post to the 31st of the month before — silently, and into a
 * period that may already be closed.
 */

const pad = (value: number) => String(value).padStart(2, "0");

/** Formats a Date using its local calendar day. */
export function isoDateFrom(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Accepts whatever a driver, a JSON body or a form produced and returns
 * YYYY-MM-DD, or `fallback` when the value is not a usable date.
 */
export function isoDate(value: unknown, fallback = ""): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : isoDateFrom(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    // Already a date, or an ISO timestamp whose date half is what we want.
    // Taken literally rather than parsed, so no timezone shift can apply.
    const leading = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (leading) return `${leading[1]}-${leading[2]}-${leading[3]}`;

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? fallback : isoDateFrom(parsed);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : isoDateFrom(parsed);
  }

  return fallback;
}

/** Today, in the same format. */
export const todayIso = () => isoDateFrom(new Date());

/** True when the value is a real YYYY-MM-DD date, rejecting things like 2026-02-31. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
}

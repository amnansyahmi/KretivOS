/**
 * The month grid behind a leave calendar.
 *
 * Written twice otherwise — once in the workspace's leave tab and once in the
 * employee app — and the two copies would answer the same question differently
 * the first time either was touched. A calendar that disagrees with itself
 * about whether a day is a holiday is worse than no calendar, because somebody
 * books leave against it.
 *
 * Pure, and asserted in `leave-calendar.test.ts`.
 */

import { fixedHolidays, mergeHolidays, type PublicHoliday } from "./work-calendar.ts";

const clean = (value: unknown) => String(value ?? "").trim();

export type HolidayOnDay = {
  name: string;
  /**
   * Whether HR put it there. A seeded date is the one that falls on the same
   * day every year and is shown before anybody confirms it — useful, but not
   * the same as gazetted, and an employee planning around it should be told.
   */
  confirmed: boolean;
};

/** The statuses that occupy a day. A rejected request is not leave. */
export const COMMITTED_LEAVE_STATUSES = ["Pending", "Approved"];

/**
 * Holidays for a year, configured entries winning over seeded ones.
 *
 * A state variation or a company day was chosen deliberately; a fixed-date
 * guess never overrides it.
 */
export function holidayMap(publicHolidays: unknown, year: number, state = "Selangor"): Map<string, HolidayOnDay> {
  const configured = (Array.isArray(publicHolidays) ? publicHolidays : [])
    .filter((item: any) => item?.date && item?.name) as PublicHoliday[];
  const configuredDates = new Set(configured.map((item) => clean(item.date)));

  return new Map(
    mergeHolidays(configured, fixedHolidays(year, state))
      .map((item) => [item.date, { name: item.name, confirmed: configuredDates.has(item.date) }]),
  );
}

/**
 * Every date each request covers, keyed by day.
 *
 * Expanded from the range rather than stored per day, because the request is
 * the record and a stored expansion would go stale the moment dates were
 * edited. The guard caps a runaway range at a bit over a year — long enough for
 * 98 days of maternity leave, short enough that a mistyped end date in 2099
 * cannot hang the browser.
 */
export function leaveDayMap(requests: unknown): Map<string, any[]> {
  const map = new Map<string, any[]>();

  for (const request of Array.isArray(requests) ? requests : []) {
    if (!COMMITTED_LEAVE_STATUSES.includes(clean(request?.status))) continue;
    const start = clean(request?.startDate);
    if (!start) continue;
    const end = clean(request?.endDate) || start;
    if (end < start) continue;

    const cursor = new Date(`${start}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) continue;

    for (let guard = 0; guard < 400 && cursor <= last; guard += 1) {
      const date = cursor.toISOString().slice(0, 10);
      map.set(date, [...(map.get(date) ?? []), request]);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return map;
}

/** The month `amount` months away, as `YYYY-MM`. */
export function shiftMonth(month: string, amount: number): string {
  const [year, index] = clean(month).split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(index)) return clean(month);
  const next = new Date(Date.UTC(year, index - 1 + amount, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The cells of a Sunday-first month grid.
 *
 * Leading blanks for the days before the first, trailing blanks to finish the
 * last week — so the grid is always whole weeks and never reflows as the month
 * changes under it.
 */
export function monthCells(month: string): (string | null)[] {
  const [year, index] = clean(month).split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(index)) return [];

  const firstWeekday = new Date(Date.UTC(year, index - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, index, 0)).getUTCDate();

  const cells: (string | null)[] = Array.from(
    { length: firstWeekday + dayCount },
    (_, cell) => cell < firstWeekday ? null : `${month}-${String(cell - firstWeekday + 1).padStart(2, "0")}`,
  );
  while (cells.length % 7) cells.push(null);
  return cells;
}

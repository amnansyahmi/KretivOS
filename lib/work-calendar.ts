/**
 * Which days are worked, which are rest days, and which are holidays.
 *
 * Leave counting used to hardcode Saturday and Sunday as the weekend. That is
 * right for most of the country and wrong for Johor, Kedah, Kelantan and
 * Terengganu, where the weekend is Friday and Saturday — so a leave request
 * there was silently counted against the wrong days and deducted the wrong
 * number from a balance. Nothing warned about it, because a hardcoded weekend
 * has no way to know it is in the wrong state.
 *
 * Public holidays have a related problem. They were a free-text box somebody
 * had to fill in from memory, so an empty box meant leave was counted straight
 * through Hari Raya and the team calendar showed nothing. Seeding what can be
 * seeded fixes most of it, and being explicit about the rest fixes the part
 * that matters more: the dates this file cannot know.
 *
 * Pure and data-only, asserted directly in `work-calendar.test.ts`.
 */

export type MalaysianState =
  | "Federal" | "Johor" | "Kedah" | "Kelantan" | "Melaka" | "Negeri Sembilan"
  | "Pahang" | "Perak" | "Perlis" | "Pulau Pinang" | "Sabah" | "Sarawak"
  | "Selangor" | "Terengganu" | "Wilayah Persekutuan";

export type PublicHoliday = { date: string; name: string };

/** Saturday and Sunday, as day-of-week numbers. */
export const DEFAULT_REST_DAYS = [0, 6];

/**
 * The states that rest on Friday and Saturday instead.
 *
 * Listed rather than inferred so the reason a calendar looks different is
 * findable, and so getting the list wrong is a one-line fix.
 */
export const FRIDAY_SATURDAY_STATES: MalaysianState[] = ["Johor", "Kedah", "Kelantan", "Terengganu"];

export function restDaysForState(state: string): number[] {
  return FRIDAY_SATURDAY_STATES.includes(state as MalaysianState) ? [5, 6] : DEFAULT_REST_DAYS;
}

/**
 * Day of week for a plain "YYYY-MM-DD", counted in UTC.
 *
 * A calendar date has no time zone, but `new Date("2026-08-05")` gives it one —
 * midnight UTC, which is the previous evening in Malaysia and therefore
 * sometimes the previous day. Building the date from its parts sidesteps that
 * entirely rather than correcting for it.
 */
export function dayOfWeek(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? "").trim());
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Rejects the impossible dates a regex happily accepts, like 2026-02-31.
  if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return parsed.getUTCDay();
}

export function isRestDay(date: string, restDays: number[] = DEFAULT_REST_DAYS) {
  const day = dayOfWeek(date);
  return day !== null && restDays.includes(day);
}

/** Every calendar date from start to end inclusive, in order. */
export function datesBetween(start: string, end: string): string[] {
  if (!dayOfWeek(start) && dayOfWeek(start) !== 0) return [];
  if (!dayOfWeek(end) && dayOfWeek(end) !== 0) return [];
  if (end < start) return [];

  const dates: string[] = [];
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, startDay));

  // Bounded so a malformed range cannot spin: a leave request spanning more
  // than a couple of years is a typo, not a request.
  for (let guard = 0; guard < 1100; guard += 1) {
    const value = cursor.toISOString().slice(0, 10);
    if (value > end) break;
    dates.push(value);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * The dates in a range that are actually worked.
 *
 * Rest days and public holidays both come out, because neither is leave the
 * employee should be charged for.
 */
export function workingDates(start: string, end: string, { restDays = DEFAULT_REST_DAYS, holidays = [] as string[] } = {}) {
  const excluded = new Set(holidays);
  return datesBetween(start, end).filter((date) => !isRestDay(date, restDays) && !excluded.has(date));
}

export function workingDayCount(start: string, end: string, options?: { restDays?: number[]; holidays?: string[] }) {
  return workingDates(start, end, options).length;
}

/**
 * Holidays that fall on the same date every year.
 *
 * `[month, day, name]`. Note the ones that are federal but not universal: New
 * Year's Day is not observed in every state, so a state that does not take it
 * needs the row removed rather than the list replaced.
 */
const FEDERAL_FIXED: [number, number, string][] = [
  [1, 1, "New Year's Day"],
  [5, 1, "Labour Day"],
  [8, 31, "National Day"],
  [9, 16, "Malaysia Day"],
  [12, 25, "Christmas Day"],
];

/**
 * State holidays with a fixed date.
 *
 * Deliberately short. Most state holidays are a ruler's birthday, which moves
 * when the ruler does, and a stale date presented as fact is worse than an
 * empty calendar somebody knows to fill. Only the ones that are stable enough
 * to seed are here; everything else is entered from the gazette.
 */
const STATE_FIXED: Partial<Record<MalaysianState, [number, number, string][]>> = {
  Selangor: [[12, 11, "Sultan of Selangor's Birthday"]],
  "Wilayah Persekutuan": [[2, 1, "Federal Territory Day"]],
  Sarawak: [[7, 22, "Sarawak Day"]],
  "Negeri Sembilan": [[1, 14, "Yang di-Pertuan Besar's Birthday"]],
};

/**
 * The holidays whose dates are set each year rather than known in advance.
 *
 * Almost all of them: the Islamic ones follow the Hijri calendar, Chinese New
 * Year and Wesak follow lunar calendars, and Deepavali and Thaipusam are set
 * by observation. Their dates are gazetted annually, so this file lists the
 * names and refuses to guess the dates — a calendar that is confidently wrong
 * about Hari Raya is worse than one that is visibly incomplete.
 */
export const GAZETTED_HOLIDAYS = [
  "Chinese New Year",
  "Chinese New Year (second day)",
  "Thaipusam",
  "Nuzul Al-Quran",
  "Hari Raya Aidilfitri",
  "Hari Raya Aidilfitri (second day)",
  "Wesak Day",
  "Birthday of the Yang di-Pertuan Agong",
  "Hari Raya Haji",
  "Awal Muharram",
  "Maulidur Rasul",
  "Deepavali",
];

/** The fixed-date holidays for a year and state, sorted. */
export function fixedHolidays(year: number, state: string = "Selangor"): PublicHoliday[] {
  const rows = [...FEDERAL_FIXED, ...(STATE_FIXED[state as MalaysianState] ?? [])];
  return rows
    .map(([month, day, name]) => ({ date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Which gazetted holidays have not been entered for a year yet.
 *
 * Matched on name rather than date, since the date is the unknown. Used to tell
 * HR exactly what is still missing instead of leaving them to notice on the
 * morning nobody comes in.
 */
export function missingGazettedHolidays(existing: PublicHoliday[], year: number) {
  const entered = new Set(
    existing
      .filter((holiday) => String(holiday.date ?? "").startsWith(String(year)))
      .map((holiday) => String(holiday.name ?? "").trim().toLowerCase()),
  );
  return GAZETTED_HOLIDAYS.filter((name) => !entered.has(name.toLowerCase()));
}

/**
 * Adds holidays without disturbing what is already there.
 *
 * A date already entered wins, because somebody chose it deliberately —
 * a state variation, or a company day the gazette knows nothing about.
 */
export function mergeHolidays(existing: PublicHoliday[], additions: PublicHoliday[]): PublicHoliday[] {
  const byDate = new Map(existing.filter((item) => item?.date).map((item) => [item.date, item]));
  for (const addition of additions) {
    if (!byDate.has(addition.date)) byDate.set(addition.date, addition);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

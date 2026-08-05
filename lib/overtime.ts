/**
 * Overtime, from the attendance that was already captured.
 *
 * Clock-out has been computing `overtimeMinutes` on every attendance record for
 * as long as photo attendance has existed, and nothing has ever read it. Payroll
 * asked for overtime as a ringgit figure somebody typed in — so the company was
 * collecting timestamped, photographed, geolocated evidence of overtime and then
 * paying against a number worked out somewhere else.
 *
 * Minutes are not enough on their own, because an hour is not worth the same on
 * every day. The Employment Act pays overtime at a higher multiple on a rest day
 * than on a working day, and higher again on a public holiday, so the same
 * hour's evidence has to be classified before it can be priced. That
 * classification comes from the rest days and public holidays in Settings,
 * which is why fixing the hardcoded weekend had to come first — an hour worked
 * on a Friday in Kelantan is rest-day overtime, and a calendar that thought the
 * weekend was Saturday would have paid it as ordinary.
 *
 * The multipliers and the divisor are settings rather than constants for the
 * same reason the statutory rates are: they are law, they move, and a company
 * may contract on better terms than the minimum.
 *
 * Pure, and asserted directly in `overtime.test.ts`.
 */

import { dayOfWeek, DEFAULT_REST_DAYS } from "./work-calendar.ts";

export type OvertimeClass = "normal" | "rest_day" | "public_holiday";

export type OvertimeRules = {
  /** Ordinary rate of pay is the monthly wage over this many days. */
  daysPerMonth: number;
  /** And the hourly rate is that over a normal day's hours. */
  hoursPerDay: number;
  normalMultiplier: number;
  restDayMultiplier: number;
  publicHolidayMultiplier: number;
};

/**
 * The statutory minimums, as a starting point.
 *
 * A month is treated as 26 days for this purpose, which is the convention the
 * Act uses rather than an average of actual days worked.
 */
export const DEFAULT_OVERTIME_RULES: OvertimeRules = {
  daysPerMonth: 26,
  hoursPerDay: 8,
  normalMultiplier: 1.5,
  restDayMultiplier: 2,
  publicHolidayMultiplier: 3,
};

export type AttendanceRecord = {
  employeeId?: string;
  date?: string;
  status?: string;
  overtimeMinutes?: number;
};

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: number) => Math.max(0, Math.round(value * 100) / 100);

/** A public holiday outranks a rest day, since it is paid at the higher multiple. */
export function classifyDay(date: string, { restDays = DEFAULT_REST_DAYS, holidays = new Set<string>() } = {}): OvertimeClass {
  if (holidays.has(date)) return "public_holiday";
  const day = dayOfWeek(date);
  return day !== null && restDays.includes(day) ? "rest_day" : "normal";
}

/** Monthly wage over the conventional number of days in a month. */
export function ordinaryRateOfPay(monthlyWage: number, rules: OvertimeRules = DEFAULT_OVERTIME_RULES) {
  const days = rules.daysPerMonth > 0 ? rules.daysPerMonth : DEFAULT_OVERTIME_RULES.daysPerMonth;
  return money(Math.max(0, num(monthlyWage)) / days);
}

export function hourlyRate(monthlyWage: number, rules: OvertimeRules = DEFAULT_OVERTIME_RULES) {
  const hours = rules.hoursPerDay > 0 ? rules.hoursPerDay : DEFAULT_OVERTIME_RULES.hoursPerDay;
  return ordinaryRateOfPay(monthlyWage, rules) / hours;
}

export function multiplierFor(kind: OvertimeClass, rules: OvertimeRules = DEFAULT_OVERTIME_RULES) {
  if (kind === "public_holiday") return rules.publicHolidayMultiplier;
  if (kind === "rest_day") return rules.restDayMultiplier;
  return rules.normalMultiplier;
}

export type OvertimeBand = { minutes: number; hours: number; multiplier: number; amount: number };

export type OvertimeSummary = {
  hourlyRate: number;
  normal: OvertimeBand;
  restDay: OvertimeBand;
  publicHoliday: OvertimeBand;
  totalMinutes: number;
  amount: number;
  /** How many attendance records contributed, so a suspicious total can be traced. */
  days: number;
};

const emptyBand = (multiplier: number): OvertimeBand => ({ minutes: 0, hours: 0, multiplier, amount: 0 });

/**
 * What one employee is owed for overtime in one payroll period.
 *
 * Only records carrying overtime minutes count, and leave days are skipped —
 * an approved leave day generates an attendance row, and a stray duration on
 * one must not read as hours worked.
 */
export function overtimeForPeriod(
  attendance: AttendanceRecord[],
  { employeeId, period, monthlyWage }: { employeeId: string; period: string; monthlyWage: number },
  rules: OvertimeRules = DEFAULT_OVERTIME_RULES,
  calendar: { restDays?: number[]; holidays?: Set<string> } = {},
): OvertimeSummary {
  const rate = hourlyRate(monthlyWage, rules);
  const bands: Record<OvertimeClass, OvertimeBand> = {
    normal: emptyBand(rules.normalMultiplier),
    rest_day: emptyBand(rules.restDayMultiplier),
    public_holiday: emptyBand(rules.publicHolidayMultiplier),
  };

  const mine = attendance.filter((record) =>
    record.employeeId === employeeId
    && String(record.date ?? "").startsWith(String(period ?? ""))
    && record.status !== "Leave"
    && num(record.overtimeMinutes) > 0);

  for (const record of mine) {
    const kind = classifyDay(String(record.date), calendar);
    bands[kind].minutes += Math.max(0, Math.round(num(record.overtimeMinutes)));
  }

  let total = 0;
  let amount = 0;
  for (const kind of ["normal", "rest_day", "public_holiday"] as OvertimeClass[]) {
    const band = bands[kind];
    band.hours = Math.round(band.minutes / 60 * 100) / 100;
    band.amount = money(band.hours * rate * band.multiplier);
    total += band.minutes;
    amount += band.amount;
  }

  return {
    hourlyRate: Math.round(rate * 100) / 100,
    normal: bands.normal,
    restDay: bands.rest_day,
    publicHoliday: bands.public_holiday,
    totalMinutes: total,
    amount: money(amount),
    days: mine.length,
  };
}

/** Reads overtime rules off the stored attendance settings, filling any gaps. */
export function toOvertimeRules(stored: unknown): OvertimeRules {
  const source = (stored && typeof stored === "object" ? stored : {}) as Record<string, any>;
  const value = (key: keyof OvertimeRules) => {
    const parsed = Number(source[key]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_OVERTIME_RULES[key];
  };
  return {
    daysPerMonth: value("daysPerMonth"),
    hoursPerDay: value("hoursPerDay"),
    normalMultiplier: value("normalMultiplier"),
    restDayMultiplier: value("restDayMultiplier"),
    publicHolidayMultiplier: value("publicHolidayMultiplier"),
  };
}

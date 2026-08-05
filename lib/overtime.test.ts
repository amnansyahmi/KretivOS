import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDay,
  DEFAULT_OVERTIME_RULES,
  hourlyRate,
  multiplierFor,
  ordinaryRateOfPay,
  overtimeForPeriod,
  toOvertimeRules,
} from "./overtime.ts";
import { restDaysForState } from "./work-calendar.ts";

const rules = DEFAULT_OVERTIME_RULES;

/** RM2,600 over 26 days is RM100 a day, and RM12.50 an hour over 8 hours. */
const WAGE = 2600;

test("the ordinary rate of pay is the month over 26 days", () => {
  assert.equal(ordinaryRateOfPay(WAGE), 100);
  assert.equal(hourlyRate(WAGE), 12.5);
});

test("a zero or missing divisor falls back rather than dividing by nothing", () => {
  const broken = { ...rules, daysPerMonth: 0, hoursPerDay: 0 };
  assert.ok(Number.isFinite(hourlyRate(WAGE, broken)));
  assert.equal(hourlyRate(WAGE, broken), 12.5);
});

test("a day is classified by the calendar it is in", () => {
  const selangor = { restDays: restDaysForState("Selangor"), holidays: new Set<string>() };
  assert.equal(classifyDay("2026-08-05", selangor), "normal", "a Wednesday");
  assert.equal(classifyDay("2026-08-08", selangor), "rest_day", "a Saturday");

  const kelantan = { restDays: restDaysForState("Kelantan"), holidays: new Set<string>() };
  assert.equal(classifyDay("2026-08-07", kelantan), "rest_day", "a Friday there");
  assert.equal(classifyDay("2026-08-07", selangor), "normal", "but not here");
});

test("a public holiday outranks a rest day", () => {
  const calendar = { restDays: restDaysForState("Selangor"), holidays: new Set(["2026-08-08"]) };
  assert.equal(classifyDay("2026-08-08", calendar), "public_holiday", "a Saturday that is also a holiday pays the higher multiple");
});

test("the multiples rise with the kind of day", () => {
  assert.equal(multiplierFor("normal"), 1.5);
  assert.equal(multiplierFor("rest_day"), 2);
  assert.equal(multiplierFor("public_holiday"), 3);
});

test("two hours on a working day is paid at one and a half", () => {
  const attendance = [{ employeeId: "emp-1", date: "2026-08-05", overtimeMinutes: 120 }];
  const result = overtimeForPeriod(attendance, { employeeId: "emp-1", period: "2026-08", monthlyWage: WAGE }, rules, {
    restDays: restDaysForState("Selangor"),
    holidays: new Set(),
  });

  assert.equal(result.normal.hours, 2);
  assert.equal(result.normal.amount, 37.5, "2 × 12.50 × 1.5");
  assert.equal(result.amount, 37.5);
  assert.equal(result.totalMinutes, 120);
});

test("the same two hours cost more on a rest day and more again on a holiday", () => {
  const calendar = { restDays: restDaysForState("Selangor"), holidays: new Set(["2026-08-31"]) };
  const at = (date: string) => overtimeForPeriod(
    [{ employeeId: "emp-1", date, overtimeMinutes: 120 }],
    { employeeId: "emp-1", period: date.slice(0, 7), monthlyWage: WAGE },
    rules,
    calendar,
  ).amount;

  assert.equal(at("2026-08-05"), 37.5, "working day");
  assert.equal(at("2026-08-08"), 50, "rest day");
  assert.equal(at("2026-08-31"), 75, "public holiday");
});

test("a month of mixed overtime is banded and totalled", () => {
  const attendance = [
    { employeeId: "emp-1", date: "2026-08-05", overtimeMinutes: 60 },
    { employeeId: "emp-1", date: "2026-08-06", overtimeMinutes: 90 },
    { employeeId: "emp-1", date: "2026-08-08", overtimeMinutes: 120 },
    { employeeId: "emp-1", date: "2026-08-31", overtimeMinutes: 60 },
  ];
  const result = overtimeForPeriod(attendance, { employeeId: "emp-1", period: "2026-08", monthlyWage: WAGE }, rules, {
    restDays: restDaysForState("Selangor"),
    holidays: new Set(["2026-08-31"]),
  });

  assert.equal(result.normal.minutes, 150);
  assert.equal(result.restDay.minutes, 120);
  assert.equal(result.publicHoliday.minutes, 60);
  assert.equal(result.days, 4);
  assert.equal(result.amount, Number((result.normal.amount + result.restDay.amount + result.publicHoliday.amount).toFixed(2)));
});

test("only this employee and this period count", () => {
  const attendance = [
    { employeeId: "emp-1", date: "2026-08-05", overtimeMinutes: 60 },
    { employeeId: "emp-2", date: "2026-08-05", overtimeMinutes: 600 },
    { employeeId: "emp-1", date: "2026-07-05", overtimeMinutes: 600 },
  ];
  const result = overtimeForPeriod(attendance, { employeeId: "emp-1", period: "2026-08", monthlyWage: WAGE }, rules, {});
  assert.equal(result.totalMinutes, 60);
  assert.equal(result.days, 1);
});

test("a leave day contributes nothing even if it carries minutes", () => {
  // Approving leave generates an attendance row; a stray duration on one must
  // not read as hours worked.
  const attendance = [{ employeeId: "emp-1", date: "2026-08-05", status: "Leave", overtimeMinutes: 480 }];
  const result = overtimeForPeriod(attendance, { employeeId: "emp-1", period: "2026-08", monthlyWage: WAGE }, rules, {});
  assert.equal(result.totalMinutes, 0);
  assert.equal(result.amount, 0);
});

test("no overtime is zero rather than an error", () => {
  const result = overtimeForPeriod([], { employeeId: "emp-1", period: "2026-08", monthlyWage: WAGE }, rules, {});
  assert.equal(result.amount, 0);
  assert.equal(result.totalMinutes, 0);
  assert.equal(result.days, 0);
});

test("stored rules are read, and gaps filled from the statutory minimum", () => {
  assert.deepEqual(toOvertimeRules(null), DEFAULT_OVERTIME_RULES);
  assert.deepEqual(toOvertimeRules({}), DEFAULT_OVERTIME_RULES);

  const custom = toOvertimeRules({ normalMultiplier: 2, hoursPerDay: 7.5 });
  assert.equal(custom.normalMultiplier, 2, "a company may contract above the minimum");
  assert.equal(custom.hoursPerDay, 7.5);
  assert.equal(custom.restDayMultiplier, DEFAULT_OVERTIME_RULES.restDayMultiplier);

  const rubbish = toOvertimeRules({ daysPerMonth: "abc", normalMultiplier: -1 });
  assert.equal(rubbish.daysPerMonth, 26);
  assert.equal(rubbish.normalMultiplier, 1.5);
});

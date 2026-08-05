import assert from "node:assert/strict";
import test from "node:test";
import {
  datesBetween,
  dayOfWeek,
  DEFAULT_REST_DAYS,
  fixedHolidays,
  GAZETTED_HOLIDAYS,
  isRestDay,
  mergeHolidays,
  missingGazettedHolidays,
  restDaysForState,
  workingDates,
  workingDayCount,
} from "./work-calendar.ts";

test("day of week is read from the date's own parts, not from a time zone", () => {
  // 2026-08-05 is a Wednesday. Parsed as an instant this would be the previous
  // evening in Malaysia and could read as Tuesday.
  assert.equal(dayOfWeek("2026-08-05"), 3);
  assert.equal(dayOfWeek("2026-08-01"), 6, "Saturday");
  assert.equal(dayOfWeek("2026-08-02"), 0, "Sunday");
});

test("an impossible date is rejected rather than rolled forward", () => {
  assert.equal(dayOfWeek("2026-02-31"), null);
  assert.equal(dayOfWeek("2026-13-01"), null);
  assert.equal(dayOfWeek("not a date"), null);
  assert.equal(dayOfWeek(""), null);
});

test("the weekend depends on the state", () => {
  assert.deepEqual(restDaysForState("Selangor"), DEFAULT_REST_DAYS);
  assert.deepEqual(restDaysForState("Kelantan"), [5, 6], "Friday and Saturday");
  assert.deepEqual(restDaysForState("Terengganu"), [5, 6]);
  assert.deepEqual(restDaysForState("Johor"), [5, 6]);
  assert.deepEqual(restDaysForState(""), DEFAULT_REST_DAYS, "an unknown state falls back rather than breaking");
});

test("a Friday is a working day in Selangor and a rest day in Kelantan", () => {
  const friday = "2026-08-07";
  assert.equal(isRestDay(friday, restDaysForState("Selangor")), false);
  assert.equal(isRestDay(friday, restDaysForState("Kelantan")), true);
});

test("dates between are inclusive and in order", () => {
  assert.deepEqual(datesBetween("2026-08-03", "2026-08-05"), ["2026-08-03", "2026-08-04", "2026-08-05"]);
  assert.deepEqual(datesBetween("2026-08-05", "2026-08-05"), ["2026-08-05"]);
  assert.deepEqual(datesBetween("2026-08-05", "2026-08-01"), [], "a backwards range is empty, not endless");
  assert.deepEqual(datesBetween("rubbish", "2026-08-05"), []);
});

test("a range crossing a month and a year still counts", () => {
  assert.equal(datesBetween("2026-12-30", "2027-01-02").length, 4);
  assert.equal(datesBetween("2028-02-27", "2028-03-01").length, 4, "2028 is a leap year");
});

test("working days exclude the weekend", () => {
  // Monday 3rd to Sunday 9th August 2026: five working days.
  assert.equal(workingDayCount("2026-08-03", "2026-08-09"), 5);
});

test("the same week counts differently under a Friday-Saturday weekend", () => {
  const options = { restDays: restDaysForState("Kelantan") };
  const dates = workingDates("2026-08-03", "2026-08-09", options);
  assert.equal(dates.length, 5);
  assert.ok(!dates.includes("2026-08-07"), "Friday is a rest day there");
  assert.ok(dates.includes("2026-08-09"), "and Sunday is worked");
});

test("a public holiday is not counted against leave", () => {
  const withHoliday = workingDayCount("2026-08-31", "2026-09-04", { holidays: ["2026-08-31"] });
  const without = workingDayCount("2026-08-31", "2026-09-04");
  assert.equal(without, 5);
  assert.equal(withHoliday, 4, "National Day comes out of the count");
});

test("fixed holidays are seeded for the year asked for", () => {
  const holidays = fixedHolidays(2026, "Selangor");
  const dates = holidays.map((item) => item.date);

  assert.ok(dates.includes("2026-08-31"), "National Day");
  assert.ok(dates.includes("2026-09-16"), "Malaysia Day");
  assert.ok(dates.includes("2026-05-01"), "Labour Day");
  assert.ok(dates.includes("2026-12-11"), "the Selangor state holiday");
  assert.deepEqual(dates, [...dates].sort(), "returned in date order");
});

test("a different state gets different state holidays", () => {
  const selangor = fixedHolidays(2026, "Selangor").map((item) => item.date);
  const sarawak = fixedHolidays(2026, "Sarawak").map((item) => item.date);

  assert.ok(sarawak.includes("2026-07-22"), "Sarawak Day");
  assert.ok(!selangor.includes("2026-07-22"));
  // Both still get the federal ones.
  assert.ok(selangor.includes("2026-08-31") && sarawak.includes("2026-08-31"));
});

test("the holidays that move are reported as missing rather than guessed", () => {
  const missing = missingGazettedHolidays(fixedHolidays(2026, "Selangor"), 2026);
  assert.deepEqual(missing, GAZETTED_HOLIDAYS, "none of them can be seeded");
  assert.ok(missing.includes("Hari Raya Aidilfitri"));
  assert.ok(missing.includes("Chinese New Year"));
});

test("a gazetted holiday already entered stops being reported", () => {
  const entered = [{ date: "2026-03-20", name: "Hari Raya Aidilfitri" }];
  const missing = missingGazettedHolidays(entered, 2026);
  assert.ok(!missing.includes("Hari Raya Aidilfitri"));
  assert.ok(missing.includes("Deepavali"), "the rest are still outstanding");
});

test("a holiday entered for another year does not count for this one", () => {
  const entered = [{ date: "2025-03-31", name: "Hari Raya Aidilfitri" }];
  assert.ok(missingGazettedHolidays(entered, 2026).includes("Hari Raya Aidilfitri"));
});

test("seeding never overwrites a date somebody chose deliberately", () => {
  const existing = [{ date: "2026-01-01", name: "Company shutdown" }];
  const merged = mergeHolidays(existing, fixedHolidays(2026, "Selangor"));
  const newYear = merged.find((item) => item.date === "2026-01-01");

  assert.equal(newYear?.name, "Company shutdown", "the deliberate entry survives");
  assert.ok(merged.some((item) => item.date === "2026-08-31"), "and the rest are still added");
  assert.deepEqual(merged.map((item) => item.date), [...merged.map((item) => item.date)].sort());
});

test("seeding twice does not duplicate anything", () => {
  const once = mergeHolidays([], fixedHolidays(2026, "Selangor"));
  const twice = mergeHolidays(once, fixedHolidays(2026, "Selangor"));
  assert.equal(twice.length, once.length);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  durationBetween,
  entriesForPeriod,
  formatDuration,
  isTime,
  minutesFromTime,
  normaliseEntry,
  overlapsWith,
  summariseByDay,
  summariseByProject,
  timesheetCsv,
  toHours,
  totalMinutes,
  type TimesheetEntry,
  validateEntry,
} from "./timesheet.ts";

const valid: TimesheetEntry = {
  id: "t1", employeeId: "e1", date: "2026-08-05",
  task: "Storyboard revisions", startTime: "09:00", endTime: "12:30", project: "Chef Ammar",
};

test("times are validated rather than guessed at", () => {
  assert.equal(isTime("09:00"), true);
  assert.equal(isTime("23:59"), true);
  assert.equal(isTime("24:00"), false);
  assert.equal(isTime("9:00"), false, "a missing leading zero is a typo, not a time");
  assert.equal(isTime("09:60"), false);
  assert.equal(minutesFromTime("09:30"), 570);
  assert.equal(minutesFromTime("rubbish"), null);
});

test("a duration is the gap between two times on the same day", () => {
  assert.equal(durationBetween("09:00", "12:30"), 210);
  assert.equal(durationBetween("14:00", "14:15"), 15);
});

test("an end before the start is refused rather than wrapped past midnight", () => {
  // 02:00 is almost always a mistyped 14:00, and crediting sixteen hours
  // silently is worse than asking.
  assert.equal(durationBetween("18:00", "02:00"), null);
  assert.equal(durationBetween("09:00", "09:00"), null, "a zero-length entry is not a task");
});

test("durations read the way people say them", () => {
  assert.equal(formatDuration(210), "3h 30m");
  assert.equal(formatDuration(120), "2h");
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(-5), "0m");
  assert.equal(toHours(210), 3.5);
});

test("a good entry has nothing to report", () => {
  assert.deepEqual(validateEntry(valid), []);
});

test("every problem is reported at once, not one at a time", () => {
  const problems = validateEntry({ employeeId: "", date: "nope", task: "", startTime: "9am", endTime: "" });
  const fields = problems.map((problem) => problem.field);

  assert.ok(fields.includes("employeeId"));
  assert.ok(fields.includes("date"));
  assert.ok(fields.includes("task"));
  assert.ok(fields.includes("startTime"));
  assert.ok(fields.includes("endTime"));
});

test("a backwards entry is caught as an end-time problem", () => {
  const problems = validateEntry({ ...valid, startTime: "17:00", endTime: "09:00" });
  assert.deepEqual(problems.map((problem) => problem.field), ["endTime"]);
  assert.match(problems[0].message, /after the start/);
});

test("normalising works out the duration and trims the text", () => {
  const entry = normaliseEntry({ ...valid, task: "  Storyboard revisions  ", project: " Chef Ammar " });
  assert.equal(entry.durationMinutes, 210);
  assert.equal(entry.task, "Storyboard revisions");
  assert.equal(entry.project, "Chef Ammar");
  assert.equal(entry.billable, false, "absent means not billable rather than undefined");
});

test("an invalid entry normalises to zero minutes rather than a NaN", () => {
  const entry = normaliseEntry({ ...valid, startTime: "17:00", endTime: "09:00" });
  assert.equal(entry.durationMinutes, 0);
});

test("overlapping the same afternoon twice is detected", () => {
  const existing = [valid];
  const clash = { employeeId: "e1", date: "2026-08-05", startTime: "11:00", endTime: "13:00" };
  assert.equal(overlapsWith(clash, existing).length, 1);
});

test("touching entries do not overlap", () => {
  // 09:00–12:30 then 12:30–14:00 is a day, not a double-booking.
  const next = { employeeId: "e1", date: "2026-08-05", startTime: "12:30", endTime: "14:00" };
  assert.deepEqual(overlapsWith(next, [valid]), []);
});

test("an entry never overlaps itself when edited", () => {
  assert.deepEqual(overlapsWith({ ...valid, endTime: "13:00" }, [valid]), []);
});

test("another person's or another day's entry is not a clash", () => {
  assert.deepEqual(overlapsWith({ ...valid, id: "t2", employeeId: "e2" }, [valid]), []);
  assert.deepEqual(overlapsWith({ ...valid, id: "t2", date: "2026-08-06" }, [valid]), []);
});

test("days are totalled, newest first", () => {
  const entries = [
    { employeeId: "e1", date: "2026-08-05", durationMinutes: 210, billable: true },
    { employeeId: "e1", date: "2026-08-05", durationMinutes: 90 },
    { employeeId: "e1", date: "2026-08-06", durationMinutes: 120, billable: true },
  ];
  const days = summariseByDay(entries);

  assert.deepEqual(days.map((day) => day.date), ["2026-08-06", "2026-08-05"]);
  assert.equal(days[1].minutes, 300);
  assert.equal(days[1].entries, 2);
  assert.equal(days[1].billableMinutes, 210, "only the billable half counts");
});

test("projects are totalled largest first, with unassigned work named", () => {
  const entries = [
    { date: "2026-08-05", project: "Chef Ammar", durationMinutes: 210 },
    { date: "2026-08-05", project: "", durationMinutes: 60 },
    { date: "2026-08-06", project: "Chef Ammar", durationMinutes: 120 },
  ];
  const projects = summariseByProject(entries);

  assert.equal(projects[0].project, "Chef Ammar");
  assert.equal(projects[0].minutes, 330);
  assert.equal(projects[1].project, "Unassigned", "unlogged time is shown, not hidden");
  assert.equal(totalMinutes(entries), 390);
});

test("a period is one person's month, in the order the day happened", () => {
  const entries = [
    { employeeId: "e1", date: "2026-08-06", startTime: "09:00" },
    { employeeId: "e1", date: "2026-08-05", startTime: "14:00" },
    { employeeId: "e1", date: "2026-08-05", startTime: "09:00" },
    { employeeId: "e2", date: "2026-08-05", startTime: "09:00" },
    { employeeId: "e1", date: "2026-07-30", startTime: "09:00" },
  ];
  const period = entriesForPeriod(entries, "e1", "2026-08");

  assert.equal(period.length, 3, "another person's and another month's are left out");
  assert.deepEqual(period.map((entry) => `${entry.date} ${entry.startTime}`), [
    "2026-08-05 09:00",
    "2026-08-05 14:00",
    "2026-08-06 09:00",
  ]);
});

test("a timesheet exports with a header and one row per entry", () => {
  const csv = timesheetCsv([
    { employeeId: "e1", date: "2026-08-11", task: "Storyboard", project: "Chef Ammar", startTime: "09:00", endTime: "12:30", durationMinutes: 210, billable: true },
  ], () => "Amirul Hafiz");
  const lines = csv.split("\r\n");

  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith('"Date","Team member"'));
  assert.ok(lines[1].includes('"Amirul Hafiz"'));
  assert.ok(lines[1].includes('"3.5"'), "hours, not minutes");
  assert.ok(lines[1].includes('"Yes"'));
});

test("free text cannot break out of its cell", () => {
  // A task description holds commas, quotes and the odd pasted newline. Any of
  // them unescaped turns one row into two, or shifts every column after it.
  const csv = timesheetCsv([
    { employeeId: "e1", date: "2026-08-11", task: 'Revise "hero" shot, then grade', notes: "line one\nline two", startTime: "09:00", endTime: "10:00", durationMinutes: 60 },
  ], () => "Amirul");

  const row = csv.split("\r\n")[1];
  assert.ok(row.includes('"Revise ""hero"" shot, then grade"'), row);
  // A newline inside a quoted cell is valid CSV; the row must still be one row
  // as far as the quoting is concerned.
  assert.equal((row.match(/","/g) ?? []).length, 8, "nine columns, so eight separators");
});

test("rows come out in date then start-time order", () => {
  const csv = timesheetCsv([
    { employeeId: "e1", date: "2026-08-12", task: "B", startTime: "09:00", endTime: "10:00" },
    { employeeId: "e1", date: "2026-08-11", task: "A2", startTime: "14:00", endTime: "15:00" },
    { employeeId: "e1", date: "2026-08-11", task: "A1", startTime: "09:00", endTime: "10:00" },
  ], () => "x");

  const tasks = csv.split("\r\n").slice(1).map((row) => row.split(",")[2]);
  assert.deepEqual(tasks, ['"A1"', '"A2"', '"B"']);
});

test("an empty timesheet still exports its header", () => {
  const csv = timesheetCsv([], () => "x");
  assert.equal(csv.split("\r\n").length, 1);
  assert.ok(csv.startsWith('"Date"'));
});

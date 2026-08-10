import assert from "node:assert/strict";
import test from "node:test";
import { holidayMap, leaveDayMap, monthCells, shiftMonth } from "./leave-calendar.ts";

test("a month grid is always whole weeks", () => {
  for (const month of ["2026-01", "2026-02", "2026-08", "2027-02", "2028-02"]) {
    const cells = monthCells(month);
    assert.equal(cells.length % 7, 0, `${month} did not fill its last week`);
  }
});

test("the first of the month lands on its own weekday", () => {
  // 1 August 2026 is a Saturday, so six blanks precede it.
  const cells = monthCells("2026-08");
  assert.deepEqual(cells.slice(0, 6), [null, null, null, null, null, null]);
  assert.equal(cells[6], "2026-08-01");
});

test("every day of the month is present exactly once", () => {
  const cells = monthCells("2026-02").filter(Boolean);
  assert.equal(cells.length, 28);
  assert.equal(cells[0], "2026-02-01");
  assert.equal(cells.at(-1), "2026-02-28");

  // A leap year is the case a hand-rolled grid gets wrong.
  assert.equal(monthCells("2028-02").filter(Boolean).length, 29);
});

test("a damaged month yields no cells rather than a grid of NaN", () => {
  assert.deepEqual(monthCells(""), []);
  assert.deepEqual(monthCells("not-a-month"), []);
});

test("stepping months crosses a year boundary in both directions", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-08", 0), "2026-08");
  assert.equal(shiftMonth("2026-08", -12), "2025-08");
});

test("leave occupies every day it covers, not only its start", () => {
  const map = leaveDayMap([{ id: "a", status: "Approved", startDate: "2026-08-10", endDate: "2026-08-12" }]);
  assert.deepEqual([...map.keys()], ["2026-08-10", "2026-08-11", "2026-08-12"]);
});

test("a single day needs no end date", () => {
  const map = leaveDayMap([{ id: "a", status: "Approved", startDate: "2026-08-10" }]);
  assert.equal(map.size, 1);
  assert.equal(map.get("2026-08-10")?.length, 1);
});

test("only committed leave takes up a day", () => {
  const map = leaveDayMap([
    { id: "a", status: "Approved", startDate: "2026-08-10" },
    { id: "b", status: "Pending", startDate: "2026-08-10" },
    { id: "c", status: "Rejected", startDate: "2026-08-10" },
    { id: "d", status: "Cancelled", startDate: "2026-08-10" },
  ]);
  // Pending counts: days already asked for cannot be asked for twice.
  assert.deepEqual(map.get("2026-08-10")?.map((item: any) => item.id), ["a", "b"]);
});

test("overlapping requests both show on the day", () => {
  const map = leaveDayMap([
    { id: "a", status: "Approved", startDate: "2026-08-10", endDate: "2026-08-12" },
    { id: "b", status: "Pending", startDate: "2026-08-12", endDate: "2026-08-14" },
  ]);
  assert.equal(map.get("2026-08-12")?.length, 2, "a clash is shown, not hidden by the last one written");
});

test("a reversed or unparseable range is skipped rather than looping", () => {
  assert.equal(leaveDayMap([{ id: "a", status: "Approved", startDate: "2026-08-12", endDate: "2026-08-10" }]).size, 0);
  assert.equal(leaveDayMap([{ id: "a", status: "Approved", startDate: "rubbish" }]).size, 0);
  assert.equal(leaveDayMap([{ id: "a", status: "Approved" }]).size, 0);
});

test("a runaway range is capped instead of hanging the browser", () => {
  const map = leaveDayMap([{ id: "a", status: "Approved", startDate: "2026-01-01", endDate: "2099-01-01" }]);
  assert.equal(map.size, 400);
});

test("maternity leave still fits inside the cap", () => {
  const map = leaveDayMap([{ id: "a", status: "Approved", startDate: "2026-01-01", endDate: "2026-04-08" }]);
  assert.equal(map.size, 98);
});

test("holidays are seeded so the calendar is not blank before HR types anything", () => {
  const map = holidayMap([], 2026);
  assert.ok(map.size > 0);
  assert.equal(map.get("2026-01-01")?.name, "New Year's Day");
  assert.equal(map.get("2026-01-01")?.confirmed, false, "a seeded date is not the same as a gazetted one");
});

test("what HR configured wins over what was seeded", () => {
  const map = holidayMap([{ date: "2026-08-31", name: "Merdeka (company holiday Monday)" }], 2026);
  assert.equal(map.get("2026-08-31")?.name, "Merdeka (company holiday Monday)");
  assert.equal(map.get("2026-08-31")?.confirmed, true);
});

test("incomplete configured entries are ignored rather than drawn blank", () => {
  const map = holidayMap([{ date: "2026-03-01" }, { name: "Nameless" }, null], 2026);
  assert.equal(map.has("2026-03-01"), false);
});

test("state holidays follow the state", () => {
  const selangor = holidayMap([], 2026, "Selangor");
  const penang = holidayMap([], 2026, "Penang");
  assert.notDeepEqual([...selangor.keys()], [...penang.keys()]);
});

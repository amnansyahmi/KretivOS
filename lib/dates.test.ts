import assert from "node:assert/strict";
import test from "node:test";
import { isIsoDate, isoDate, isoDateFrom, todayIso } from "./dates.ts";

test("a Date from the driver becomes its calendar day", () => {
  // The exact case that broke invoice posting: String(date).slice(0, 10) gave
  // "Sat Aug 01", which the ledger rejected as not a date.
  const fromDriver = new Date(2026, 7, 1);
  assert.equal(String(fromDriver).slice(0, 10) === "2026-08-01", false, "the old approach was wrong");
  assert.equal(isoDate(fromDriver), "2026-08-01");
});

test("the local calendar day is used, so a date never shifts backwards", () => {
  // A bare `date` column is parsed to local midnight. Formatting it through
  // toISOString in any zone east of UTC would name the previous day.
  const localMidnight = new Date(2026, 0, 1, 0, 0, 0);
  assert.equal(isoDate(localMidnight), "2026-01-01");
  const lateEvening = new Date(2026, 0, 1, 23, 59, 59);
  assert.equal(isoDate(lateEvening), "2026-01-01", "the time of day does not move the date");
});

test("strings pass through without being reinterpreted", () => {
  assert.equal(isoDate("2026-08-01"), "2026-08-01");
  assert.equal(isoDate("2026-08-01T15:30:00.000Z"), "2026-08-01");
  assert.equal(isoDate("  2026-08-01  "), "2026-08-01");
});

test("unusable values fall back rather than producing a broken date", () => {
  assert.equal(isoDate(null), "");
  assert.equal(isoDate(undefined), "");
  assert.equal(isoDate(""), "");
  assert.equal(isoDate("not a date"), "");
  assert.equal(isoDate(new Date("nonsense")), "");
  assert.equal(isoDate(null, "2026-01-01"), "2026-01-01", "the fallback is honoured");
});

test("single-digit months and days are padded", () => {
  assert.equal(isoDateFrom(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(isoDateFrom(new Date(2026, 8, 9)), "2026-09-09");
});

test("today is a valid date", () => {
  assert.equal(isIsoDate(todayIso()), true);
});

test("impossible dates are rejected", () => {
  assert.equal(isIsoDate("2026-08-01"), true);
  assert.equal(isIsoDate("2026-02-29"), false, "2026 is not a leap year");
  assert.equal(isIsoDate("2024-02-29"), true, "2024 is");
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("2026-00-10"), false);
  assert.equal(isIsoDate("2026-8-1"), false, "unpadded is not accepted");
  assert.equal(isIsoDate("Sat Aug 01"), false, "the shape the old bug produced");
  assert.equal(isIsoDate(new Date()), false, "a Date is not a date string");
});

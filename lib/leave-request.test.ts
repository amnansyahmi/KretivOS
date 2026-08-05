import assert from "node:assert/strict";
import test from "node:test";
import {
  describeLeaveDuration,
  HALF_DAY_SESSIONS,
  leaveProblemFor,
  normaliseHalfDay,
  shortLeaveLabel,
  toHalfDaySession,
  validateLeaveRequest,
} from "./leave-request.ts";

const valid = { employeeId: "e1", type: "Annual Leave", startDate: "2026-08-10", endDate: "2026-08-12" };

test("a complete request has nothing to report", () => {
  assert.deepEqual(validateLeaveRequest(valid), []);
});

test("the end date cannot be before the start date", () => {
  const problems = validateLeaveRequest({ ...valid, startDate: "2026-08-12", endDate: "2026-08-10" });
  assert.equal(leaveProblemFor(problems, "endDate"), "The end date cannot be before the start date.");
});

test("the same day start and end is a one-day request, not an error", () => {
  assert.deepEqual(validateLeaveRequest({ ...valid, startDate: "2026-08-10", endDate: "2026-08-10" }), []);
});

test("missing pieces are each named", () => {
  const problems = validateLeaveRequest({});
  const fields = problems.map((problem) => problem.field);

  assert.ok(fields.includes("employeeId"));
  assert.ok(fields.includes("type"));
  assert.ok(fields.includes("startDate"));
  assert.ok(fields.includes("endDate"));
});

test("problems come back in the order the form asks for them", () => {
  const problems = validateLeaveRequest({});
  assert.deepEqual(problems.map((problem) => problem.field), ["employeeId", "type", "startDate", "endDate"]);
});

test("a half day has to be one date", () => {
  const problems = validateLeaveRequest({ ...valid, halfDay: true, startDate: "2026-08-10", endDate: "2026-08-12" });
  assert.match(leaveProblemFor(problems, "endDate"), /half day covers one date/);
});

test("a half day on a single date is fine", () => {
  assert.deepEqual(validateLeaveRequest({ ...valid, halfDay: true, startDate: "2026-08-10", endDate: "2026-08-10", halfDaySession: "second" }), []);
});

test("a session is either the first half or the second, and defaults to the first", () => {
  assert.equal(toHalfDaySession("second"), "second");
  assert.equal(toHalfDaySession("first"), "first");
  assert.equal(toHalfDaySession(""), "first");
  assert.equal(toHalfDaySession("afternoon"), "first", "an unrecognised value is not invented");
  assert.equal(HALF_DAY_SESSIONS.length, 2);
});

test("a half day says which half, because that is the point of saying so", () => {
  assert.equal(describeLeaveDuration({ halfDay: true, halfDaySession: "second" }), "Half day · Second half · afternoon");
  assert.equal(describeLeaveDuration({ halfDay: true, halfDaySession: "first" }), "Half day · First half · morning");
});

test("a full request counts its days", () => {
  assert.equal(describeLeaveDuration({ days: 3 }), "3 working days");
  assert.equal(describeLeaveDuration({ days: 1 }), "1 working day");
});

test("the short label fits a calendar cell", () => {
  assert.equal(shortLeaveLabel({ halfDay: true, halfDaySession: "second" }), "PM");
  assert.equal(shortLeaveLabel({ halfDay: true, halfDaySession: "first" }), "AM");
  assert.equal(shortLeaveLabel({ days: 2 }), "2d");
});

test("a request that stops being a half day drops its session", () => {
  // Otherwise a record could read "three days, second half".
  const full = normaliseHalfDay({ ...valid, halfDay: false, halfDaySession: "second" });
  assert.equal(full.halfDay, false);
  assert.equal(full.halfDaySession, "");
});

test("a half day always carries a session, even when none was chosen", () => {
  const half = normaliseHalfDay({ ...valid, halfDay: true });
  assert.equal(half.halfDaySession, "first");
});

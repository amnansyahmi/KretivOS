import assert from "node:assert/strict";
import test from "node:test";
import {
  loggedBetween,
  myLeaveBalances,
  outstandingActions,
  todayStatus,
  weekStartFor,
} from "./my-hr-summary.ts";

const TODAY = "2026-08-05";

/** Everything payroll needs, so a complete record raises nothing. */
const complete = {
  bankAccountNumber: "1111",
  identificationNumber: "900101-10-1111",
  dateOfBirth: "1990-01-01",
  onboarding: [{ id: "a", owner: "employee", done: true }, { id: "b", owner: "hr", done: false }],
};

test("a day with nothing on it asks to be clocked into", () => {
  const status = todayStatus({ date: TODAY });
  assert.equal(status.state, "not_clocked_in");
  assert.equal(status.action, "clock_in");
});

test("clocking in changes what the card offers", () => {
  const status = todayStatus({ date: TODAY, attendance: [{ date: TODAY, checkIn: "09:02" }] });
  assert.equal(status.state, "clocked_in");
  assert.equal(status.action, "clock_out");
  assert.match(status.headline, /09:02/);
});

test("a finished day offers nothing and says how long it was", () => {
  const status = todayStatus({ date: TODAY, attendance: [{ date: TODAY, checkIn: "09:00", checkOut: "18:00", durationMinutes: 540 }] });
  assert.equal(status.state, "clocked_out");
  assert.equal(status.action, null);
  assert.match(status.detail, /09:00 to 18:00/);
  assert.match(status.detail, /9h/);
});

test("a public holiday outranks the clock", () => {
  // "Not clocked in" is not a thing anybody needs prompting about today.
  const status = todayStatus({ date: TODAY, holidayName: "National Day" });
  assert.equal(status.state, "holiday");
  assert.equal(status.headline, "National Day");
  assert.equal(status.action, null);
});

test("approved leave outranks the clock too", () => {
  const status = todayStatus({
    date: TODAY,
    leave: [{ status: "Approved", type: "Annual Leave", startDate: "2026-08-03", endDate: "2026-08-07" }],
  });
  assert.equal(status.state, "leave");
  assert.equal(status.action, null);
});

test("leave that is only requested does not excuse the clock", () => {
  const status = todayStatus({
    date: TODAY,
    leave: [{ status: "Pending", type: "Annual Leave", startDate: TODAY, endDate: TODAY }],
  });
  assert.equal(status.state, "not_clocked_in");
});

test("another day's attendance is not today's", () => {
  const status = todayStatus({ date: TODAY, attendance: [{ date: "2026-08-04", checkIn: "09:00", checkOut: "18:00" }] });
  assert.equal(status.state, "not_clocked_in");
});

test("a complete record with nothing pending has nothing outstanding", () => {
  assert.deepEqual(outstandingActions({ employee: complete }), []);
});

test("missing payroll details block, and say what they block", () => {
  const actions = outstandingActions({ employee: { ...complete, bankAccountNumber: "" } });
  assert.equal(actions[0].id, "payroll-details");
  assert.equal(actions[0].urgency, "blocking");
  assert.match(actions[0].label, /bank account/);
  assert.match(actions[0].hint, /cannot pay you/);
  assert.equal(actions[0].tab, "profile");
});

test("several missing fields are named in one action, not three", () => {
  const actions = outstandingActions({ employee: { onboarding: [] } });
  const payroll = actions.find((action) => action.id === "payroll-details");
  assert.match(payroll!.label, /bank account/);
  assert.match(payroll!.label, /NRIC/);
  assert.match(payroll!.label, /date of birth/);
});

test("only the employee's own onboarding steps are theirs to finish", () => {
  const actions = outstandingActions({
    employee: { ...complete, onboarding: [{ owner: "hr", done: false, label: "Set up access" }] },
  });
  assert.ok(!actions.some((action) => action.id === "onboarding"), "waiting on HR is not waiting on them");
});

test("an unfinished step of their own is raised, with the step named", () => {
  const actions = outstandingActions({
    employee: { ...complete, onboarding: [{ owner: "employee", done: false, label: "Read the handbook" }] },
  });
  const onboarding = actions.find((action) => action.id === "onboarding");
  assert.match(onboarding!.hint, /Read the handbook/);
});

test("nobody owes a timesheet on Monday morning", () => {
  const monday = outstandingActions({ employee: complete, weekStart: TODAY, today: TODAY, timesheets: [] });
  assert.ok(!monday.some((action) => action.id === "timesheet"), "prompting here is how a nudge becomes noise");
});

test("an empty week later on is worth a nudge", () => {
  const actions = outstandingActions({ employee: complete, weekStart: "2026-08-03", today: "2026-08-06", timesheets: [] });
  assert.ok(actions.some((action) => action.id === "timesheet"));
});

test("a week with something logged is not nudged", () => {
  const actions = outstandingActions({
    employee: complete, weekStart: "2026-08-03", today: "2026-08-06",
    timesheets: [{ date: "2026-08-04", durationMinutes: 120 }],
  });
  assert.ok(!actions.some((action) => action.id === "timesheet"));
});

test("a rejected request is raised with the reason it was rejected", () => {
  const actions = outstandingActions({
    employee: complete,
    leave: [{ status: "Rejected", approverNote: "Clashes with the shoot." }],
  });
  const rejected = actions.find((action) => action.id === "leave-rejected");
  assert.equal(rejected!.hint, "Clashes with the shoot.");
});

test("pending items are information, and say so", () => {
  const actions = outstandingActions({
    employee: complete,
    leave: [{ status: "Pending" }],
    claims: [{ status: "Pending" }],
  });
  const pending = actions.find((action) => action.id === "pending");
  assert.equal(pending!.urgency, "info");
  assert.match(pending!.label, /1 leave request and 1 claim/);
  assert.match(pending!.hint, /Nothing to do/);
});

test("an approved but unpaid claim is tracked separately from a pending one", () => {
  const actions = outstandingActions({
    employee: complete,
    claims: [{ status: "Approved", financeStatus: "Unpaid" }, { status: "Approved", financeStatus: "Paid" }],
  });
  const unpaid = actions.find((action) => action.id === "claims-unpaid");
  assert.match(unpaid!.label, /1 approved claim/);
});

test("what blocks comes before what is merely waiting", () => {
  const actions = outstandingActions({
    employee: { bankAccountNumber: "", identificationNumber: "", dateOfBirth: "", onboarding: [] },
    leave: [{ status: "Pending" }],
  });
  assert.equal(actions[0].urgency, "blocking");
  assert.equal(actions[actions.length - 1].urgency, "info");
});

test("no employee record raises nothing rather than everything", () => {
  // A session without a linked record should not be told its bank account is
  // missing — there is no record for it to be missing from.
  assert.deepEqual(outstandingActions({}), []);
});

test("logged minutes are counted across an inclusive range", () => {
  const entries = [
    { date: "2026-08-03", durationMinutes: 60 },
    { date: "2026-08-05", durationMinutes: 90 },
    { date: "2026-08-09", durationMinutes: 999 },
  ];
  assert.equal(loggedBetween(entries, "2026-08-03", "2026-08-05"), 150);
  assert.equal(loggedBetween(entries, "2026-08-06", "2026-08-08"), 0);
});

test("the week starts on Monday, including when today is Sunday", () => {
  assert.equal(weekStartFor("2026-08-05"), "2026-08-03", "a Wednesday");
  assert.equal(weekStartFor("2026-08-03"), "2026-08-03", "Monday is its own start");
  assert.equal(weekStartFor("2026-08-09"), "2026-08-03", "Sunday belongs to the week it ends");
  assert.equal(weekStartFor("nonsense"), "");
});

test("a leave balance counts pending requests as well as approved ones", () => {
  // A balance that ignores what you have already asked for invites asking
  // twice for days that only exist once.
  const rules = [{ name: "Annual Leave", kind: "annual" as const, tiers: [{ fromYears: 0, days: 12 }], deductsBalance: true, paid: true }];
  const balances = myLeaveBalances(rules, { startDate: "2020-01-01" }, [
    { type: "Annual Leave", startDate: "2026-03-01", status: "Approved", days: 3 },
    { type: "Annual Leave", startDate: "2026-09-01", status: "Pending", days: 2 },
    { type: "Annual Leave", startDate: "2026-04-01", status: "Rejected", days: 5 },
  ], 2026);

  assert.equal(balances[0].entitlement, 12);
  assert.equal(balances[0].taken, 3);
  assert.equal(balances[0].pending, 2);
  assert.equal(balances[0].remaining, 7, "a rejected request gives its days back");
});

test("a type that draws on no balance is not given one", () => {
  const rules = [{ name: "Unpaid Leave", kind: "unpaid" as const, deductsBalance: false, paid: false }];
  assert.deepEqual(myLeaveBalances(rules, {}, [], 2026), []);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  countsCalendarDays,
  DEFAULT_LEAVE_RULES,
  entitlementFor,
  findLeaveRule,
  leaveTypeNames,
  tierFor,
  toLeaveRules,
  yearsOfService,
} from "./leave-entitlement.ts";

const rules = DEFAULT_LEAVE_RULES;

test("service is counted in completed years", () => {
  assert.equal(yearsOfService("2024-08-05", "2026-08-05"), 2, "the anniversary itself counts");
  assert.equal(yearsOfService("2024-08-05", "2026-08-04"), 1, "the day before does not");
  assert.equal(yearsOfService("2020-01-31", "2026-01-30"), 5);
  assert.equal(yearsOfService("2026-08-05", "2026-08-05"), 0);
  assert.equal(yearsOfService("", "2026-08-05"), 0, "an unknown start date is treated as day one");
});

test("service is counted to the leave, not to today", () => {
  // A request made in July for leave in September is judged on September's
  // entitlement, and one made just before an anniversary cannot borrow the
  // higher tier.
  assert.equal(yearsOfService("2024-09-01", "2026-08-20"), 1);
  assert.equal(yearsOfService("2024-09-01", "2026-09-02"), 2);
});

test("the tier in force is the highest one reached", () => {
  const tiers = [{ fromYears: 0, days: 8 }, { fromYears: 2, days: 12 }, { fromYears: 5, days: 16 }];
  assert.equal(tierFor(tiers, 0), 8);
  assert.equal(tierFor(tiers, 1), 8);
  assert.equal(tierFor(tiers, 2), 12);
  assert.equal(tierFor(tiers, 4), 12);
  assert.equal(tierFor(tiers, 5), 16);
  assert.equal(tierFor(tiers, 30), 16);
});

test("annual leave rises with service instead of sitting at a flat number", () => {
  const days = (startDate: string) => entitlementFor({ rules, typeName: "Annual Leave", startDate, asOf: "2026-08-05" }).days;
  assert.equal(days("2026-01-01"), 8, "first year");
  assert.equal(days("2024-01-01"), 12, "third year");
  assert.equal(days("2019-01-01"), 16, "past five years");
});

test("sick leave has its own tiers", () => {
  const days = (startDate: string) => entitlementFor({ rules, typeName: "Medical Leave", startDate, asOf: "2026-08-05" }).days;
  assert.equal(days("2026-01-01"), 14);
  assert.equal(days("2024-01-01"), 18);
  assert.equal(days("2019-01-01"), 22);
});

test("a more generous contract beats the statutory tier", () => {
  const result = entitlementFor({ rules, typeName: "Annual Leave", startDate: "2026-01-01", asOf: "2026-08-05", recordedDays: 20 });
  assert.equal(result.days, 20);
  assert.equal(result.source, "contract");
});

test("but a stingy record cannot take the statutory floor away", () => {
  // Somebody in their sixth year is owed 16 whatever the record says.
  const result = entitlementFor({ rules, typeName: "Annual Leave", startDate: "2019-01-01", asOf: "2026-08-05", recordedDays: 8 });
  assert.equal(result.days, 16);
  assert.equal(result.source, "statutory");
});

test("maternity and paternity are fixed, not earned by service", () => {
  const maternity = entitlementFor({ rules, typeName: "Maternity Leave", startDate: "2026-06-01", asOf: "2026-08-05" });
  const paternity = entitlementFor({ rules, typeName: "Paternity Leave", startDate: "2019-01-01", asOf: "2026-08-05" });

  assert.equal(maternity.days, 98);
  assert.equal(maternity.source, "fixed");
  assert.equal(paternity.days, 7, "the same on day one as after ten years");
});

test("consecutive leave is counted in calendar days, not working days", () => {
  assert.equal(countsCalendarDays(rules, "Maternity Leave"), true, "a weekend inside 98 days is part of it");
  assert.equal(countsCalendarDays(rules, "Paternity Leave"), true);
  assert.equal(countsCalendarDays(rules, "Annual Leave"), false);
  assert.equal(countsCalendarDays(rules, "Unpaid Leave"), false);
});

test("unpaid leave draws on no balance", () => {
  const rule = findLeaveRule(rules, "Unpaid Leave");
  assert.equal(rule?.deductsBalance, false);
  assert.equal(rule?.paid, false);
  assert.equal(entitlementFor({ rules, typeName: "Unpaid Leave", startDate: "2019-01-01", asOf: "2026-08-05" }).days, 0);
});

test("an unknown type falls back to whatever is on the record", () => {
  const result = entitlementFor({ rules, typeName: "Study Leave", startDate: "2019-01-01", asOf: "2026-08-05", recordedDays: 5 });
  assert.equal(result.days, 5);
  assert.equal(result.rule, null);
});

test("the type name is matched regardless of case", () => {
  assert.ok(findLeaveRule(rules, "annual leave"));
  assert.ok(findLeaveRule(rules, "ANNUAL LEAVE"));
  assert.equal(findLeaveRule(rules, "  Annual Leave  ")?.kind, "annual");
});

test("stored rules load, and a company's own type is not dropped", () => {
  const stored = toLeaveRules([
    { name: "Annual Leave", tiers: [{ fromYears: 0, days: 20 }] },
    { name: "Study Leave" },
  ]);

  assert.equal(stored.length, 2);
  assert.equal(tierFor(stored[0].tiers!, 0), 20, "a company contracting above the minimum is honoured");
  assert.equal(stored[1].name, "Study Leave");
  assert.equal(stored[1].deductsBalance, true, "an unrecognised type is an ordinary balance type");
});

test("a stored type keeps the behaviour the defaults know about it", () => {
  const stored = toLeaveRules([{ name: "Maternity Leave" }]);
  assert.equal(stored[0].fixedDays, 98, "filled from the default rather than lost");
  assert.equal(stored[0].consecutiveDays, true);
});

test("tiers stored out of order still resolve correctly", () => {
  const stored = toLeaveRules([{ name: "Annual Leave", tiers: [{ fromYears: 5, days: 16 }, { fromYears: 0, days: 8 }] }]);
  assert.equal(tierFor(stored[0].tiers!, 0), 8);
  assert.equal(tierFor(stored[0].tiers!, 6), 16);
});

test("an empty or damaged configuration falls back to the statutory set", () => {
  assert.deepEqual(toLeaveRules([]), DEFAULT_LEAVE_RULES);
  assert.deepEqual(toLeaveRules(null), DEFAULT_LEAVE_RULES);
  assert.ok(leaveTypeNames(DEFAULT_LEAVE_RULES).includes("Maternity Leave"));
});

test("plain strings still load, since that is how the list used to be stored", () => {
  const stored = toLeaveRules(["Annual Leave", "Unpaid Leave"]);
  assert.deepEqual(stored.map((rule) => rule.name), ["Annual Leave", "Unpaid Leave"]);
  assert.equal(stored[0].kind, "annual", "and pick their behaviour back up from the defaults");
  assert.equal(stored[1].deductsBalance, false);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  detectDuplicates,
  detectMissingRecurring,
  detectSpikes,
  detectStaleReceivables,
  detectUncategorised,
  detectUnposted,
  rankSignals,
  type LedgerFact,
} from "./accounting-signals.ts";

const spend = (over: Partial<LedgerFact> & { id: string; date: string; amount: number }): LedgerFact => ({
  accountCode: "6200", accountName: "Software subscriptions", accountType: "expense",
  vendorId: "v-1", vendorName: "Adobe", ...over,
});

test("the same supplier and amount days apart is flagged", () => {
  const signals = detectDuplicates([
    spend({ id: "a", date: "2026-07-10", amount: 450 }),
    spend({ id: "b", date: "2026-07-12", amount: 450 }),
  ]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].severity, "high");
  assert.deepEqual(signals[0].recordIds, ["a", "b"]);
});

test("a monthly retainer is not a duplicate", () => {
  // Same vendor, same amount, but a month apart — the normal case, and the one
  // a naive vendor+amount match would flood the review with.
  const signals = detectDuplicates([
    spend({ id: "a", date: "2026-06-01", amount: 450 }),
    spend({ id: "b", date: "2026-07-01", amount: 450 }),
  ]);
  assert.equal(signals.length, 0);
});

test("different amounts or vendors are never duplicates", () => {
  assert.equal(detectDuplicates([
    spend({ id: "a", date: "2026-07-10", amount: 450 }),
    spend({ id: "b", date: "2026-07-11", amount: 450.01 }),
  ]).length, 0, "one cent apart is a different payment");

  assert.equal(detectDuplicates([
    spend({ id: "a", date: "2026-07-10", amount: 450, vendorId: "v-1" }),
    spend({ id: "b", date: "2026-07-11", amount: 450, vendorId: "v-2", vendorName: "Figma" }),
  ]).length, 0);
});

test("unnamed counterparties are skipped rather than guessed at", () => {
  // Two RM50 expenses in a week with no supplier is ordinary, not suspicious.
  const signals = detectDuplicates([
    spend({ id: "a", date: "2026-07-10", amount: 50, vendorId: undefined, vendorName: undefined }),
    spend({ id: "b", date: "2026-07-11", amount: 50, vendorId: undefined, vendorName: undefined }),
  ]);
  assert.equal(signals.length, 0);
});

test("income is never checked for duplicates", () => {
  const signals = detectDuplicates([
    { id: "a", date: "2026-07-10", amount: 5000, accountCode: "4000", accountName: "Fees", accountType: "income", vendorName: "Client" },
    { id: "b", date: "2026-07-11", amount: 5000, accountCode: "4000", accountName: "Fees", accountType: "income", vendorName: "Client" },
  ]);
  assert.equal(signals.length, 0);
});

test("a spike is measured against the account's own history", () => {
  const facts = [
    spend({ id: "m1", date: "2026-04-05", amount: 500, accountCode: "5010", accountName: "Advertising" }),
    spend({ id: "m2", date: "2026-05-05", amount: 500, accountCode: "5010", accountName: "Advertising" }),
    spend({ id: "m3", date: "2026-06-05", amount: 500, accountCode: "5010", accountName: "Advertising" }),
    spend({ id: "now", date: "2026-07-05", amount: 3000, accountCode: "5010", accountName: "Advertising" }),
  ];
  const signals = detectSpikes(facts, { period: "2026-07" });
  assert.equal(signals.length, 1);
  assert.equal(signals[0].severity, "high", "6x the average is high");
  assert.deepEqual(signals[0].recordIds, ["now"]);
});

test("steady spend is not a spike", () => {
  const facts = ["2026-04", "2026-05", "2026-06", "2026-07"].map((bucket, index) =>
    spend({ id: `m${index}`, date: `${bucket}-05`, amount: 520, accountCode: "5010" }));
  assert.equal(detectSpikes(facts, { period: "2026-07" }).length, 0);
});

test("a first-ever month is not a spike, having nothing to be high against", () => {
  const facts = [spend({ id: "only", date: "2026-07-05", amount: 9000, accountCode: "5010" })];
  assert.equal(detectSpikes(facts, { period: "2026-07" }).length, 0);
});

test("small amounts are ignored however proportionally large", () => {
  // RM12 against an average of RM2 is 6x, and worth nobody's attention.
  const facts = [
    spend({ id: "a", date: "2026-05-05", amount: 2, accountCode: "6500" }),
    spend({ id: "b", date: "2026-06-05", amount: 2, accountCode: "6500" }),
    spend({ id: "c", date: "2026-07-05", amount: 12, accountCode: "6500" }),
  ];
  assert.equal(detectSpikes(facts, { period: "2026-07" }).length, 0);
});

test("a supplier billed every month with nothing this month is flagged", () => {
  const facts = ["2026-04", "2026-05", "2026-06"].map((bucket, index) =>
    spend({ id: `r${index}`, date: `${bucket}-01`, amount: 1800, vendorName: "Office landlord", vendorId: "landlord" }));
  const signals = detectMissingRecurring(facts, { period: "2026-07" });
  assert.equal(signals.length, 1);
  assert.match(signals[0].title, /Office landlord/);
  assert.equal(signals[0].amount, 1800, "reports the usual amount so the gap is sized");
});

test("a supplier who stopped months ago is not reported forever", () => {
  // Billed Jan-Mar, nothing since. In July that is a former supplier, not a
  // missed bill, and reporting it every month would train people to ignore this.
  const facts = ["2026-01", "2026-02", "2026-03"].map((bucket, index) =>
    spend({ id: `r${index}`, date: `${bucket}-01`, amount: 500, vendorId: "old" }));
  assert.equal(detectMissingRecurring(facts, { period: "2026-07" }).length, 0);
});

test("a one-off purchase is not a missing recurring bill", () => {
  const facts = [spend({ id: "one", date: "2026-06-01", amount: 4000, vendorId: "camera-shop" })];
  assert.equal(detectMissingRecurring(facts, { period: "2026-07" }).length, 0);
});

test("a supplier billed this period is not missing", () => {
  const facts = ["2026-04", "2026-05", "2026-06", "2026-07"].map((bucket, index) =>
    spend({ id: `r${index}`, date: `${bucket}-01`, amount: 1800, vendorId: "landlord" }));
  assert.equal(detectMissingRecurring(facts, { period: "2026-07" }).length, 0);
});

test("cost parked in the holding account is surfaced", () => {
  const signals = detectUncategorised([
    { code: "6900", name: "Other expenses", systemKey: "uncategorised", balance: 1250 },
    { code: "6200", name: "Software", balance: 800 },
  ]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].amount, 1250);
  assert.equal(detectUncategorised([{ code: "6900", name: "Other", systemKey: "uncategorised", balance: 0 }]).length, 0);
});

test("receivables are stale only past the threshold", () => {
  const asOf = new Date("2026-07-31T00:00:00Z");
  const signals = detectStaleReceivables([
    { id: "i1", reference: "INV-1", customerName: "Chef Ammar", dueDate: "2026-03-01", outstanding: 5000 },
    { id: "i2", reference: "INV-2", dueDate: "2026-07-20", outstanding: 900 },
    { id: "i3", reference: "INV-3", dueDate: "2026-01-01", outstanding: 0 },
  ], { asOf });
  assert.equal(signals.length, 1, "only the long-overdue one with a balance");
  assert.equal(signals[0].recordIds[0], "i1");
  assert.equal(signals[0].severity, "high", "over 90 days");
});

test("money that never reached the ledger is the loudest signal", () => {
  const signals = detectUnposted({
    invoices: { count: 3, value: 12000 },
    cash: { count: 2, net: -400 },
    settlements: { count: 1 },
  });
  assert.equal(signals.length, 3);
  assert.equal(signals.filter((signal) => signal.severity === "high").length, 2);
  assert.equal(detectUnposted({ invoices: { count: 0, value: 0 }, cash: { count: 0, net: 0 }, settlements: { count: 0 } }).length, 0);
});

test("ranking puts severity first, then size", () => {
  const ranked = rankSignals([
    { kind: "spike", severity: "medium", title: "m-small", detail: "", amount: 100, recordIds: [] },
    { kind: "duplicate", severity: "high", title: "h-small", detail: "", amount: 50, recordIds: [] },
    { kind: "spike", severity: "medium", title: "m-big", detail: "", amount: 9000, recordIds: [] },
  ]);
  assert.deepEqual(ranked.map((signal) => signal.title), ["h-small", "m-big", "m-small"]);
});

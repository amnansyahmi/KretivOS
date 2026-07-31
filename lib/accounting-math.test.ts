import assert from "node:assert/strict";
import test from "node:test";
import {
  agingBucket,
  allocateCents,
  checkBalance,
  fromCents,
  lineTax,
  signedBalance,
  toCents,
} from "./accounting-math.ts";

test("money survives the arithmetic that breaks floating point", () => {
  // The canonical failure: this is why the ledger works in integer cents.
  assert.notEqual(0.1 + 0.2, 0.3);
  assert.equal(toCents(0.1) + toCents(0.2), toCents(0.3));

  // A hundred RM0.07 lines must sum to exactly RM7.00.
  const cents = Array.from({ length: 100 }, () => toCents(0.07)).reduce((sum, value) => sum + value, 0);
  assert.equal(fromCents(cents), 7);

  assert.equal(toCents("1234.565"), 123457, "half-cents round up rather than truncating");
  assert.equal(toCents(null), 0);
  assert.equal(toCents(undefined), 0);
});

test("account types move in the direction their side implies", () => {
  // Spending RM50 from the bank: assets fall, expenses rise.
  assert.equal(signedBalance("asset", 0, 5000), -5000);
  assert.equal(signedBalance("expense", 5000, 0), 5000);
  // Invoicing a client: income rises on the credit side.
  assert.equal(signedBalance("income", 0, 5000), 5000);
  assert.equal(signedBalance("liability", 0, 5000), 5000);
  assert.equal(signedBalance("equity", 0, 5000), 5000);
});

test("a balanced entry passes and its total is the debit side", () => {
  const result = checkBalance([{ debit: 106 }, { credit: 100 }, { credit: 6 }]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.totalCents, 10600);
});

test("unbalanced entries are rejected with the amounts named", () => {
  const result = checkBalance([{ debit: 100 }, { credit: 99.95 }]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.problem.kind, "unbalanced");
    if (result.problem.kind === "unbalanced") {
      assert.equal(result.problem.debit, 100);
      assert.equal(result.problem.credit, 99.95);
    }
  }
});

test("a line cannot be two-sided, empty, negative, or the only line", () => {
  const cases: [any[], string][] = [
    [[{ debit: 50, credit: 50 }, { credit: 50 }], "two_sided"],
    [[{ debit: 0 }, { credit: 50 }], "empty"],
    [[{ debit: -50 }, { credit: 50 }], "negative"],
    [[{ debit: 50 }], "too_few_lines"],
  ];
  for (const [lines, expected] of cases) {
    const result = checkBalance(lines);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.problem.kind, expected);
  }
});

test("a zero-value entry is refused even though it technically balances", () => {
  const result = checkBalance([{ debit: 0, credit: 0 }, { debit: 0, credit: 0 }]);
  assert.equal(result.ok, false);
  // Caught as an empty line before the zero check, which is the more useful message.
  if (!result.ok) assert.ok(["empty", "zero"].includes(result.problem.kind));
});

test("splitting a total never loses or invents a cent", () => {
  // RM100 across three ways: 33.33 + 33.33 + 33.34.
  const thirds = allocateCents(10000, [1, 1, 1]);
  assert.deepEqual(thirds, [3333, 3333, 3334]);
  assert.equal(thirds.reduce((sum, part) => sum + part, 0), 10000);

  // Weighted by client value, an awkward ratio still reconciles exactly.
  const weighted = allocateCents(10000, [7, 11, 13]);
  assert.equal(weighted.reduce((sum, part) => sum + part, 0), 10000);

  assert.deepEqual(allocateCents(10000, [0, 0]), [0, 0], "no weights allocates nothing rather than dividing by zero");
});

test("tax works from both an exclusive and an inclusive price", () => {
  // Exclusive: RM100 + 6% SST.
  const exclusive = lineTax({ amountCents: 10000, ratePercent: 6 });
  assert.equal(exclusive.taxCents, 600);
  assert.equal(exclusive.grossCents, 10600);

  // Inclusive: a RM106 receipt total that already contains 6%.
  const inclusive = lineTax({ amountCents: 10600, ratePercent: 6, inclusive: true });
  assert.equal(inclusive.netCents, 10000);
  assert.equal(inclusive.taxCents, 600);
  assert.equal(inclusive.grossCents, 10600);

  // Net + tax always reconstructs the gross, whichever way round.
  for (const amount of [1, 333, 4999, 123456]) {
    const result = lineTax({ amountCents: amount, ratePercent: 6, inclusive: true });
    assert.equal(result.netCents + result.taxCents, result.grossCents);
  }

  assert.equal(lineTax({ amountCents: 10000, ratePercent: 0 }).taxCents, 0);
});

test("aging buckets are measured from the due date", () => {
  const asOf = new Date("2026-07-31T00:00:00Z");
  assert.equal(agingBucket("2026-08-15", asOf), "current", "not yet due");
  assert.equal(agingBucket("2026-07-31", asOf), "current", "due today is not overdue");
  assert.equal(agingBucket("2026-07-30", asOf), "1-30");
  assert.equal(agingBucket("2026-07-01", asOf), "1-30");
  assert.equal(agingBucket("2026-06-30", asOf), "31-60");
  assert.equal(agingBucket("2026-06-01", asOf), "31-60", "60 days past due is the top of its bucket");
  assert.equal(agingBucket("2026-05-15", asOf), "61-90", "77 days past due");
  assert.equal(agingBucket("2026-05-02", asOf), "61-90", "90 days past due is still 61-90");
  assert.equal(agingBucket("2026-05-01", asOf), "90+", "91 days past due tips over");
  assert.equal(agingBucket("2026-01-01", asOf), "90+");
  assert.equal(agingBucket("", asOf), "current", "no due date is not overdue");
});

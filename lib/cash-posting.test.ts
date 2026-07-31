import assert from "node:assert/strict";
import test from "node:test";
import { checkBalance, toCents } from "./accounting-math.ts";
import { cashEntryLines } from "./cash-posting-lines.ts";

const base = {
  date: "2026-07-20",
  amount: 250,
  bankAccountId: "bank-1",
  ledgerAccountId: "expense-1",
};

test("money out debits the category and credits the bank", () => {
  const lines = cashEntryLines({ ...base, direction: "out" });
  const bank = lines.find((line) => line.accountId === "bank-1");
  const category = lines.find((line) => line.accountId === "expense-1");
  assert.equal(category?.debit, 250, "the cost is recognised");
  assert.equal(bank?.credit, 250, "the bank goes down");
  assert.equal(checkBalance(lines).ok, true);
});

test("money in is the exact mirror", () => {
  const lines = cashEntryLines({ ...base, direction: "in", ledgerAccountId: "income-1" });
  const bank = lines.find((line) => line.accountId === "bank-1");
  const category = lines.find((line) => line.accountId === "income-1");
  assert.equal(bank?.debit, 250, "the bank goes up");
  assert.equal(category?.credit, 250, "income is recognised");
  assert.equal(checkBalance(lines).ok, true);
});

test("the bank side is always the chosen account, never a default", () => {
  // The Finance tab never asked which account moved, which is why its log could
  // not be reconciled against a statement.
  for (const direction of ["in", "out"] as const) {
    const lines = cashEntryLines({ ...base, direction, bankAccountId: "bank-secondary" });
    assert.ok(lines.some((line) => line.accountId === "bank-secondary"), `${direction} uses the named account`);
  }
});

test("the counterparty rides on the category line, not the bank line", () => {
  // Tagging the bank line would attribute the cash movement itself to a client,
  // which would double-count them on any per-client report.
  const lines = cashEntryLines({ ...base, direction: "out", vendorId: "v-9", customerId: "c-9" });
  const bank = lines.find((line) => line.accountId === "bank-1") as any;
  const category = lines.find((line) => line.accountId === "expense-1") as any;
  assert.equal(category.vendorId, "v-9");
  assert.equal(category.customerId, "c-9");
  assert.equal(bank.vendorId, undefined);
  assert.equal(bank.customerId, undefined);
});

test("awkward amounts still balance to the cent", () => {
  for (const amount of [0.01, 33.33, 1234.56, 99999.99]) {
    for (const direction of ["in", "out"] as const) {
      const lines = cashEntryLines({ ...base, direction, amount });
      const result = checkBalance(lines);
      assert.equal(result.ok, true, `${amount} ${direction} balances`);
      if (result.ok) assert.equal(result.totalCents, toCents(amount));
    }
  }
});

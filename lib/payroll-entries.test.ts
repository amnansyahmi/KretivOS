import assert from "node:assert/strict";
import test from "node:test";
import { checkBalance, toCents } from "./accounting-math.ts";
import {
  employerCost,
  payrollAccrualEntry,
  payrollPaymentEntry,
  statutoryOutstanding,
  type PayrollRecord,
} from "./payroll-entries.ts";

// A realistic Malaysian payslip: RM5,000 gross, employee EPF 11% / SOCSO / EIS
// / PCB deducted, employer paying 12% EPF plus its own SOCSO and EIS.
const record: PayrollRecord = {
  id: "pay-1",
  employeeId: "emp-1",
  period: "2026-07",
  grossPay: 5000,
  totalDeductions: 700,   // 550 EPF + 25 SOCSO + 10 EIS + 115 PCB
  epfEmployee: 550,
  socsoEmployee: 25,
  eisEmployee: 10,
  pcb: 115,
  otherDeductions: 0,
  netPay: 4300,
  epfEmployer: 600,
  socsoEmployer: 43.65,
  eisEmployer: 10,
};

const line = (entry: any, key: string) => entry.lines.find((row: any) => row.accountKey === key);

test("closing payroll expenses gross pay, not net", () => {
  // Deductions are the employee's money held on their behalf. Posting net would
  // understate the wage bill by the whole of EPF, SOCSO, EIS and PCB.
  const entry = payrollAccrualEntry(record, "Amirul Hafiz", { date: "2026-07-31" });
  assert.equal(line(entry, "salaries").debit, 5000);
  assert.notEqual(line(entry, "salaries").debit, record.netPay);
});

test("employer contributions are an extra cost, not a deduction", () => {
  const entry = payrollAccrualEntry(record, "Amirul Hafiz", { date: "2026-07-31" });
  assert.equal(employerCost(record), 653.65);
  assert.equal(line(entry, "employer_statutory").debit, 653.65);
  // Nothing has left the bank yet, so gross plus employer cost is all owed —
  // split across the bodies it is owed to.
  const owed = entry.lines.filter((row: any) => row.credit).reduce((sum: number, row: any) => sum + toCents(row.credit), 0);
  assert.equal(owed, toCents(5653.65));
});

test("the accrual balances", () => {
  const entry = payrollAccrualEntry(record, "Amirul Hafiz", { date: "2026-07-31" });
  const result = checkBalance(entry.lines);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.totalCents, toCents(5653.65));
});

test("a payroll with no employer contributions omits that line", () => {
  const entry = payrollAccrualEntry(
    { ...record, epfEmployer: 0, socsoEmployer: 0, eisEmployer: 0 },
    "Intern", { date: "2026-07-31" },
  );
  assert.equal(line(entry, "employer_statutory"), undefined);
  assert.equal(line(entry, "payroll_liability").credit, 4300, "net pay only");
  assert.equal(checkBalance(entry.lines).ok, true);
});

test("paying payroll only moves net pay out of the bank", () => {
  const entry = payrollPaymentEntry(record, "Amirul Hafiz", { date: "2026-08-05", bankAccountId: "bank-1" });
  assert.equal(line(entry, "payroll_liability").debit, 4300);
  assert.equal(entry.lines.find((row) => row.accountId === "bank-1")?.credit, 4300);
  assert.equal(checkBalance(entry.lines).ok, true);
});

test("statutory money stays owed after net pay is settled", () => {
  // Paying the employee does not pay EPF, SOCSO or LHDN — that happens later and
  // to someone else. The employee liability clears; the statutory ones do not.
  const accrual = payrollAccrualEntry(record, "Amirul Hafiz", { date: "2026-07-31" });
  const payment = payrollPaymentEntry(record, "Amirul Hafiz", { date: "2026-08-05", bankAccountId: "bank-1" });

  const employeeOwed = toCents(line(accrual, "payroll_liability").credit) - toCents(line(payment, "payroll_liability").debit);
  assert.equal(employeeOwed, 0, "the employee has been paid in full");

  const statutoryOwed = ["epf_payable", "socso_payable", "pcb_payable"]
    .reduce((sum, key) => sum + toCents(line(accrual, key)?.credit ?? 0), 0);
  assert.equal(statutoryOwed, toCents(statutoryOutstanding(record)), "and the government has not");
  assert.equal(statutoryOutstanding(record), 1353.65, "700 employee deductions + 653.65 employer");
});

test("each statutory body is owed its own separately readable amount", () => {
  // A single payroll liability cannot answer "how much EPF do we owe this
  // month", which is the question actually asked when a remittance falls due.
  const entry = payrollAccrualEntry(record, "Amirul Hafiz", { date: "2026-07-31" });
  assert.equal(line(entry, "epf_payable").credit, 1150, "550 employee + 600 employer");
  assert.equal(line(entry, "socso_payable").credit, 88.65, "25 + 10 employee, 43.65 + 10 employer");
  assert.equal(line(entry, "pcb_payable").credit, 115);
});

test("the two entries together leave exactly the statutory balance", () => {
  // The full round trip: cost recognised, employee paid, government still owed.
  const accrual = payrollAccrualEntry(record, "A", { date: "2026-07-31" });
  const payment = payrollPaymentEntry(record, "A", { date: "2026-08-05", bankAccountId: "bank-1" });

  const net = [...accrual.lines, ...payment.lines].reduce(
    (sum, row) => sum + toCents(row.credit) - toCents(row.debit), 0,
  );
  // Every entry balances, so the combined movement nets to zero across all accounts.
  assert.equal(net, 0);
});

test("awkward statutory amounts still balance to the cent", () => {
  for (const employer of [0.01, 43.65, 1234.56]) {
    const entry = payrollAccrualEntry(
      { ...record, epfEmployer: employer, socsoEmployer: 0, eisEmployer: 0 },
      "A", { date: "2026-07-31" },
    );
    assert.equal(checkBalance(entry.lines).ok, true, `employer ${employer} balances`);
  }
});

test("entries are traceable back to the payroll record", () => {
  const accrual = payrollAccrualEntry(record, "A", { date: "2026-07-31" });
  const payment = payrollPaymentEntry(record, "A", { date: "2026-08-05", bankAccountId: "bank-1" });
  assert.equal(accrual.sourceType, "payroll");
  assert.equal(payment.sourceType, "payroll_payment");
  assert.equal(accrual.sourceId, "pay-1");
  assert.equal(payment.sourceId, "pay-1");
  assert.equal(accrual.reference, "PAY-2026-07");
});

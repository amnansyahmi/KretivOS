import assert from "node:assert/strict";
import test from "node:test";
import { isIssuedPayslip, maskAccount, payslipPrintModel, periodLabel } from "./payslip-print.ts";
import type { PrintCompany } from "./print-templates.ts";

const company: PrintCompany = {
  name: "Kretivco Mediaworks",
  registrationNumber: "SA0463354-A",
  addressLines: ["No.15A, Jalan USJ1/19", "47600 Subang Jaya, Selangor"],
  email: "hello@kretivco.com",
  phone: "03-1234 5678",
  logoUrl: "",
};

const employee = {
  name: "Nurfadilah",
  employeeNumber: "KC-004",
  title: "Creative Lead",
  department: "Creative",
  identificationNumber: "950402-10-5533",
  epfNumber: "12345678",
  bankName: "Maybank",
  bankAccountNumber: "512345678901",
};

/** RM5,500 gross with the usual deductions. */
const record = {
  id: "pay-1",
  period: "2026-08",
  status: "Paid",
  paidAt: "2026-08-28T09:00:00.000Z",
  basicSalary: 5000,
  allowances: 500,
  overtime: 0,
  bonus: 0,
  grossPay: 5500,
  epfEmployee: 605,
  socsoEmployee: 27.5,
  eisEmployee: 11,
  pcb: 120,
  otherDeductions: 0,
  totalDeductions: 763.5,
  netPay: 4736.5,
  epfEmployer: 660,
  socsoEmployer: 96.25,
  eisEmployer: 11,
};

const model = payslipPrintModel({ record, employee, company, issuedBy: "Amnan" });

test("a payslip exists once the period is closed, and not before", () => {
  assert.equal(isIssuedPayslip({ status: "Closed" }), true);
  assert.equal(isIssuedPayslip({ status: "Paid" }), true);
  assert.equal(isIssuedPayslip({ status: "Draft" }), false, "a draft is the workings, not a payslip");
  assert.equal(isIssuedPayslip({}), false, "and neither is a record with no status at all");
  assert.equal(isIssuedPayslip({ status: "  Paid  " }), true);
});

test("reopening a period withdraws the payslip", () => {
  // Reopening sets the status back to Draft, and the figures are in play again
  // until it closes — so it stops being something the employee can hold.
  const record = { status: "Paid" };
  assert.equal(isIssuedPayslip(record), true);
  assert.equal(isIssuedPayslip({ ...record, status: "Draft" }), false);
});

test("a period reads as a month, not as a code", () => {
  assert.equal(periodLabel("2026-08"), "August 2026");
  assert.equal(periodLabel("2026-01"), "January 2026");
  assert.equal(periodLabel("nonsense"), "nonsense", "an unparseable period is shown rather than blanked");
});

test("an account number keeps only enough digits to be recognised", () => {
  assert.equal(maskAccount("512345678901"), "••••••••8901");
  assert.equal(maskAccount("1234"), "1234", "too short to mask usefully");
  assert.equal(maskAccount(""), "");
  assert.ok(!maskAccount("512345678901").includes("51234"), "the leading digits do not survive");
});

test("the payslip itemises rather than showing one net figure", () => {
  const descriptions = model.rows.map((row) => row[1]);
  assert.ok(descriptions.includes("Basic salary"));
  assert.ok(descriptions.includes("EPF (employee)"));
  assert.ok(descriptions.includes("PCB / MTD"));
});

test("deductions print in brackets and earnings do not", () => {
  const find = (label: string) => model.rows.find((row) => row[1] === label);
  assert.equal(find("Basic salary")?.[2], "5,000.00");
  assert.equal(find("EPF (employee)")?.[2], "(605.00)");
});

test("a zero line is left off, but a zero total is not", () => {
  const descriptions = model.rows.map((row) => row[1]);
  assert.ok(!descriptions.includes("Overtime"), "no overtime this month, so no overtime row");
  assert.ok(!descriptions.includes("Bonus"));
  assert.equal(model.totals.length, 3, "gross, deductions and net always print");
});

test("the totals are the ones on the record", () => {
  assert.deepEqual(model.totals.map((total) => [total.label, total.value]), [
    ["Gross pay", "5,500.00"],
    ["Total deductions", "763.50"],
    ["Net pay", "4,736.50"],
  ]);
  assert.equal(model.totals[1].parenthesised, true);
  assert.equal(model.totals[2].bold, true);
});

test("rows are numbered in one continuous sequence", () => {
  assert.deepEqual(model.rows.map((row) => row[0]), model.rows.map((_, index) => String(index + 1)));
});

test("the employer's contributions are shown and named as the company's cost", () => {
  const note = model.notes.find((item) => item.includes("Employer contributions"));
  assert.ok(note, "they appear");
  assert.ok(note?.includes("not deducted from it"), "and are explicitly not a deduction");
  assert.ok(note?.includes("660.00"), "with the EPF figure");
});

test("the account it was paid into is identified but not printed in full", () => {
  const note = model.notes.find((item) => item.includes("Paid to"));
  assert.ok(note?.includes("8901"));
  assert.ok(!note?.includes("512345678901"));
});

test("statutory identity is carried, because a payslip is a record", () => {
  const note = model.notes.find((item) => item.includes("EPF 12345678"));
  assert.ok(note?.includes("950402-10-5533"));
});

test("a priced overtime line explains how it was priced", () => {
  const withOvertime = payslipPrintModel({
    record: {
      ...record,
      overtime: 87.5,
      grossPay: 5587.5,
      overtimeBreakdown: { hourlyRate: 12.5, normal: { hours: 2, multiplier: 1.5 }, restDay: { hours: 2, multiplier: 2 }, publicHoliday: { hours: 0, multiplier: 3 } },
    },
    employee,
    company,
  });

  assert.ok(withOvertime.rows.some((row) => row[1] === "Overtime"));
  const note = withOvertime.notes.find((item) => item.startsWith("Overtime:"));
  assert.ok(note?.includes("2h working day × 1.5"));
  assert.ok(note?.includes("2h rest day × 2"));
  assert.ok(!note?.includes("public holiday"), "a band with no hours is not mentioned");
});

test("a payslip is issued, not countersigned", () => {
  assert.equal(model.signatures?.acceptedBy, "", "no acceptance line to sign");
  assert.equal(model.signatures?.issuedBy, "Amnan");
  assert.equal(payslipPrintModel({ record, employee, company }).signatures, null);
});

test("a payslip with nothing on it still renders a total rather than throwing", () => {
  const empty = payslipPrintModel({ record: { period: "2026-08" }, employee: {}, company });
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.totals[2].value, "0.00");
  assert.equal(empty.customerName, "Team member");
});

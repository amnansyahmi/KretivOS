import assert from "node:assert/strict";
import test from "node:test";
import {
  bankPaymentExport,
  buildExport,
  cp39Export,
  csvCell,
  epfExport,
  payrollForPeriod,
  socsoExport,
  toCsv,
  type ExportEmployee,
  type ExportPayroll,
} from "./statutory-exports.ts";

const employees: ExportEmployee[] = [
  { id: "e1", name: "Amirul", employeeNumber: "KC-001", identificationNumber: "900101-10-1111", incomeTaxNumber: "SG1001", epfNumber: "EPF1", socsoNumber: "SOC1", bankName: "Maybank", bankAccountNumber: "1111" },
  { id: "e2", name: "Nurfadilah", employeeNumber: "KC-002", identificationNumber: "950402-10-2222", incomeTaxNumber: "SG1002", epfNumber: "EPF2", socsoNumber: "SOC2", bankName: "CIMB", bankAccountNumber: "2222" },
];

const records: ExportPayroll[] = [
  { employeeId: "e1", period: "2026-08", status: "Paid", grossPay: 5000, netPay: 4300, epfEmployee: 550, epfEmployer: 600, socsoEmployee: 25, socsoEmployer: 87.5, eisEmployee: 10, eisEmployer: 10, pcb: 115 },
  { employeeId: "e2", period: "2026-08", status: "Closed", grossPay: 3000, netPay: 2670, epfEmployee: 330, epfEmployer: 390, socsoEmployee: 15, socsoEmployer: 52.5, eisEmployee: 6, eisEmployer: 6, pcb: 0 },
  { employeeId: "e1", period: "2026-08", status: "Draft", grossPay: 9999, netPay: 9999, epfEmployee: 999, pcb: 999 },
  { employeeId: "e1", period: "2026-07", status: "Paid", grossPay: 5000, netPay: 4300, epfEmployee: 550, pcb: 115 },
];

const employer = { name: "Kretivco", employerNumber: "E1234", epfEmployerNumber: "K999", socsoEmployerNumber: "P999", bankAccountNumber: "9999" };

test("only closed and paid periods are exported", () => {
  const included = payrollForPeriod(records, "2026-08");
  assert.equal(included.length, 2, "the draft is left out");
  assert.ok(!included.some((record) => record.status === "Draft"));
});

test("another month's payroll is not swept in", () => {
  assert.ok(!payrollForPeriod(records, "2026-08").some((record) => record.period === "2026-07"));
});

test("the EPF file carries both shares and their total", () => {
  const file = epfExport(records, employees, "2026-08", employer);
  const amirul = file.rows.find((row) => row[2] === "Amirul");

  assert.deepEqual(amirul, ["EPF1", "900101-10-1111", "Amirul", 5000, 550, 600, 1150]);
  assert.equal(file.totals[4], 880, "employee shares");
  assert.equal(file.totals[5], 990, "employer shares");
  assert.equal(file.totals[6], 1870, "and what the payment must come to");
  assert.deepEqual(file.warnings, []);
});

test("SOCSO and EIS travel together, the way they are collected", () => {
  const file = socsoExport(records, employees, "2026-08", employer);
  const amirul = file.rows.find((row) => row[2] === "Amirul");

  assert.deepEqual(amirul, ["900101-10-1111", "SOC1", "Amirul", 5000, 25, 87.5, 10, 10, 132.5]);
  assert.equal(file.totals[8], 212, "40 SOCSO employee + 140 employer + 16 EIS employee + 16 employer");
});

test("CP39 leaves out anyone with no tax deducted", () => {
  const file = cp39Export(records, employees, "2026-08", employer);
  assert.equal(file.rows.length, 1, "a nil line is not a deduction");
  assert.equal(file.rows[0][2], "Amirul");
  assert.equal(file.totals[4], 115);
});

test("a missing identifier is named rather than silently blank", () => {
  const withoutTaxNumber = employees.map((employee) => employee.id === "e1" ? { ...employee, incomeTaxNumber: "" } : employee);
  const file = cp39Export(records, withoutTaxNumber, "2026-08", employer);
  assert.ok(file.warnings.some((warning) => warning.includes("Income tax number") && warning.includes("Amirul")));
});

test("a missing employer reference is its own warning", () => {
  assert.ok(cp39Export(records, employees, "2026-08", {}).warnings.some((warning) => warning.includes("E number")));
  assert.ok(epfExport(records, employees, "2026-08", {}).warnings.some((warning) => warning.includes("EPF number")));
});

test("the bank file pays net, per person, with a reference", () => {
  const file = bankPaymentExport(records, employees, "2026-08", employer);
  assert.deepEqual(file.rows[0], ["KC-001", "Amirul", "Maybank", "1111", 4300, "SALARY 2026-08"]);
  assert.equal(file.totals[4], 6970, "4300 + 2670");
});

test("somebody with no account is dropped from the payment file and named", () => {
  const missingAccount = employees.map((employee) => employee.id === "e2" ? { ...employee, bankAccountNumber: "" } : employee);
  const file = bankPaymentExport(records, missingAccount, "2026-08", employer);

  assert.equal(file.rows.length, 1, "a blank row in a payment file is worse than a short one");
  assert.equal(file.totals[4], 4300, "and the total matches what is actually being paid");
  assert.ok(file.warnings.some((warning) => warning.includes("Nurfadilah") && warning.includes("no bank account")));
});

test("rows are ordered by name, so two months of the same file compare", () => {
  const file = epfExport(records, employees, "2026-08", employer);
  assert.deepEqual(file.rows.map((row) => row[2]), ["Amirul", "Nurfadilah"]);
});

test("a name with a comma cannot shift the columns after it", () => {
  assert.equal(csvCell("Lim, Wei Ming"), '"Lim, Wei Ming"');
  assert.equal(csvCell('He said "hi"'), '"He said ""hi"""');
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell(1234.5), "1234.5");
});

test("the finished file ends with its own totals row", () => {
  const csv = toCsv(cp39Export(records, employees, "2026-08", employer));
  const lines = csv.split("\r\n");

  assert.ok(lines[0].startsWith("Income Tax Number,"));
  assert.equal(lines.length, 3, "header, one employee, totals");
  assert.ok(lines[2].includes("1 employee(s)"));
});

test("an empty month produces a file with headers and zero totals, not a crash", () => {
  for (const kind of ["kwsp", "perkeso", "cp39", "bank"] as const) {
    const file = buildExport(kind, [], [], "2026-09", employer);
    assert.deepEqual(file.rows, []);
    assert.ok(file.headers.length > 0);
    assert.ok(toCsv(file).includes(file.headers[0]));
  }
});

test("an employee with no matching record still exports without inventing one", () => {
  const orphan: ExportPayroll[] = [{ employeeId: "gone", period: "2026-08", status: "Paid", grossPay: 1000, netPay: 900, epfEmployee: 110, epfEmployer: 130 }];
  const file = epfExport(orphan, employees, "2026-08", employer);
  assert.equal(file.rows.length, 1);
  assert.equal(file.rows[0][2], "", "no name to show, and none made up");
});

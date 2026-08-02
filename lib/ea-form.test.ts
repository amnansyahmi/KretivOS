import assert from "node:assert/strict";
import test from "node:test";
import {
  eaAvailableYears, eaStatement, eaStatementsForYear, eaYearSummary,
  type EAEmployee, type EAEmployer, type PayrollRecord,
} from "./ea-form.ts";

const employer: EAEmployer = {
  name: "Kretivco Mediaworks",
  employerNumber: "E 1234567890",
  registrationNumber: "SA0463354-A",
  address: "No.15A, Jalan USJ1/19, 47600 Subang Jaya, Selangor",
};

const complete: EAEmployee = {
  id: "e1",
  name: "Nurul Aina",
  jobTitle: "Art Director",
  identificationNumber: "950101-14-5566",
  incomeTaxNumber: "SG 12345678900",
  epfNumber: "12345678",
  startDate: "2024-03-01",
};

/** One ordinary month. Employer contributions are present and must be ignored. */
const month = (period: string, over: Partial<PayrollRecord> = {}): PayrollRecord => ({
  employeeId: "e1",
  period,
  status: "Closed",
  basicSalary: 5000,
  allowances: 300,
  overtime: 0,
  bonus: 0,
  epfEmployee: 550,
  socsoEmployee: 24.75,
  eisEmployee: 9.9,
  pcb: 180,
  otherDeductions: 0,
  ...over,
  // Employer-side figures, deliberately larger than the employee's so any
  // accidental inclusion shows up immediately in an assertion.
  ...({ epfEmployer: 650, socsoEmployer: 86.65, eisEmployer: 9.9 } as any),
});

const year = (n: number) => Array.from({ length: 12 }, (_, i) => month(`${n}-${String(i + 1).padStart(2, "0")}`));

test("Part E carries only the employee's contributions, never the employer's", () => {
  const statement = eaStatement(2025, complete, employer, year(2025));
  // 12 x 550, not 12 x (550 + 650). This is the bug the payroll working paper had.
  assert.equal(statement.contributions.epf, 6600);
  assert.equal(statement.contributions.socso, 297);
  assert.equal(statement.contributions.eis, 118.8);
});

test("income is broken down, not just totalled", () => {
  const records = [...year(2025)];
  records[11] = month("2025-12", { bonus: 5000 });
  const statement = eaStatement(2025, complete, employer, records);
  assert.equal(statement.income.salary, 60000);
  assert.equal(statement.income.allowances, 3600);
  assert.equal(statement.income.bonus, 5000);
  assert.equal(statement.income.gross, 68600, "gross is the sum of its parts");
});

test("twelve months of sen do not drift", () => {
  const records = Array.from({ length: 12 }, (_, i) =>
    month(`2025-${String(i + 1).padStart(2, "0")}`, { basicSalary: 3333.33, epfEmployee: 366.67 }));
  const statement = eaStatement(2025, complete, employer, records);
  assert.equal(statement.income.salary, 39999.96);
  assert.equal(statement.contributions.epf, 4400.04);
});

test("draft payroll is excluded, because an EA restates what was paid", () => {
  const records = [month("2025-01"), month("2025-02", { status: "Draft" })];
  const statement = eaStatement(2025, complete, employer, records);
  assert.equal(statement.employment.monthsPaid, 1);
  assert.equal(statement.income.salary, 5000);
});

test("another employee's payroll never leaks in", () => {
  const records = [month("2025-01"), { ...month("2025-01"), employeeId: "e2" }];
  const statement = eaStatement(2025, complete, employer, records);
  assert.equal(statement.income.salary, 5000);
});

test("another year is excluded", () => {
  const statement = eaStatement(2025, complete, employer, [...year(2025), ...year(2024)]);
  assert.equal(statement.employment.monthsPaid, 12);
  assert.equal(statement.income.salary, 60000);
});

test("two runs in one month count as one month of employment", () => {
  const records = [month("2025-01"), month("2025-01", { basicSalary: 200, bonus: 0 })];
  const statement = eaStatement(2025, complete, employer, records);
  assert.equal(statement.employment.monthsPaid, 1, "an adjustment run is not an extra month");
  assert.equal(statement.income.salary, 5200, "but its money still counts");
});

test("a statement that cannot be filed says exactly why", () => {
  const statement = eaStatement(2025, { id: "e1", name: "Nurul Aina" }, employer, year(2025));
  assert.equal(statement.fileable, false);
  assert.ok(statement.missing.some((m) => /identification number/i.test(m)));
  assert.ok(statement.missing.some((m) => /income tax number/i.test(m)));
  assert.ok(statement.missing.some((m) => /EPF number/i.test(m)));
});

test("the EPF number is only required when EPF was actually deducted", () => {
  const noEpf = year(2025).map((record) => ({ ...record, epfEmployee: 0 }));
  const statement = eaStatement(2025, { ...complete, epfNumber: "" }, employer, noEpf);
  assert.equal(statement.missing.some((m) => /EPF number/i.test(m)), false);
});

test("a missing employer E number blocks the whole batch", () => {
  const statement = eaStatement(2025, complete, { ...employer, employerNumber: "" }, year(2025));
  assert.equal(statement.fileable, false);
  assert.ok(statement.missing.some((m) => /E number/i.test(m)));
});

test("a complete statement is fileable", () => {
  const statement = eaStatement(2025, complete, employer, year(2025));
  assert.deepEqual(statement.missing, []);
  assert.equal(statement.fileable, true);
});

test("a leaver still gets a statement", () => {
  const leaver: EAEmployee = { ...complete, id: "e2", name: "Faiz", endDate: "2025-03-31" };
  const records = ["2025-01", "2025-02", "2025-03"].map((p) => ({ ...month(p), employeeId: "e2" }));
  const statements = eaStatementsForYear(2025, [leaver], employer, records);
  assert.equal(statements.length, 1, "generating from current staff is how an EA gets missed");
  assert.equal(statements[0].employment.monthsPaid, 3);
  assert.equal(statements[0].employment.to, "2025-03-31");
});

test("someone with no payroll that year gets no statement", () => {
  const statements = eaStatementsForYear(2025, [complete, { id: "e3", name: "New Joiner" }], employer, year(2025));
  assert.deepEqual(statements.map((s) => s.employee.id), ["e1"]);
});

test("statements come back in name order", () => {
  const people: EAEmployee[] = [
    { ...complete, id: "e1", name: "Zara" },
    { ...complete, id: "e2", name: "Aiman" },
  ];
  const records = [month("2025-01"), { ...month("2025-01"), employeeId: "e2" }];
  const statements = eaStatementsForYear(2025, people, employer, records);
  assert.deepEqual(statements.map((s) => s.employee.name), ["Aiman", "Zara"]);
});

test("the year summary counts what can and cannot be filed", () => {
  const people: EAEmployee[] = [complete, { id: "e2", name: "Incomplete Person" }];
  const records = [...year(2025), ...year(2025).map((r) => ({ ...r, employeeId: "e2" }))];
  const summary = eaYearSummary(eaStatementsForYear(2025, people, employer, records));
  assert.equal(summary.employees, 2);
  assert.equal(summary.fileable, 1);
  assert.equal(summary.incomplete, 1);
  assert.equal(summary.gross, 127200, "two people at 63,600 each");
  assert.equal(summary.epfEmployee, 13200, "still employee-only across the summary");
});

test("available years are the ones with closed payroll, newest first", () => {
  const records = [...year(2024), ...year(2026), month("2023-01", { status: "Draft" })];
  assert.deepEqual(eaAvailableYears(records), [2026, 2024]);
});

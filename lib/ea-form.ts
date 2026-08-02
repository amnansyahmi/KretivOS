/**
 * Form C.P.8A (EA) — Statement of Remuneration from Employment.
 *
 * Every Malaysian employer must give each employee an EA statement for the
 * preceding calendar year by the end of February. The employee then files their
 * own return from it, so the figures here end up on somebody's tax assessment.
 *
 * What already existed was a payroll *working paper*: one CSV row per employee
 * with a single "EPF" column. That column added the employer's contribution to
 * the employee's. On a working paper that is a defensible total cost figure; on
 * an EA it is wrong, and wrong in the direction that inflates the employee's
 * claimable relief by roughly the employer's 12–13%. Part E of the EA asks only
 * what was deducted *from the employee*, because only that is their money.
 *
 * So this module deliberately never touches the employer-side fields. They are
 * not omitted by oversight; they do not belong on this form.
 *
 * It also refuses to quietly print an incomplete statement. An EA missing the
 * employee's identification number or the employer's E number is not a lesser
 * EA, it is one that cannot be filed — so `missing` names each gap and the
 * caller is expected to show them rather than hand over blank boxes.
 */

/** A payroll line as stored by /api/hr. Employer fields are intentionally absent. */
export type PayrollRecord = {
  employeeId: string;
  period: string;
  status?: string;
  basicSalary?: number;
  allowances?: number;
  overtime?: number;
  bonus?: number;
  epfEmployee?: number;
  socsoEmployee?: number;
  eisEmployee?: number;
  pcb?: number;
  otherDeductions?: number;
};

export type EAEmployee = {
  id: string;
  name?: string;
  jobTitle?: string;
  /** NRIC, or passport number for a non-citizen. */
  identificationNumber?: string;
  /** "No. Cukai Pendapatan" — the employee's own LHDN reference. */
  incomeTaxNumber?: string;
  epfNumber?: string;
  socsoNumber?: string;
  startDate?: string;
  endDate?: string;
};

export type EAEmployer = {
  name?: string;
  /** The employer's LHDN reference, the "E" number. Not the company registration. */
  employerNumber?: string;
  registrationNumber?: string;
  address?: string;
};

export type EAStatement = {
  year: number;
  employee: EAEmployee;
  employer: EAEmployer;
  employment: { from: string; to: string; monthsPaid: number };
  /** Part B1(a). Split out because the form asks for the composition, not one total. */
  income: {
    salary: number;
    allowances: number;
    overtime: number;
    bonus: number;
    gross: number;
  };
  /** Part D. */
  deductions: { pcb: number; other: number };
  /** Part E — the employee's own contributions, never the employer's. */
  contributions: { epf: number; socso: number; eis: number };
  /** Everything that must be filled in before this can be handed over. */
  missing: string[];
  /** True when nothing is missing. */
  fileable: boolean;
};

/** Money is summed in cents so twelve monthly figures cannot drift by a sen. */
const cents = (value: unknown) => Math.round(Number(value ?? 0) * 100);
const money = (total: number) => Math.round(total) / 100;

const clean = (value: unknown) => String(value ?? "").trim();

/** Periods are "YYYY-MM"; a record belongs to the year its period names. */
export function isInYear(record: PayrollRecord, year: number) {
  return clean(record.period).slice(0, 4) === String(year);
}

/**
 * Only closed or paid payroll counts.
 *
 * A draft period is a working figure that can still change, and an EA restates
 * what was actually paid. Including drafts would produce a statement that
 * disagrees with the payslips the employee already holds.
 */
export const COUNTED_STATUSES = ["Closed", "Paid"];

export function isCounted(record: PayrollRecord) {
  return COUNTED_STATUSES.includes(clean(record.status));
}

/**
 * Builds one employee's EA statement for a calendar year.
 *
 * `records` may be the whole organisation's payroll; it is filtered here so the
 * caller cannot forget to.
 */
export function eaStatement(
  year: number,
  employee: EAEmployee,
  employer: EAEmployer,
  records: PayrollRecord[],
): EAStatement {
  const mine = records.filter((record) =>
    record.employeeId === employee.id && isInYear(record, year) && isCounted(record));

  const total = mine.reduce((sum, record) => ({
    salary: sum.salary + cents(record.basicSalary),
    allowances: sum.allowances + cents(record.allowances),
    overtime: sum.overtime + cents(record.overtime),
    bonus: sum.bonus + cents(record.bonus),
    pcb: sum.pcb + cents(record.pcb),
    other: sum.other + cents(record.otherDeductions),
    epf: sum.epf + cents(record.epfEmployee),
    socso: sum.socso + cents(record.socsoEmployee),
    eis: sum.eis + cents(record.eisEmployee),
  }), { salary: 0, allowances: 0, overtime: 0, bonus: 0, pcb: 0, other: 0, epf: 0, socso: 0, eis: 0 });

  const grossCents = total.salary + total.allowances + total.overtime + total.bonus;

  // A month is counted once however many lines it has, so a mid-month
  // adjustment run does not read as an extra month of employment.
  const monthsPaid = new Set(mine.map((record) => clean(record.period))).size;

  const missing: string[] = [];
  if (!clean(employee.name)) missing.push("Employee name");
  if (!clean(employee.identificationNumber)) missing.push("Employee identification number (NRIC or passport)");
  if (!clean(employee.incomeTaxNumber)) missing.push("Employee income tax number");
  if (!clean(employee.epfNumber) && total.epf > 0) missing.push("Employee EPF number");
  if (!clean(employer.name)) missing.push("Employer name");
  if (!clean(employer.employerNumber)) missing.push("Employer number (E number)");
  if (!clean(employer.address)) missing.push("Employer address");
  if (!monthsPaid) missing.push(`No closed payroll for ${year}`);

  return {
    year,
    employee,
    employer,
    employment: {
      from: clean(employee.startDate),
      to: clean(employee.endDate),
      monthsPaid,
    },
    income: {
      salary: money(total.salary),
      allowances: money(total.allowances),
      overtime: money(total.overtime),
      bonus: money(total.bonus),
      gross: money(grossCents),
    },
    deductions: { pcb: money(total.pcb), other: money(total.other) },
    contributions: { epf: money(total.epf), socso: money(total.socso), eis: money(total.eis) },
    missing,
    fileable: missing.length === 0,
  };
}

/**
 * Every employee who was paid in the year.
 *
 * Driven by the payroll rather than the staff list, so somebody who left in
 * March still gets the statement they are owed — the commonest way an EA is
 * missed is by generating from "current employees".
 */
export function eaStatementsForYear(
  year: number,
  employees: EAEmployee[],
  employer: EAEmployer,
  records: PayrollRecord[],
): EAStatement[] {
  const paid = new Set(
    records.filter((record) => isInYear(record, year) && isCounted(record))
      .map((record) => record.employeeId),
  );

  return employees
    .filter((employee) => paid.has(employee.id))
    .map((employee) => eaStatement(year, employee, employer, records))
    .sort((a, b) => clean(a.employee.name).localeCompare(clean(b.employee.name)));
}

/**
 * The employer's own annual total (Form E territory).
 *
 * Kept separate from the EA figures because this one legitimately includes the
 * employer contributions — it is the company's cost, not the employee's income.
 */
export function eaYearSummary(statements: EAStatement[]) {
  const sum = statements.reduce((total, statement) => ({
    gross: total.gross + cents(statement.income.gross),
    pcb: total.pcb + cents(statement.deductions.pcb),
    epf: total.epf + cents(statement.contributions.epf),
    socso: total.socso + cents(statement.contributions.socso),
    eis: total.eis + cents(statement.contributions.eis),
  }), { gross: 0, pcb: 0, epf: 0, socso: 0, eis: 0 });

  return {
    employees: statements.length,
    fileable: statements.filter((statement) => statement.fileable).length,
    incomplete: statements.filter((statement) => !statement.fileable).length,
    gross: money(sum.gross),
    pcb: money(sum.pcb),
    epfEmployee: money(sum.epf),
    socsoEmployee: money(sum.socso),
    eisEmployee: money(sum.eis),
  };
}

/** Years that have any counted payroll, newest first. */
export function eaAvailableYears(records: PayrollRecord[]): number[] {
  const years = new Set(
    records.filter(isCounted)
      .map((record) => Number(clean(record.period).slice(0, 4)))
      .filter((year) => Number.isFinite(year) && year > 1990),
  );
  return [...years].sort((a, b) => b - a);
}

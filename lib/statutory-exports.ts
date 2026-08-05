/**
 * Monthly submission files: KWSP, PERKESO, LHDN and the bank.
 *
 * Every month the same figures were read off a screen and retyped into four
 * separate portals, one employee at a time. Retyping is where the errors are —
 * a transposed account number pays the wrong person, a transposed contribution
 * is a shortfall nobody notices until a statement arrives.
 *
 * What this produces is CSV: one file per scheme, with the columns each portal
 * asks for, the employee identifiers it matches on, and a total row to check
 * against before uploading. That is deliberate, and it is worth being plain
 * about the limit. The portals also accept fixed-width text files whose layouts
 * are published in their own specifications — byte positions, filler
 * characters, header and trailer records. Those specifications are not encoded
 * here, and a fixed-width file that is subtly wrong fails on upload at best and
 * posts against the wrong member at worst. CSV removes the retyping, which is
 * the actual risk, without pretending to a precision this cannot verify.
 *
 * Only closed and paid periods are exported, the same rule the EA statement
 * uses: a draft can still change, and a contribution remitted against a figure
 * that later moves has to be corrected by hand at both ends.
 *
 * Pure, so every column and total is asserted directly.
 */

export type ExportEmployee = {
  id: string;
  name?: string;
  employeeNumber?: string;
  identificationNumber?: string;
  incomeTaxNumber?: string;
  epfNumber?: string;
  socsoNumber?: string;
  bankName?: string;
  bankAccountNumber?: string;
};

export type ExportPayroll = {
  employeeId?: string;
  period?: string;
  status?: string;
  grossPay?: number;
  netPay?: number;
  epfEmployee?: number;
  epfEmployer?: number;
  socsoEmployee?: number;
  socsoEmployer?: number;
  eisEmployee?: number;
  eisEmployer?: number;
  pcb?: number;
};

export type ExportEmployer = {
  name?: string;
  employerNumber?: string;
  registrationNumber?: string;
  epfEmployerNumber?: string;
  socsoEmployerNumber?: string;
  bankAccountNumber?: string;
};

export type StatutoryExport = {
  /** Suggested file name, without a path. */
  filename: string;
  headers: string[];
  rows: (string | number)[][];
  /** Appended as a final row, so the upload can be checked before it is sent. */
  totals: (string | number)[];
  /** Anything that would make the file rejected or wrong. */
  warnings: string[];
};

const clean = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const amount = (value: unknown) => Number(num(value).toFixed(2));

/** Only what has actually been committed for the period. */
export const EXPORTABLE_STATUSES = ["Closed", "Paid"];

export function payrollForPeriod(records: ExportPayroll[], period: string) {
  return records.filter((record) =>
    clean(record.period) === clean(period) && EXPORTABLE_STATUSES.includes(clean(record.status)));
}

type Row = { record: ExportPayroll; employee: ExportEmployee };

function joinRows(records: ExportPayroll[], employees: ExportEmployee[], period: string): Row[] {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  return payrollForPeriod(records, period)
    .map((record) => ({ record, employee: byId.get(clean(record.employeeId)) ?? { id: clean(record.employeeId) } }))
    .sort((a, b) => clean(a.employee.name).localeCompare(clean(b.employee.name)));
}

/** Names whoever is missing an identifier, so the gap is fixed before upload rather than after rejection. */
function missingIdentifier(rows: Row[], field: keyof ExportEmployee, label: string) {
  const affected = rows.filter((row) => !clean(row.employee[field])).map((row) => clean(row.employee.name) || row.employee.id);
  return affected.length ? [`${label} missing for ${affected.join(", ")}.`] : [];
}

function totalOf(rows: Row[], keys: (keyof ExportPayroll)[]) {
  return amount(rows.reduce((sum, row) => sum + keys.reduce((inner, key) => inner + num(row.record[key]), 0), 0));
}

/**
 * KWSP — EPF contributions for the month.
 *
 * Both shares on one line, plus their total, because that total is what the
 * payment must come to and it is the figure worth checking twice.
 */
export function epfExport(records: ExportPayroll[], employees: ExportEmployee[], period: string, employer: ExportEmployer = {}): StatutoryExport {
  const rows = joinRows(records, employees, period).filter((row) => num(row.record.epfEmployee) + num(row.record.epfEmployer) > 0);
  return {
    filename: `kwsp-${period}.csv`,
    headers: ["EPF Number", "Identification Number", "Name", "Wages", "Employee Share", "Employer Share", "Total"],
    rows: rows.map(({ record, employee }) => [
      clean(employee.epfNumber),
      clean(employee.identificationNumber),
      clean(employee.name),
      amount(record.grossPay),
      amount(record.epfEmployee),
      amount(record.epfEmployer),
      amount(num(record.epfEmployee) + num(record.epfEmployer)),
    ]),
    totals: ["", "", `${rows.length} member(s)`, totalOf(rows, ["grossPay"]), totalOf(rows, ["epfEmployee"]), totalOf(rows, ["epfEmployer"]), totalOf(rows, ["epfEmployee", "epfEmployer"])],
    warnings: [
      ...missingIdentifier(rows, "epfNumber", "EPF number"),
      ...(clean(employer.epfEmployerNumber) ? [] : ["The employer's EPF number is not recorded."]),
    ],
  };
}

/**
 * PERKESO — SOCSO and EIS together.
 *
 * One file, because ASSIST collects them together and splitting them would
 * mean reconciling two files against one payment.
 */
export function socsoExport(records: ExportPayroll[], employees: ExportEmployee[], period: string, employer: ExportEmployer = {}): StatutoryExport {
  const rows = joinRows(records, employees, period)
    .filter((row) => num(row.record.socsoEmployee) + num(row.record.socsoEmployer) + num(row.record.eisEmployee) + num(row.record.eisEmployer) > 0);
  return {
    filename: `perkeso-${period}.csv`,
    headers: ["Identification Number", "SOCSO Number", "Name", "Wages", "SOCSO Employee", "SOCSO Employer", "EIS Employee", "EIS Employer", "Total"],
    rows: rows.map(({ record, employee }) => [
      clean(employee.identificationNumber),
      clean(employee.socsoNumber),
      clean(employee.name),
      amount(record.grossPay),
      amount(record.socsoEmployee),
      amount(record.socsoEmployer),
      amount(record.eisEmployee),
      amount(record.eisEmployer),
      amount(num(record.socsoEmployee) + num(record.socsoEmployer) + num(record.eisEmployee) + num(record.eisEmployer)),
    ]),
    totals: [
      "", "", `${rows.length} member(s)`,
      totalOf(rows, ["grossPay"]),
      totalOf(rows, ["socsoEmployee"]), totalOf(rows, ["socsoEmployer"]),
      totalOf(rows, ["eisEmployee"]), totalOf(rows, ["eisEmployer"]),
      totalOf(rows, ["socsoEmployee", "socsoEmployer", "eisEmployee", "eisEmployer"]),
    ],
    warnings: [
      ...missingIdentifier(rows, "identificationNumber", "Identification number"),
      ...(clean(employer.socsoEmployerNumber) ? [] : ["The employer's SOCSO number is not recorded."]),
    ],
  };
}

/**
 * LHDN CP39 — monthly tax deductions.
 *
 * An employee with no PCB this month is left out entirely rather than sent as a
 * zero: CP39 is a return of tax deducted, and a nil line is not a deduction.
 */
export function cp39Export(records: ExportPayroll[], employees: ExportEmployee[], period: string, employer: ExportEmployer = {}): StatutoryExport {
  const rows = joinRows(records, employees, period).filter((row) => num(row.record.pcb) > 0);
  return {
    filename: `cp39-${period}.csv`,
    headers: ["Income Tax Number", "Identification Number", "Name", "Wages", "MTD Amount"],
    rows: rows.map(({ record, employee }) => [
      clean(employee.incomeTaxNumber),
      clean(employee.identificationNumber),
      clean(employee.name),
      amount(record.grossPay),
      amount(record.pcb),
    ]),
    totals: ["", "", `${rows.length} employee(s)`, totalOf(rows, ["grossPay"]), totalOf(rows, ["pcb"])],
    warnings: [
      ...missingIdentifier(rows, "incomeTaxNumber", "Income tax number"),
      ...(clean(employer.employerNumber) ? [] : ["The employer's E number is not recorded."]),
    ],
  };
}

/**
 * The bank payment file — net pay, per person.
 *
 * The one export where a wrong digit moves real money to a stranger, so an
 * employee without an account number is not written out as a blank row to be
 * filled in later. They are dropped and named in the warnings, because a
 * payment file that is quietly short one person is easier to miss than one that
 * says so.
 */
export function bankPaymentExport(records: ExportPayroll[], employees: ExportEmployee[], period: string, employer: ExportEmployer = {}): StatutoryExport {
  const all = joinRows(records, employees, period).filter((row) => num(row.record.netPay) > 0);
  const payable = all.filter((row) => clean(row.employee.bankAccountNumber));
  const unpayable = all.filter((row) => !clean(row.employee.bankAccountNumber));

  return {
    filename: `salary-payment-${period}.csv`,
    headers: ["Employee Number", "Name", "Bank", "Account Number", "Amount", "Reference"],
    rows: payable.map(({ record, employee }) => [
      clean(employee.employeeNumber),
      clean(employee.name),
      clean(employee.bankName),
      clean(employee.bankAccountNumber),
      amount(record.netPay),
      `SALARY ${clean(record.period)}`,
    ]),
    totals: ["", `${payable.length} payment(s)`, "", "", amount(payable.reduce((sum, row) => sum + num(row.record.netPay), 0)), ""],
    warnings: [
      ...(unpayable.length ? [`Left out of the file — no bank account on record: ${unpayable.map((row) => clean(row.employee.name) || row.employee.id).join(", ")}.`] : []),
      ...(clean(employer.bankAccountNumber) ? [] : ["The company's own paying account is not recorded."]),
    ],
  };
}

/** Escapes a cell so a name with a comma or a quote cannot shift every column after it. */
export function csvCell(value: string | number): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The finished file, totals row included. */
export function toCsv(file: StatutoryExport): string {
  return [file.headers, ...file.rows, file.totals]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

export type ExportKind = "kwsp" | "perkeso" | "cp39" | "bank";

export const EXPORT_LABELS: Record<ExportKind, { label: string; note: string }> = {
  kwsp: { label: "KWSP · EPF", note: "Employee and employer shares, and what the payment must total." },
  perkeso: { label: "PERKESO · SOCSO and EIS", note: "Both schemes together, the way ASSIST collects them." },
  cp39: { label: "LHDN · CP39", note: "Monthly tax deducted. Employees with no PCB are left out." },
  bank: { label: "Bank · salary payment", note: "Net pay per person. Anyone without an account is named, not blanked." },
};

export function buildExport(
  kind: ExportKind,
  records: ExportPayroll[],
  employees: ExportEmployee[],
  period: string,
  employer: ExportEmployer = {},
): StatutoryExport {
  if (kind === "kwsp") return epfExport(records, employees, period, employer);
  if (kind === "perkeso") return socsoExport(records, employees, period, employer);
  if (kind === "cp39") return cp39Export(records, employees, period, employer);
  return bankPaymentExport(records, employees, period, employer);
}

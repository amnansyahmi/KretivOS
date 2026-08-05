/**
 * A payslip as a printable document.
 *
 * "Print" on a payroll line called `window.print()`, which printed the browser
 * page — the sidebar, the search box, every other employee's row. Nobody could
 * hand that to anyone, so payslips were either not issued or rebuilt by hand in
 * a spreadsheet. Section 19 of the Employment Act expects an itemised statement
 * of wages and the records kept for six years, and a screenshot of a workbench
 * is not that.
 *
 * It reuses the `PrintModel` the sales documents already render through, rather
 * than growing a second renderer: the same geometry, the same print stylesheet,
 * and the same "Save as PDF" out of the browser's own dialogue. What changes is
 * only what fills it.
 *
 * Deliberately itemised. A single net figure is the one thing an employee
 * cannot check, and every question payroll gets asked — why is EPF that much,
 * where did the overtime go — is answered by a line rather than a total.
 *
 * Pure, so the arithmetic on the page can be asserted directly.
 */

import { money, templateDate, type PrintColumn, type PrintCompany, type PrintModel, type PrintTotalRow } from "./print-templates.ts";
import { statutoryOutstanding } from "./payroll-entries.ts";

export type PayslipRecord = {
  id?: string;
  employeeId?: string;
  period?: string;
  status?: string;
  paidAt?: string | null;
  basicSalary?: number;
  allowances?: number;
  overtime?: number;
  bonus?: number;
  grossPay?: number;
  epfEmployee?: number;
  socsoEmployee?: number;
  eisEmployee?: number;
  pcb?: number;
  otherDeductions?: number;
  totalDeductions?: number;
  netPay?: number;
  epfEmployer?: number;
  socsoEmployer?: number;
  eisEmployer?: number;
  overtimeBreakdown?: {
    hourlyRate?: number;
    normal?: { hours?: number; multiplier?: number };
    restDay?: { hours?: number; multiplier?: number };
    publicHoliday?: { hours?: number; multiplier?: number };
  } | null;
};

export type PayslipEmployee = {
  name?: string;
  employeeNumber?: string;
  title?: string;
  department?: string;
  identificationNumber?: string;
  epfNumber?: string;
  socsoNumber?: string;
  incomeTaxNumber?: string;
  bankName?: string;
  bankAccountNumber?: string;
};

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * A payroll line becomes a payslip when the period is closed.
 *
 * Until then it is a working figure: the statutory amounts are still being
 * checked, overtime may not have been approved yet, and reopening it is a
 * normal part of the month. Showing that to the person it is about invites the
 * one conversation nobody wants — an employee holding a number that changed
 * before it was paid, and no way to tell which one was real.
 *
 * HR and Finance still see drafts, because working on them is the job.
 */
export const ISSUED_PAYSLIP_STATUSES = ["Closed", "Paid"];

export function isIssuedPayslip(record: { status?: string }) {
  return ISSUED_PAYSLIP_STATUSES.includes(String(record?.status ?? "").trim());
}

const PAYSLIP_COLUMNS: PrintColumn[] = [
  { key: "no", label: "No", align: "left" },
  { key: "description", label: "Description", align: "left" },
  { key: "amount", label: "Amount (RM)", align: "right" },
];

/** "2026-08" as the month a person would say out loud. */
export function periodLabel(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period ?? "").trim());
  if (!match) return String(period ?? "");
  const [, year, month] = match;
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[Number(month) - 1] ?? month} ${year}`;
}

/**
 * Masks all but the last four digits of an account number.
 *
 * A payslip is forwarded, printed and left on desks. The employee needs to
 * recognise the account their pay went to, which the last four digits do; the
 * whole number on a document that travels is a liability with no upside.
 */
export function maskAccount(accountNumber: string): string {
  const digits = String(accountNumber ?? "").replace(/\s+/g, "");
  if (digits.length <= 4) return digits;
  return `${"•".repeat(Math.min(8, digits.length - 4))}${digits.slice(-4)}`;
}

/** A short account of how overtime was priced, when it was priced rather than typed. */
function overtimeNote(record: PayslipRecord): string {
  const breakdown = record.overtimeBreakdown;
  if (!breakdown || num(record.overtime) <= 0) return "";
  const parts = ([
    ["working day", breakdown.normal],
    ["rest day", breakdown.restDay],
    ["public holiday", breakdown.publicHoliday],
  ] as const)
    .filter(([, band]) => num(band?.hours) > 0)
    .map(([label, band]) => `${num(band?.hours)}h ${label} × ${num(band?.multiplier)}`);
  if (!parts.length) return "";
  return `Overtime: ${parts.join(", ")} at RM ${num(breakdown.hourlyRate).toFixed(2)} an hour.`;
}

export function payslipPrintModel({
  record,
  employee,
  company,
  issuedBy = "",
}: {
  record: PayslipRecord;
  employee: PayslipEmployee;
  company: PrintCompany;
  issuedBy?: string;
}): PrintModel {
  const earnings: [string, number][] = [
    ["Basic salary", num(record.basicSalary)],
    ["Allowances", num(record.allowances)],
    ["Overtime", num(record.overtime)],
    ["Bonus", num(record.bonus)],
  ];
  const deductions: [string, number][] = [
    ["EPF (employee)", num(record.epfEmployee)],
    ["SOCSO (employee)", num(record.socsoEmployee)],
    ["EIS (employee)", num(record.eisEmployee)],
    ["PCB / MTD", num(record.pcb)],
    ["Other deductions", num(record.otherDeductions)],
  ];

  // A zero line is noise on a payslip; a zero *total* is not, and stays below.
  const rows: string[][] = [];
  let index = 0;
  for (const [label, amount] of earnings) {
    if (amount <= 0) continue;
    index += 1;
    rows.push([String(index), label, money(amount)]);
  }
  for (const [label, amount] of deductions) {
    if (amount <= 0) continue;
    index += 1;
    // Bracketed rather than signed, the way a payslip reads.
    rows.push([String(index), label, `(${money(amount)})`]);
  }

  const gross = num(record.grossPay);
  const totalDeductions = num(record.totalDeductions);
  const totals: PrintTotalRow[] = [
    { label: "Gross pay", value: money(gross) },
    { label: "Total deductions", value: money(totalDeductions), parenthesised: true },
    { label: "Net pay", value: money(num(record.netPay)), bold: true },
  ];

  const employerCost = num(record.epfEmployer) + num(record.socsoEmployer) + num(record.eisEmployer);
  const notes = [
    `Employee: ${employee.name || "—"}${employee.employeeNumber ? ` · No. ${employee.employeeNumber}` : ""}${employee.title ? ` · ${employee.title}` : ""}`,
    [
      employee.identificationNumber ? `ID ${employee.identificationNumber}` : "",
      employee.epfNumber ? `EPF ${employee.epfNumber}` : "",
      employee.socsoNumber ? `SOCSO ${employee.socsoNumber}` : "",
      employee.incomeTaxNumber ? `Income tax ${employee.incomeTaxNumber}` : "",
    ].filter(Boolean).join(" · "),
    employee.bankAccountNumber ? `Paid to ${employee.bankName || "bank"} ${maskAccount(employee.bankAccountNumber)}.` : "",
    overtimeNote(record),
    /*
     * Stated because it is routinely misread. The employer's contributions are
     * a cost on top of gross pay, not a deduction from it, and an employee who
     * sees "EPF 12%" without that sentence reasonably concludes it came out of
     * their money.
     */
    employerCost > 0
      ? `Employer contributions this month — EPF ${money(num(record.epfEmployer))}, SOCSO ${money(num(record.socsoEmployer))}, EIS ${money(num(record.eisEmployer))}. These are paid by the company in addition to gross pay and are not deducted from it.`
      : "",
    statutoryOutstanding(record as any) > 0
      ? "Statutory deductions are remitted to KWSP, PERKESO and LHDN on your behalf."
      : "",
  ].filter(Boolean);

  return {
    heading: "PAYSLIP",
    company,
    meta: [
      { label: "Period", value: periodLabel(String(record.period ?? "")) },
      { label: "Status", value: String(record.status ?? "Draft") },
      { label: "Payment date", value: record.paidAt ? templateDate(String(record.paidAt).slice(0, 10)) : "—" },
    ],
    customerName: employee.name || "Team member",
    customerAddressLines: [employee.department || "", employee.title || ""].filter(Boolean),
    title: `Statement of wages · ${periodLabel(String(record.period ?? ""))}`,
    columns: PAYSLIP_COLUMNS,
    rows,
    totals,
    notes,
    closingLine: "This is a computer-generated statement of wages.",
    // A payslip is issued, not agreed, so the acceptance half of the signature
    // pair would be inviting a signature nobody is asking for.
    signatures: issuedBy ? { issuedBy, acceptedBy: "" } : null,
  };
}

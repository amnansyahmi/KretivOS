/**
 * Journal entries for payroll.
 *
 * Staff cost is almost certainly the largest expense a small agency has, and
 * none of it reached the ledger: HR payroll wrote into its own state blob and
 * stopped there. The profit and loss was understating costs by the entire wage
 * bill, and EPF, SOCSO, EIS and PCB liabilities did not exist in the accounts at
 * all — money owed to the government with nothing on the balance sheet saying so.
 *
 * Two entries, because they happen at different moments and to different
 * counterparties:
 *
 *   Closing payroll recognises the cost and what is now owed.
 *   Paying it clears only the employee's share; the statutory portion stays a
 *   liability until it is actually remitted, which is usually a different date.
 *
 * Pure and free of database imports so both entries can be asserted directly.
 */

import { toCents } from "./accounting-math.ts";

export type PayrollRecord = {
  id: string;
  employeeId: string;
  period: string;
  grossPay: number;
  netPay: number;
  totalDeductions: number;
  epfEmployee: number;
  socsoEmployee: number;
  eisEmployee: number;
  pcb: number;
  otherDeductions: number;
  epfEmployer: number;
  socsoEmployer: number;
  eisEmployer: number;
};

export type PayrollLine = {
  accountKey?: string;
  accountId?: string;
  debit?: number;
  credit?: number;
  memo?: string;
};

export type PayrollEntry = {
  date: string;
  reference: string;
  memo: string;
  sourceType: string;
  sourceId: string;
  createdBy?: string | null;
  lines: PayrollLine[];
};

const num = (value: unknown) => Number(value) || 0;

/** Employer contributions are a cost on top of gross pay, not a deduction from it. */
export function employerCost(record: PayrollRecord) {
  return num(record.epfEmployer) + num(record.socsoEmployer) + num(record.eisEmployer);
}

/**
 * Closing payroll: recognise the cost, and what is now owed.
 *
 * Gross pay is the expense, not net — the deductions are the employee's money
 * that the company is holding on their behalf and passing to EPF, SOCSO and
 * LHDN. Posting net would understate both the wage bill and the liability.
 *
 * The whole of gross plus employer contributions lands in payroll liabilities,
 * because on the day payroll closes none of it has actually left the bank.
 */
export function payrollAccrualEntry(
  record: PayrollRecord,
  employeeName: string,
  { date, createdBy = null }: { date: string; createdBy?: string | null },
): PayrollEntry {
  const employer = employerCost(record);
  const who = `${employeeName} ${record.period}`.trim();
  const lines: PayrollLine[] = [
    { accountKey: "salaries", debit: record.grossPay, memo: who },
  ];

  if (toCents(employer) > 0) {
    lines.push({ accountKey: "employer_statutory", debit: employer, memo: `Employer EPF, SOCSO and EIS · ${employeeName}` });
  }

  // What is owed is split by who it is owed to. A single payroll liability
  // cannot answer "how much EPF do we owe this month", which is the question
  // actually asked when the remittance falls due.
  const owed: [string, number, string][] = [
    ["payroll_liability", record.netPay, `Net pay · ${employeeName}`],
    ["epf_payable", num(record.epfEmployee) + num(record.epfEmployer), `EPF · ${employeeName}`],
    ["socso_payable",
      num(record.socsoEmployee) + num(record.eisEmployee) + num(record.socsoEmployer) + num(record.eisEmployer),
      `SOCSO and EIS · ${employeeName}`],
    ["pcb_payable", num(record.pcb), `PCB · ${employeeName}`],
    // Anything else withheld stays with the employee liability; it is usually
    // owed back to the company rather than to a statutory body.
    ["payroll_liability", num(record.otherDeductions), `Other deductions · ${employeeName}`],
  ];

  for (const [accountKey, amount, memo] of owed) {
    if (toCents(amount) > 0) lines.push({ accountKey, credit: amount, memo });
  }

  return {
    date,
    reference: `PAY-${record.period}`,
    memo: `Payroll ${record.period} · ${employeeName}`,
    sourceType: "payroll",
    sourceId: record.id,
    createdBy,
    lines,
  };
}

/**
 * Paying payroll: only the employee's net pay leaves the bank.
 *
 * Statutory deductions and employer contributions stay in the liability until
 * they are remitted, which happens on a different date and to a different
 * recipient. Clearing the whole liability here would say the government had been
 * paid when it had not.
 */
export function payrollPaymentEntry(
  record: PayrollRecord,
  employeeName: string,
  { date, bankAccountId, createdBy = null }: { date: string; bankAccountId: string; createdBy?: string | null },
): PayrollEntry {
  return {
    date,
    reference: `PAY-${record.period}`,
    memo: `Net pay ${record.period} · ${employeeName}`,
    sourceType: "payroll_payment",
    sourceId: record.id,
    createdBy,
    lines: [
      { accountKey: "payroll_liability", debit: record.netPay, memo: `Net pay · ${employeeName}` },
      { accountId: bankAccountId, credit: record.netPay },
    ],
  };
}

/**
 * What is still owed after paying net pay: the employee's deductions plus the
 * employer's own contributions, both waiting to be remitted.
 */
export function statutoryOutstanding(record: PayrollRecord) {
  return Number((num(record.totalDeductions) + employerCost(record)).toFixed(2));
}

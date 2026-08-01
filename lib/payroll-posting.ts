/**
 * Posts payroll to the ledger.
 *
 * The payroll records stay in the HR state blob, where they are role-gated and
 * employee-facing. Only the money comes here.
 *
 * Both entries are idempotent on ids recorded against the payroll record, and
 * neither throws: closing or paying payroll must not fail because accounting is
 * unavailable or the period is closed. A failure leaves the payroll unposted and
 * retryable, and is reported back to the caller.
 */

import { AccountingError, prepareEntry } from "@/lib/accounting";
import { toCents } from "@/lib/accounting-math";
import { payrollAccrualEntry, payrollPaymentEntry, type PayrollRecord } from "@/lib/payroll-entries";
import { getDatabase } from "@/lib/db";

const ORGANIZATION_ID = "org-kretivco";

export type PayrollPostingOutcome =
  | { status: "posted"; entryId: string; total: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

const num = (value: unknown) => Number(value) || 0;

/** Normalises a stored payroll row into the shape the entry builders expect. */
export function toPayrollRecord(row: any): PayrollRecord {
  return {
    id: String(row?.id ?? ""),
    employeeId: String(row?.employeeId ?? ""),
    period: String(row?.period ?? ""),
    grossPay: num(row?.grossPay),
    netPay: num(row?.netPay),
    totalDeductions: num(row?.totalDeductions),
    epfEmployee: num(row?.epfEmployee),
    socsoEmployee: num(row?.socsoEmployee),
    eisEmployee: num(row?.eisEmployee),
    pcb: num(row?.pcb),
    otherDeductions: num(row?.otherDeductions),
    epfEmployer: num(row?.epfEmployer),
    socsoEmployer: num(row?.socsoEmployer),
    eisEmployer: num(row?.eisEmployer),
  };
}

/**
 * The last day of the payroll month, so the cost lands in the period it was
 * earned rather than the day someone happened to press Close.
 */
function periodEndDate(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return new Date().toISOString().slice(0, 10);
  const [, year, month] = match;
  return new Date(Date.UTC(Number(year), Number(month), 0)).toISOString().slice(0, 10);
}

async function defaultBankAccount(sql: any) {
  const rows = await sql`
    select id from ledger_accounts
    where organization_id = ${ORGANIZATION_ID} and is_bank and is_active
    order by (system_key = 'bank') desc, code
    limit 1
  `;
  return rows[0]?.id ?? "";
}

function failureReason(error: unknown, context: string) {
  const reason = error instanceof AccountingError
    ? error.message
    : error instanceof Error ? error.message : "Unable to post payroll.";
  // A missing ledger simply means accounting is not set up on this deployment,
  // which is not worth logging as an error on every payroll action.
  if (!/ledger_accounts|journal_|system_key|employer_statutory|epf_payable|socso_payable|pcb_payable/i.test(reason)) {
    console.error(context, reason);
  }
  return reason;
}

/**
 * Closing payroll: recognises the wage cost and what is now owed.
 *
 * `employeeName` is passed in rather than looked up because the caller already
 * holds the HR snapshot, and payroll must not depend on a second read of
 * employee data it may not be permitted to make.
 */
export async function postPayrollAccrual(
  record: PayrollRecord,
  employeeName: string,
  { createdBy = null }: { createdBy?: string | null } = {},
): Promise<PayrollPostingOutcome> {
  try {
    if (toCents(record.grossPay) <= 0) return { status: "skipped", reason: "Payroll has no gross pay." };

    const sql = getDatabase();
    const entry = await prepareEntry(
      payrollAccrualEntry(record, employeeName, { date: periodEndDate(record.period), createdBy }),
      { sql },
    );
    await sql.transaction(entry.statements);
    return { status: "posted", entryId: entry.id, total: entry.total };
  } catch (error) {
    return { status: "failed", reason: failureReason(error, "Payroll accrual posting failed") };
  }
}

/** Paying payroll: only the employee's net pay leaves the bank. */
export async function postPayrollPayment(
  record: PayrollRecord,
  employeeName: string,
  { createdBy = null, bankAccountId = "", date }: { createdBy?: string | null; bankAccountId?: string; date?: string } = {},
): Promise<PayrollPostingOutcome> {
  try {
    if (toCents(record.netPay) <= 0) return { status: "skipped", reason: "Payroll has no net pay." };

    const sql = getDatabase();
    const account = bankAccountId || (await defaultBankAccount(sql));
    if (!account) return { status: "skipped", reason: "No bank account is set up to pay from." };

    const entry = await prepareEntry(
      payrollPaymentEntry(record, employeeName, {
        date: date || new Date().toISOString().slice(0, 10),
        bankAccountId: account,
        createdBy,
      }),
      { sql },
    );
    await sql.transaction(entry.statements);
    return { status: "posted", entryId: entry.id, total: entry.total };
  } catch (error) {
    return { status: "failed", reason: failureReason(error, "Payroll payment posting failed") };
  }
}

/** True when an entry already exists for this payroll record and stage. */
export async function payrollAlreadyPosted(payrollId: string, sourceType: "payroll" | "payroll_payment") {
  try {
    const sql = getDatabase();
    const rows = await sql`
      select id from journal_entries
      where organization_id = ${ORGANIZATION_ID}
        and source_type = ${sourceType} and source_id = ${payrollId}
        and status = 'Posted'
      limit 1
    `;
    return rows.length > 0;
  } catch {
    // If the ledger cannot be read, treat it as unposted: the posting attempt
    // will fail safely rather than a duplicate being written on a later retry.
    return false;
  }
}

/**
 * Payroll the ledger cannot see.
 *
 * Closed or paid payroll with no matching journal entry is real staff cost
 * missing from the profit and loss, which is the largest way these accounts can
 * be wrong.
 */
export async function unpostedPayrollCount(records: any[]) {
  const candidates = (Array.isArray(records) ? records : [])
    .filter((row) => ["Closed", "Paid"].includes(String(row?.status)) && num(row?.grossPay) > 0);
  if (!candidates.length) return { count: 0, value: 0 };

  try {
    const sql = getDatabase();
    const rows = await sql`
      select source_id from journal_entries
      where organization_id = ${ORGANIZATION_ID}
        and source_type = 'payroll' and status = 'Posted'
        and source_id = any(${candidates.map((row) => String(row.id))})
    `;
    const posted = new Set(rows.map((row: any) => String(row.source_id)));
    const missing = candidates.filter((row) => !posted.has(String(row.id)));
    return {
      count: missing.length,
      value: Number(missing.reduce((sum, row) => sum + num(row.grossPay), 0).toFixed(2)),
    };
  } catch {
    return { count: 0, value: 0 };
  }
}

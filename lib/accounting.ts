/**
 * Double-entry posting engine.
 *
 * Everything that moves money writes through `postEntry`. Nothing else should
 * insert into `journal_entries` or `journal_lines` directly, because this is
 * where the invariants live:
 *
 *   - debits equal credits, to the cent, using integer arithmetic
 *   - every line is one-sided
 *   - accounts exist and belong to this organisation
 *   - the target period is open
 *   - the entry and all of its lines commit together
 *
 * The database enforces the same rules (see 0008_accounting_core.sql). That
 * duplication is deliberate: an application check does not survive someone
 * fixing data by hand, and an unbalanced entry silently corrupts every report
 * derived from the journal.
 */

import { getDatabase } from "@/lib/db";
import {
  checkBalance, describeProblem, fromCents, signedBalance, toCents,
  type AccountType,
} from "@/lib/accounting-math";

const ORGANIZATION_ID = "org-kretivco";

export type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  isBank: boolean;
  systemKey: string;
  currency: string;
  isActive: boolean;
};

/** One side of an entry. Supply `debit` or `credit`, never both. */
export type JournalLineInput = {
  accountId?: string;
  /** Resolved via `system_key`, for postings the code makes by role. */
  accountKey?: string;
  debit?: number;
  credit?: number;
  memo?: string;
  customerId?: string | null;
  vendorId?: string | null;
  projectId?: string | null;
  taxCode?: string;
};

export type JournalEntryInput = {
  date: string;
  memo?: string;
  reference?: string;
  sourceType?: string;
  sourceId?: string | null;
  lines: JournalLineInput[];
  currency?: string;
  exchangeRate?: number;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
};

export { toCents, fromCents, signedBalance };
export type { AccountType };

export class AccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountingError";
  }
}

const isDateString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export async function listAccounts(): Promise<LedgerAccount[]> {
  const sql = getDatabase();
  const rows = await sql`
    select id, code, name, type, subtype, is_bank, coalesce(system_key, '') as system_key,
           currency, is_active
    from ledger_accounts
    where organization_id = ${ORGANIZATION_ID}
    order by code
  `;
  return rows.map((row: any) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    subtype: row.subtype,
    isBank: row.is_bank,
    systemKey: row.system_key,
    currency: row.currency,
    isActive: row.is_active,
  }));
}

/**
 * Resolves the accounts an entry refers to, by id or by system key, in one
 * query rather than one per line.
 */
async function resolveAccounts(lines: JournalLineInput[]) {
  const ids = Array.from(new Set(lines.map((line) => line.accountId).filter(Boolean))) as string[];
  const keys = Array.from(new Set(lines.map((line) => line.accountKey).filter(Boolean))) as string[];
  if (!ids.length && !keys.length) throw new AccountingError("Every journal line needs an account.");

  const sql = getDatabase();
  const rows = await sql`
    select id, code, name, coalesce(system_key, '') as system_key, is_active
    from ledger_accounts
    where organization_id = ${ORGANIZATION_ID}
      and (id = any(${ids.length ? ids : [""]}) or system_key = any(${keys.length ? keys : [""]}))
  `;

  const byId = new Map(rows.map((row: any) => [row.id, row]));
  const byKey = new Map(rows.filter((row: any) => row.system_key).map((row: any) => [row.system_key, row]));

  return lines.map((line, index) => {
    const account = line.accountId ? byId.get(line.accountId) : line.accountKey ? byKey.get(line.accountKey) : undefined;
    if (!account) {
      throw new AccountingError(
        `Line ${index + 1} refers to an account that does not exist (${line.accountId || line.accountKey}).`,
      );
    }
    if (!account.is_active) throw new AccountingError(`Account ${account.code} ${account.name} is archived.`);
    return account;
  });
}

/** Rejects an entry before it reaches the database, with a message worth reading. */
function validate(input: JournalEntryInput) {
  if (!isDateString(input.date)) throw new AccountingError("A journal entry needs a valid YYYY-MM-DD date.");

  const result = checkBalance(input.lines);
  if (!result.ok) throw new AccountingError(describeProblem(result.problem));
  return { debitCents: result.totalCents };
}

async function assertPeriodOpen(date: string) {
  const [year, month] = date.split("-").map(Number);
  const sql = getDatabase();
  const rows = await sql`
    select status from fiscal_periods
    where organization_id = ${ORGANIZATION_ID} and year = ${year} and month = ${month}
  `;
  // An unknown period is treated as open: periods are seeded for a rolling
  // window, and a genuinely old date should not be silently rejected here when
  // the operator can see and open the period.
  if (rows[0]?.status === "Closed") {
    throw new AccountingError(`Accounting period ${year}-${String(month).padStart(2, "0")} is closed.`);
  }
}

export type PostedEntry = { id: string; date: string; total: number };

/**
 * Writes a balanced entry and its lines in a single transaction.
 *
 * The balance trigger is deferred to commit time, so the entry and every line
 * must land in one transaction — inserting them across separate round trips
 * would trip the constraint on the first line.
 */
export async function postEntry(input: JournalEntryInput): Promise<PostedEntry> {
  const { debitCents } = validate(input);
  await assertPeriodOpen(input.date);
  const accounts = await resolveAccounts(input.lines);

  const sql = getDatabase();
  const entryId = crypto.randomUUID();

  const statements: any[] = [
    sql`
      insert into journal_entries (
        id, organization_id, entry_date, reference, memo, source_type, source_id,
        status, currency, exchange_rate, created_by, posted_at, metadata
      ) values (
        ${entryId}, ${ORGANIZATION_ID}, ${input.date}, ${input.reference ?? ""}, ${input.memo ?? ""},
        ${input.sourceType ?? "manual"}, ${input.sourceId ?? null}, 'Posted',
        ${input.currency ?? "MYR"}, ${input.exchangeRate ?? 1}, ${input.createdBy ?? null}, now(),
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
    `,
  ];

  input.lines.forEach((line, index) => {
    statements.push(sql`
      insert into journal_lines (
        entry_id, account_id, debit, credit, memo,
        customer_id, vendor_id, project_id, tax_code, line_order
      ) values (
        ${entryId}, ${accounts[index].id},
        ${fromCents(toCents(line.debit))}, ${fromCents(toCents(line.credit))},
        ${line.memo ?? ""}, ${line.customerId ?? null}, ${line.vendorId ?? null},
        ${line.projectId ?? null}, ${line.taxCode ?? ""}, ${index}
      )
    `);
  });

  await sql.transaction(statements);
  return { id: entryId, date: input.date, total: fromCents(debitCents) };
}

/**
 * Reverses an entry by posting its mirror image rather than deleting it.
 *
 * A posted entry is a historical assertion. Deleting it would erase the fact
 * that it was ever made, which is exactly what an audit trail exists to prevent,
 * so the correction is itself a posting.
 */
export async function voidEntry(entryId: string, { date, memo, createdBy }: { date?: string; memo?: string; createdBy?: string | null } = {}) {
  const sql = getDatabase();
  const entries = await sql`
    select * from journal_entries
    where id = ${entryId} and organization_id = ${ORGANIZATION_ID} and status = 'Posted'
  `;
  if (!entries.length) throw new AccountingError("Posted journal entry was not found.");

  const lines = await sql`select * from journal_lines where entry_id = ${entryId} order by line_order`;
  if (!lines.length) throw new AccountingError("Journal entry has no lines to reverse.");

  const original = entries[0];
  const reversalDate = date && isDateString(date) ? date : String(original.entry_date).slice(0, 10);
  await assertPeriodOpen(reversalDate);

  const reversalId = crypto.randomUUID();
  const statements: any[] = [
    sql`
      insert into journal_entries (
        id, organization_id, entry_date, reference, memo, source_type, source_id,
        status, reverses_entry_id, currency, exchange_rate, created_by, posted_at, metadata
      ) values (
        ${reversalId}, ${ORGANIZATION_ID}, ${reversalDate}, ${original.reference},
        ${memo || `Reversal of ${original.reference || entryId}`},
        ${original.source_type}, ${original.source_id}, 'Posted', ${entryId},
        ${original.currency}, ${original.exchange_rate}, ${createdBy ?? null}, now(),
        ${JSON.stringify({ reversalOf: entryId })}::jsonb
      )
    `,
  ];

  lines.forEach((line: any, index: number) => {
    // Debits become credits and vice versa; the pair nets to zero.
    statements.push(sql`
      insert into journal_lines (
        entry_id, account_id, debit, credit, memo,
        customer_id, vendor_id, project_id, tax_code, line_order
      ) values (
        ${reversalId}, ${line.account_id}, ${line.credit}, ${line.debit},
        ${`Reversal: ${line.memo || ""}`.trim()}, ${line.customer_id}, ${line.vendor_id},
        ${line.project_id}, ${line.tax_code}, ${index}
      )
    `);
  });

  statements.push(sql`update journal_entries set status = 'Void' where id = ${entryId}`);
  await sql.transaction(statements);
  return { id: reversalId, reversed: entryId };
}

export type AccountBalance = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  debit: number;
  credit: number;
  /** Positive means "more of what this account normally holds". */
  balance: number;
};

/** Trial balance over a date window; the basis for every other report. */
export async function accountBalances({ from, to }: { from?: string; to?: string } = {}): Promise<AccountBalance[]> {
  const sql = getDatabase();
  const rows = await sql`
    select a.id, a.code, a.name, a.type, a.subtype,
           coalesce(sum(l.debit), 0) as debit,
           coalesce(sum(l.credit), 0) as credit
    from ledger_accounts a
    left join journal_lines l on l.account_id = a.id
    left join journal_entries e on e.id = l.entry_id and e.status = 'Posted'
      and (${from ?? null}::date is null or e.entry_date >= ${from ?? null}::date)
      and (${to ?? null}::date is null or e.entry_date <= ${to ?? null}::date)
    where a.organization_id = ${ORGANIZATION_ID}
      and (l.id is null or e.id is not null)
    group by a.id, a.code, a.name, a.type, a.subtype
    order by a.code
  `;

  return rows.map((row: any) => {
    const debit = toCents(row.debit);
    const credit = toCents(row.credit);
    return {
      accountId: row.id,
      code: row.code,
      name: row.name,
      type: row.type as AccountType,
      subtype: row.subtype,
      debit: fromCents(debit),
      credit: fromCents(credit),
      balance: fromCents(signedBalance(row.type as AccountType, debit, credit)),
    };
  });
}

/**
 * Confirms the whole ledger balances. Should always be zero; a non-zero result
 * means something wrote to the journal without going through `postEntry`.
 */
export async function trialBalanceCheck({ to }: { to?: string } = {}) {
  const balances = await accountBalances({ to });
  const debit = balances.reduce((sum, row) => sum + toCents(row.debit), 0);
  const credit = balances.reduce((sum, row) => sum + toCents(row.credit), 0);
  return { debit: fromCents(debit), credit: fromCents(credit), balanced: debit === credit, difference: fromCents(debit - credit) };
}

/**
 * Posts direct cash movements and settlements to the ledger.
 *
 * These are the two record types that lived only in `finance_transactions` — a
 * flat cash log with a free-text category, no bank account and no double entry.
 * A cash movement now names the account the money came from or went to, and the
 * income or expense account it belongs to, so it can be reconciled and reported
 * like everything else.
 *
 * "Direct" means not against an invoice or a bill: bank charges, interest, a
 * cash sale, owner drawings, a petty-cash purchase. Anything with a counterparty
 * document should go through that document instead, so the receivable or payable
 * clears properly.
 */

import { AccountingError, prepareEntry } from "@/lib/accounting";
import { toCents } from "@/lib/accounting-math";
import { getDatabase } from "@/lib/db";
import { cashEntryLines, type CashDirection, type CashEntryInput } from "@/lib/cash-posting-lines";

export { cashEntryLines };
export type { CashDirection, CashEntryInput };

const ORGANIZATION_ID = "org-kretivco";

export type PostingOutcome =
  | { status: "posted"; entryId: string; total: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/** Posts a direct cash movement and records it in the cash log for continuity. */
export async function postCashEntry(input: CashEntryInput): Promise<{ entryId: string; transactionId: string }> {
  if (toCents(input.amount) <= 0) throw new AccountingError("A cash entry must be for more than zero.");
  if (!input.bankAccountId) throw new AccountingError("Choose the bank or cash account the money moved through.");
  if (!input.ledgerAccountId) throw new AccountingError("Choose the account this belongs to.");

  const sql = getDatabase();
  const transactionId = crypto.randomUUID();

  const entry = await prepareEntry({
    date: input.date,
    reference: input.reference ?? "",
    memo: input.memo || (input.direction === "in" ? "Cash received" : "Cash paid"),
    sourceType: "cash",
    sourceId: transactionId,
    createdBy: input.createdBy ?? null,
    lines: cashEntryLines(input),
  }, { sql });

  // The cash log row is kept so the Transactions list reads the same before and
  // after the ledger existed. It is a projection of the entry, not a rival to it.
  await sql.transaction([
    ...entry.statements,
    sql`
      insert into finance_transactions (
        id, customer_id, type, category, amount, transaction_date, status, reference, notes,
        source_type, source_id, journal_entry_id, bank_account_id, ledger_account_id
      )
      select ${transactionId}, ${input.customerId ?? null},
        ${input.direction === "in" ? "Income" : "Expense"},
        coalesce((select name from ledger_accounts where id = ${input.ledgerAccountId}), 'Uncategorised'),
        ${input.amount}, ${input.date}, 'Cleared', ${input.reference ?? ""}, ${input.memo ?? ""},
        'cash', ${transactionId}, ${entry.id}, ${input.bankAccountId}, ${input.ledgerAccountId}
    `,
  ]);

  return { entryId: entry.id, transactionId };
}

/**
 * Posts a settlement payment.
 *
 * A settlement is Kretivco's own income under the client MoU — a per-unit fee
 * plus incentive and advertising reimbursement — so paying one is a cash receipt
 * against settlement income, not a receivable being cleared. It never became a
 * sales document, which is why it needs its own posting path.
 *
 * Never throws: marking a settlement paid must not fail because accounting is
 * unavailable. Idempotent on `settlements.journal_entry_id`.
 */
export async function postSettlementPayment(
  settlementId: string,
  { createdBy = null, bankAccountId = "" }: { createdBy?: string | null; bankAccountId?: string } = {},
): Promise<PostingOutcome> {
  try {
    const sql = getDatabase();
    const rows = await sql`
      select s.*, c.name as customer_name
      from settlements s join customers c on c.id = s.customer_id
      where s.id = ${settlementId} and c.organization_id = ${ORGANIZATION_ID}
    `;
    if (!rows.length) return { status: "skipped", reason: "Settlement was not found." };

    const row = rows[0];
    if (row.journal_entry_id) return { status: "skipped", reason: "Already posted." };

    const total = Number(row.units) * Number(row.fee_per_unit)
      + Number(row.ad_reimbursement) + Number(row.incentive);
    if (toCents(total) <= 0) return { status: "skipped", reason: "Settlement has no value." };

    const account = bankAccountId || (await sql`
      select id from ledger_accounts
      where organization_id = ${ORGANIZATION_ID} and is_bank and is_active
      order by (system_key = 'bank') desc, code
      limit 1
    `)[0]?.id;
    if (!account) return { status: "skipped", reason: "No bank account is set up to receive the payment." };

    const entry = await prepareEntry({
      date: new Date().toISOString().slice(0, 10),
      reference: `SET-${String(row.period_end).slice(0, 10)}`,
      memo: `Settlement from ${row.customer_name}`,
      sourceType: "settlement",
      sourceId: settlementId,
      createdBy,
      lines: [
        { accountId: account, debit: total },
        { accountKey: "settlement_income", credit: total, customerId: row.customer_id },
      ],
    }, { sql });

    await sql.transaction([
      ...entry.statements,
      sql`
        update settlements set journal_entry_id = ${entry.id}, bank_account_id = ${account}
        where id = ${settlementId} and journal_entry_id is null
      `,
    ]);

    return { status: "posted", entryId: entry.id, total };
  } catch (error) {
    const reason = error instanceof AccountingError
      ? error.message
      : error instanceof Error ? error.message : "Unable to post the settlement.";
    if (!/ledger_accounts|journal_|settlements\.journal_entry_id|column .*journal_entry_id/i.test(reason)) {
      console.error("Settlement posting failed", settlementId, reason);
    }
    return { status: "failed", reason };
  }
}

export type CashBackfillResult = { posted: number; skipped: number; failed: { id: string; reason: string }[]; total: number };

/** Posts settlements marked paid before the ledger existed. */
export async function backfillSettlements({ createdBy = null, limit = 500 }: { createdBy?: string | null; limit?: number } = {}): Promise<CashBackfillResult> {
  const sql = getDatabase();
  const rows = await sql`
    select s.id from settlements s join customers c on c.id = s.customer_id
    where c.organization_id = ${ORGANIZATION_ID}
      and s.status = 'Paid' and s.journal_entry_id is null
    order by s.period_end
    limit ${limit}
  `;

  const result: CashBackfillResult = { posted: 0, skipped: 0, failed: [], total: rows.length };
  for (const row of rows) {
    const outcome = await postSettlementPayment(String(row.id), { createdBy });
    if (outcome.status === "posted") result.posted += 1;
    else if (outcome.status === "skipped") result.skipped += 1;
    else result.failed.push({ id: String(row.id), reason: outcome.reason });
  }
  return result;
}

/**
 * Cash-log rows written before the ledger existed, or by a path that has not
 * been migrated. These hold real money the ledger cannot see.
 */
export async function unreconciledCashCount() {
  try {
    const sql = getDatabase();
    const rows = await sql`
      select count(*)::int as count,
        coalesce(sum(case when type = 'Income' then amount else -amount end), 0) as net
      from finance_transactions f
      left join customers c on c.id = f.customer_id
      where (f.customer_id is null or c.organization_id = ${ORGANIZATION_ID})
        and f.journal_entry_id is null
        -- Rows created from a paid invoice or settlement are already on the
        -- ledger through that document, so they are not missing, just duplicated
        -- history. Only genuinely standalone cash rows need posting.
        and coalesce(f.source_type, '') not in ('sales_document', 'settlement')
    `;
    return { count: Number(rows[0]?.count || 0), net: Number(rows[0]?.net || 0) };
  } catch {
    return { count: 0, net: 0 };
  }
}

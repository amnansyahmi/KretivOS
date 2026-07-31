/**
 * Posts customer invoices to the ledger.
 *
 * Revenue is recognised when an invoice is issued, not when it is paid — a
 * receipt afterwards only moves the amount from receivables to the bank.
 *
 * Posting is idempotent on `sales_documents.journal_entry_id`, because this is
 * called from the sales-document write path and that path runs on every edit. An
 * invoice that is already posted is left alone rather than posted twice.
 */

import { AccountingError, prepareEntry } from "@/lib/accounting";
import { invoiceAmounts, isIssuedInvoice, salesInvoiceEntryInput } from "@/lib/accounting-entries";
import { computeTotals, type LineItem } from "@/lib/line-items";
import { getDatabase } from "@/lib/db";

const ORGANIZATION_ID = "org-kretivco";

export type InvoicePostingOutcome =
  | { status: "posted"; entryId: string; total: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/**
 * Reads the amounts off a stored sales document.
 *
 * A document with a structured line-item table carries its own discount and tax
 * settings; one without has only a header value. `invoiceAmounts` reconciles
 * either into a net/tax/total triple that adds up exactly.
 */
function amountsFor(row: any) {
  const content = row.content && typeof row.content === "object" ? row.content : {};
  const items: LineItem[] = Array.isArray(content.lineItems) ? content.lineItems : [];

  if (!items.length) return invoiceAmounts({ value: Number(row.value), lineItemTotals: null });

  const totals = computeTotals(items, {
    currency: String(content.currency || "RM"),
    taxLabel: String(content.taxLabel || "SST"),
    taxRate: Number(content.taxRate) || 0,
    discountPercent: Number(content.discountPercent) || 0,
  });
  return invoiceAmounts({ value: Number(row.value), lineItemTotals: totals });
}

/**
 * Prepares the statements that post one invoice, for folding into a caller's
 * transaction. Returns null when there is nothing to post.
 */
export async function prepareInvoicePosting(
  documentId: string,
  { sql = getDatabase(), createdBy = null }: { sql?: any; createdBy?: string | null } = {},
): Promise<{ statements: any[]; entryId: string; total: number } | null> {
  const rows = await sql`
    select d.*, c.name as customer_name, c.organization_id
    from sales_documents d join customers c on c.id = d.customer_id
    where d.id = ${documentId} and c.organization_id = ${ORGANIZATION_ID}
  `;
  if (!rows.length) return null;

  const row = rows[0];
  if (!isIssuedInvoice(String(row.type), String(row.status))) return null;
  // Already on the ledger. This is the common case on an ordinary edit.
  if (row.journal_entry_id) return null;

  const amounts = amountsFor(row);
  if (!amounts.total) return null;

  const issueDate = row.issue_date
    ? String(row.issue_date).slice(0, 10)
    : String(row.created_at ?? new Date().toISOString()).slice(0, 10);

  const entry = await prepareEntry(
    salesInvoiceEntryInput(
      {
        id: row.id,
        customerId: row.customer_id,
        issueDate,
        reference: row.reference || "",
        title: row.title || "",
        netAmount: amounts.netAmount,
        taxAmount: amounts.taxAmount,
        total: amounts.total,
        incomeAccountId: row.income_account_id || null,
      },
      row.customer_name || "Customer",
      createdBy,
    ),
    { sql },
  );

  return {
    entryId: entry.id,
    total: entry.total,
    statements: [
      ...entry.statements,
      sql`
        update sales_documents set journal_entry_id = ${entry.id}
        where id = ${documentId} and journal_entry_id is null
      `,
    ],
  };
}

/**
 * Posts one invoice in its own transaction.
 *
 * Never throws: this runs inside the sales-document write path, and a ledger
 * problem must not stop someone recording an invoice. The failure is returned so
 * the caller can surface it, and the invoice stays unposted and retryable rather
 * than half-posted.
 */
export async function postSalesInvoice(
  documentId: string,
  { createdBy = null }: { createdBy?: string | null } = {},
): Promise<InvoicePostingOutcome> {
  try {
    const sql = getDatabase();
    const prepared = await prepareInvoicePosting(documentId, { sql, createdBy });
    if (!prepared) return { status: "skipped", reason: "Not an unposted issued invoice." };

    await sql.transaction(prepared.statements);
    return { status: "posted", entryId: prepared.entryId, total: prepared.total };
  } catch (error) {
    const reason = error instanceof AccountingError
      ? error.message
      : error instanceof Error ? error.message : "Unable to post the invoice.";
    // A missing ledger table simply means accounting is not set up on this
    // deployment, which is not worth logging as an error on every write.
    if (!/ledger_accounts|journal_entries|journal_lines|sales_documents\.journal_entry_id|column .*journal_entry_id/i.test(reason)) {
      console.error("Invoice posting failed", documentId, reason);
    }
    return { status: "failed", reason };
  }
}

/**
 * Records payment of an invoice that was settled outside the Payments screen.
 *
 * The Business workspace has a "mark paid" action that predates the ledger. On
 * its own it would now leave receivables permanently debited: the invoice posts
 * on issue, but nothing clears it. This posts the matching receipt — bank up,
 * receivables down — so the two sides meet.
 *
 * The money lands in the default bank account, since that action does not ask
 * which one was used. Recording the receipt in the Payments screen instead lets
 * the operator choose, and this skips anything already allocated there.
 */
export async function settleInvoiceInFull(
  documentId: string,
  { createdBy = null }: { createdBy?: string | null } = {},
): Promise<InvoicePostingOutcome> {
  try {
    const sql = getDatabase();
    const rows = await sql`
      select d.id, d.value, d.reference, d.customer_id, d.status, d.type, c.name as customer_name,
        coalesce((
          select sum(pa.amount) from payment_allocations pa where pa.sales_document_id = d.id
        ), 0) as allocated
      from sales_documents d join customers c on c.id = d.customer_id
      where d.id = ${documentId} and c.organization_id = ${ORGANIZATION_ID}
    `;
    if (!rows.length) return { status: "skipped", reason: "Sales document was not found." };

    const row = rows[0];
    if (String(row.type) !== "Invoice") return { status: "skipped", reason: "Not an invoice." };

    const outstanding = Number(row.value) - Number(row.allocated);
    // Already settled, in whole or in part, through the Payments screen.
    if (outstanding <= 0.004) return { status: "skipped", reason: "Nothing outstanding." };

    const banks = await sql`
      select id from ledger_accounts
      where organization_id = ${ORGANIZATION_ID} and is_bank and is_active
      order by (system_key = 'bank') desc, code
      limit 1
    `;
    if (!banks.length) return { status: "skipped", reason: "No bank account is set up to receive the payment." };

    const paymentId = crypto.randomUUID();
    const entry = await prepareEntry({
      date: new Date().toISOString().slice(0, 10),
      reference: String(row.reference || ""),
      memo: `Receipt from ${row.customer_name || "customer"}`,
      sourceType: "payment",
      sourceId: paymentId,
      createdBy,
      lines: [
        { accountId: banks[0].id, debit: outstanding },
        { accountKey: "accounts_receivable", credit: outstanding, customerId: row.customer_id },
      ],
    }, { sql });

    await sql.transaction([
      ...entry.statements,
      sql`
        insert into payments (
          id, organization_id, direction, payment_date, bank_account_id, customer_id,
          amount, method, reference, unallocated, journal_entry_id, notes
        ) values (
          ${paymentId}, ${ORGANIZATION_ID}, 'in', current_date, ${banks[0].id}, ${row.customer_id},
          ${outstanding}, 'Marked paid', ${String(row.reference || "")}, 0, ${entry.id},
          'Recorded from the Sales workspace'
        )
      `,
      sql`
        insert into payment_allocations (payment_id, sales_document_id, amount)
        values (${paymentId}, ${documentId}, ${outstanding})
      `,
    ]);

    return { status: "posted", entryId: entry.id, total: outstanding };
  } catch (error) {
    const reason = error instanceof AccountingError
      ? error.message
      : error instanceof Error ? error.message : "Unable to record the receipt.";
    if (!/ledger_accounts|journal_entries|journal_lines|payment_allocations|payments/i.test(reason)) {
      console.error("Invoice receipt posting failed", documentId, reason);
    }
    return { status: "failed", reason };
  }
}

export type BackfillResult = {
  posted: number;
  skipped: number;
  failed: { id: string; reference: string; reason: string }[];
  total: number;
};

/**
 * Posts every issued invoice that has no journal entry yet.
 *
 * Needed because invoices raised before the ledger existed — or before this
 * posting path did — carry real revenue that the reports cannot see. Each is
 * posted at its own issue date, so it lands in the period it belongs to rather
 * than today.
 */
export async function backfillSalesInvoices({ limit = 500, createdBy = null }: { limit?: number; createdBy?: string | null } = {}): Promise<BackfillResult> {
  const sql = getDatabase();
  const rows = await sql`
    select d.id, d.reference
    from sales_documents d join customers c on c.id = d.customer_id
    where c.organization_id = ${ORGANIZATION_ID}
      and d.type = 'Invoice'
      and d.journal_entry_id is null
      and d.status in ('Sent', 'Approved', 'Overdue', 'Partially paid', 'Paid')
    order by d.issue_date nulls last, d.created_at
    limit ${limit}
  `;

  const result: BackfillResult = { posted: 0, skipped: 0, failed: [], total: rows.length };

  for (const row of rows) {
    const outcome = await postSalesInvoice(String(row.id), { createdBy });
    if (outcome.status === "posted") result.posted += 1;
    else if (outcome.status === "skipped") result.skipped += 1;
    // A closed period is the expected failure here, and it names the invoice so
    // the operator can reopen that month and run the backfill again.
    else result.failed.push({ id: String(row.id), reference: String(row.reference || ""), reason: outcome.reason });
  }

  return result;
}

/** Invoices that carry revenue the ledger cannot see yet. */
export async function unpostedInvoiceCount() {
  try {
    const sql = getDatabase();
    const rows = await sql`
      select count(*)::int as count, coalesce(sum(d.value), 0) as value
      from sales_documents d join customers c on c.id = d.customer_id
      where c.organization_id = ${ORGANIZATION_ID}
        and d.type = 'Invoice'
        and d.journal_entry_id is null
        and d.status in ('Sent', 'Approved', 'Overdue', 'Partially paid', 'Paid')
    `;
    return { count: Number(rows[0]?.count || 0), value: Number(rows[0]?.value || 0) };
  } catch {
    return { count: 0, value: 0 };
  }
}

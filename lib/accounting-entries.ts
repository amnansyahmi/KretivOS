/**
 * Journal entry builders.
 *
 * Pure and free of database imports, so the shape of every posting can be
 * asserted directly in tests. `lib/accounting.ts` turns these into statements.
 *
 * The bill side has existed since the ledger was added. The invoice side had
 * not: nothing in the codebase ever debited `accounts_receivable` or credited
 * `sales_income`, so raising an invoice produced no journal entry at all. Income
 * read as zero on every report, receipts drove receivables negative, and
 * per-client profitability showed nothing — while the trial balance still
 * passed, because each individual entry balanced.
 */

import { toCents } from "./accounting-math.ts";

export type EntryLine = {
  accountId?: string;
  accountKey?: string;
  debit?: number;
  credit?: number;
  memo?: string;
  customerId?: string | null;
  vendorId?: string | null;
  projectId?: string | null;
  taxCode?: string;
};

export type EntryInput = {
  date: string;
  reference?: string;
  memo?: string;
  sourceType: string;
  sourceId: string;
  createdBy?: string | null;
  lines: EntryLine[];
};

export type BillForEntry = {
  id: string;
  vendorId: string;
  billDate: string;
  billNumber?: string;
  total: number;
  taxAmount: number;
};

export type BillLineForEntry = {
  accountId?: string | null;
  amount: number;
  description?: string;
  customerId?: string | null;
  projectId?: string | null;
  taxCode?: string;
};

/**
 * A supplier bill: the cost is recognised now, recoverable tax is separated out,
 * and the amount owed sits in payables until it is paid.
 */
export function billEntryInput(bill: BillForEntry, lines: BillLineForEntry[], vendorName: string, createdBy?: string | null): EntryInput {
  const journalLines: EntryLine[] = [];

  for (const line of lines) {
    if (toCents(line.amount) === 0) continue;
    journalLines.push({
      accountId: line.accountId || undefined,
      // A line with no account still has to land somewhere real, so it goes to
      // the holding account rather than being guessed into a plausible one.
      accountKey: line.accountId ? undefined : "uncategorised",
      debit: line.amount,
      memo: line.description,
      customerId: line.customerId,
      vendorId: bill.vendorId,
      projectId: line.projectId,
      taxCode: line.taxCode,
    });
  }

  if (toCents(bill.taxAmount) > 0) {
    journalLines.push({ accountKey: "tax_input", debit: bill.taxAmount, memo: "SST on purchase", vendorId: bill.vendorId });
  }

  journalLines.push({
    accountKey: "accounts_payable",
    credit: bill.total,
    memo: `${vendorName} ${bill.billNumber ?? ""}`.trim(),
    vendorId: bill.vendorId,
  });

  return {
    date: bill.billDate,
    reference: bill.billNumber ?? "",
    memo: `Bill from ${vendorName}`,
    sourceType: "bill",
    sourceId: bill.id,
    createdBy,
    lines: journalLines,
  };
}

export type InvoiceForEntry = {
  id: string;
  customerId: string;
  issueDate: string;
  reference?: string;
  title?: string;
  /** Revenue net of tax and after any discount — what the client is charged for. */
  netAmount: number;
  taxAmount: number;
  /** What the client owes, i.e. net + tax. */
  total: number;
  incomeAccountId?: string | null;
  projectId?: string | null;
};

/**
 * A customer invoice, recognised on issue rather than on payment.
 *
 * Accrual accounting records the revenue when the work is invoiced; the later
 * receipt only moves the amount from receivables to the bank. Recognising it on
 * payment instead would misstate every period the invoice straddles.
 *
 * Tax charged to the client is a liability owed to the government, not income,
 * so it is split out of revenue and credited to the output-tax account.
 */
export function salesInvoiceEntryInput(invoice: InvoiceForEntry, customerName: string, createdBy?: string | null): EntryInput {
  const lines: EntryLine[] = [
    {
      accountKey: "accounts_receivable",
      debit: invoice.total,
      memo: `${customerName} ${invoice.reference ?? ""}`.trim(),
      customerId: invoice.customerId,
    },
  ];

  if (toCents(invoice.netAmount) !== 0) {
    lines.push({
      accountId: invoice.incomeAccountId || undefined,
      accountKey: invoice.incomeAccountId ? undefined : "sales_income",
      credit: invoice.netAmount,
      memo: invoice.title || "Services invoiced",
      // Tagging the customer here is what makes per-client profitability work;
      // untagged revenue cannot be attributed to anyone.
      customerId: invoice.customerId,
      projectId: invoice.projectId,
    });
  }

  if (toCents(invoice.taxAmount) > 0) {
    lines.push({
      accountKey: "tax_output",
      credit: invoice.taxAmount,
      memo: "SST charged",
      customerId: invoice.customerId,
    });
  }

  return {
    date: invoice.issueDate,
    reference: invoice.reference ?? "",
    memo: `Invoice to ${customerName}`,
    sourceType: "invoice",
    sourceId: invoice.id,
    createdBy,
    lines,
  };
}

/**
 * Splits a stored sales document into the amounts the entry needs.
 *
 * A document may carry a structured line-item table with its own discount and
 * tax settings, or it may only have a header `value`. Both have to produce a
 * net/tax/total triple that reconciles exactly, so the tax is derived from the
 * total rather than recomputed — a recomputed figure can differ by a cent from
 * what was printed and sent to the client.
 */
export function invoiceAmounts({
  value,
  lineItemTotals,
}: {
  value: number;
  lineItemTotals?: { taxableAmount?: number; taxAmount?: number; total?: number } | null;
}) {
  const totalsPresent = lineItemTotals && toCents(lineItemTotals.total) > 0;

  if (totalsPresent) {
    const totalCents = toCents(lineItemTotals!.total);
    const taxCents = Math.max(0, toCents(lineItemTotals!.taxAmount));
    // Net is whatever is left, so net + tax always equals the printed total.
    const netCents = totalCents - taxCents;
    return { netAmount: netCents / 100, taxAmount: taxCents / 100, total: totalCents / 100 };
  }

  const totalCents = toCents(value);
  return { netAmount: totalCents / 100, taxAmount: 0, total: totalCents / 100 };
}

/** Sales-document statuses that mean the invoice has been issued to the client. */
export const ISSUED_INVOICE_STATUSES = ["Sent", "Approved", "Overdue", "Partially paid", "Paid"];

export const isIssuedInvoice = (type: string, status: string) =>
  type === "Invoice" && ISSUED_INVOICE_STATUSES.includes(status);

/**
 * Cash entry line construction.
 *
 * Split from lib/cash-posting.ts so the shape of a cash posting can be asserted
 * without a database, the same way the invoice and bill builders are.
 */

export type CashDirection = "in" | "out";

export type CashEntryInput = {
  direction: CashDirection;
  date: string;
  amount: number;
  bankAccountId: string;
  /** The income or expense account the amount belongs to. */
  ledgerAccountId: string;
  reference?: string;
  memo?: string;
  customerId?: string | null;
  vendorId?: string | null;
  projectId?: string | null;
  createdBy?: string | null;
};

/**
 * Money in debits the bank and credits the category; money out is the mirror.
 *
 * The bank side is always the account the operator chose, never a system
 * default — a cash log that cannot say which account moved is a cash log that
 * can never be reconciled to a statement, which is what the Finance tab was.
 */
export type CashLine = {
  accountId: string;
  debit?: number;
  credit?: number;
  memo?: string;
  customerId?: string | null;
  vendorId?: string | null;
  projectId?: string | null;
};

export function cashEntryLines(input: CashEntryInput): CashLine[] {
  const counterparty = { customerId: input.customerId ?? null, vendorId: input.vendorId ?? null, projectId: input.projectId ?? null };
  return input.direction === "in"
    ? [
      { accountId: input.bankAccountId, debit: input.amount, memo: input.memo },
      { accountId: input.ledgerAccountId, credit: input.amount, memo: input.memo, ...counterparty },
    ]
    : [
      { accountId: input.ledgerAccountId, debit: input.amount, memo: input.memo, ...counterparty },
      { accountId: input.bankAccountId, credit: input.amount, memo: input.memo },
    ];
}

/**
 * The arithmetic of proving a bank account, kept free of I/O so it can be
 * tested directly.
 *
 * A reconciliation answers one question: does the ledger agree with the bank?
 * It agrees when the statement balance, plus anything the bank has not seen
 * yet, equals the book balance. Written out:
 *
 *     statement balance
 *   + payments not yet cleared        (money out we have recorded, bank hasn't)
 *   - deposits not yet cleared        (money in we have recorded, bank hasn't)
 *   = book balance
 *
 * The signs are the part people get wrong. An uncleared payment has already
 * left the books but not the bank, so the statement still shows it — adding it
 * back is what brings the two together.
 */

import { fromCents, toCents } from "./accounting-math.ts";

export type BankLine = {
  id: string;
  date: string;
  memo: string;
  reference: string;
  /** Signed in cents: positive is money into the account. */
  amountCents: number;
  cleared: boolean;
  reconciliationId?: string | null;
};

export type ReconciliationSummary = {
  /** Ledger balance of the account at the statement date. */
  bookBalance: number;
  /** Balance of only the lines ticked as appearing on the statement. */
  clearedBalance: number;
  statementBalance: number;
  /** Money in the books that the bank has not shown yet. */
  unclearedDeposits: number;
  unclearedPayments: number;
  /** Cleared balance less statement balance. Zero means the account is proved. */
  difference: number;
  balanced: boolean;
  clearedCount: number;
  unclearedCount: number;
};

/**
 * `openingCents` is the balance brought forward from the last locked
 * reconciliation, so a month can be proved without re-ticking every prior line.
 */
export function summarise(
  lines: BankLine[],
  statementBalance: number,
  { openingCents = 0 }: { openingCents?: number } = {},
): ReconciliationSummary {
  let bookCents = openingCents;
  let clearedCents = openingCents;
  let unclearedDepositCents = 0;
  let unclearedPaymentCents = 0;
  let clearedCount = 0;
  let unclearedCount = 0;

  for (const line of lines) {
    bookCents += line.amountCents;
    if (line.cleared) {
      clearedCents += line.amountCents;
      clearedCount += 1;
    } else {
      unclearedCount += 1;
      if (line.amountCents >= 0) unclearedDepositCents += line.amountCents;
      else unclearedPaymentCents += Math.abs(line.amountCents);
    }
  }

  const statementCents = toCents(statementBalance);
  const differenceCents = clearedCents - statementCents;

  return {
    bookBalance: fromCents(bookCents),
    clearedBalance: fromCents(clearedCents),
    statementBalance: fromCents(statementCents),
    unclearedDeposits: fromCents(unclearedDepositCents),
    unclearedPayments: fromCents(unclearedPaymentCents),
    difference: fromCents(differenceCents),
    // Exact, not approximate: everything is integer cents, so "close enough"
    // would only ever hide a real discrepancy.
    balanced: differenceCents === 0,
    clearedCount,
    unclearedCount,
  };
}

/**
 * Restates the summary the way a printed reconciliation reads, which is the
 * form an accountant checks: start from what the bank says and work to what the
 * books say.
 */
export function statementToBook(summary: ReconciliationSummary) {
  const statement = toCents(summary.statementBalance);
  const payments = toCents(summary.unclearedPayments);
  const deposits = toCents(summary.unclearedDeposits);
  const derived = statement - payments + deposits;
  return {
    statementBalance: summary.statementBalance,
    lessUnclearedPayments: summary.unclearedPayments,
    plusUnclearedDeposits: summary.unclearedDeposits,
    derivedBookBalance: fromCents(derived),
    bookBalance: summary.bookBalance,
    agrees: derived === toCents(summary.bookBalance),
  };
}

/**
 * Lines the bank has not confirmed after this long are worth a second look.
 * A cheque that has not cleared in three months has usually been lost, and a
 * receipt that never arrives was usually never sent.
 */
export function staleUncleared(lines: BankLine[], asOf: string, days = 90): BankLine[] {
  const cutoff = new Date(`${asOf}T00:00:00`);
  if (Number.isNaN(cutoff.getTime())) return [];
  cutoff.setDate(cutoff.getDate() - days);

  return lines.filter((line) => {
    if (line.cleared) return false;
    const at = new Date(`${line.date}T00:00:00`);
    return !Number.isNaN(at.getTime()) && at < cutoff;
  });
}

/**
 * Suggests which lines to tick, given the amounts on a statement.
 *
 * Deliberately conservative: it only pairs an uncleared line with a statement
 * amount when exactly one line matches that amount. Anything ambiguous is left
 * for a person, because a wrong tick is worse than no tick — it proves an
 * account that has not actually been proved.
 */
export function suggestClearings(lines: BankLine[], statementAmounts: number[]): string[] {
  const uncleared = lines.filter((line) => !line.cleared);
  const suggested: string[] = [];
  const taken = new Set<string>();

  for (const amount of statementAmounts) {
    const cents = toCents(amount);
    const candidates = uncleared.filter(
      (line) => line.amountCents === cents && !taken.has(line.id),
    );
    if (candidates.length === 1) {
      taken.add(candidates[0].id);
      suggested.push(candidates[0].id);
    }
  }

  return suggested;
}

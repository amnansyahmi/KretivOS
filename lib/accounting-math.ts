/**
 * Pure money and posting arithmetic, kept free of database imports so it can be
 * unit-tested directly. `lib/accounting.ts` re-exports these.
 */

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

/**
 * Money is handled in cents.
 *
 * Floating point cannot represent 0.1, so summing a column of ringgit as
 * doubles drifts: 0.1 + 0.2 !== 0.3. In a ledger that drift is the difference
 * between a balanced entry and a rejected one, so amounts become integer cents
 * for every comparison and are only formatted back at the edges.
 */
export const toCents = (value: unknown) => Math.round(Number(value ?? 0) * 100);
export const fromCents = (cents: number) => Number((cents / 100).toFixed(2));

/**
 * Signed movement for an account type.
 *
 * Assets and expenses increase on the debit side; liabilities, equity and income
 * increase on the credit side. Returning one signed number lets reports sum a
 * column without repeating this rule at every call site.
 */
export function signedBalance(type: AccountType, debitCents: number, creditCents: number) {
  return type === "asset" || type === "expense" ? debitCents - creditCents : creditCents - debitCents;
}

export type LineAmounts = { debit?: number; credit?: number };

export type BalanceProblem =
  | { kind: "too_few_lines" }
  | { kind: "negative"; line: number }
  | { kind: "empty"; line: number }
  | { kind: "two_sided"; line: number }
  | { kind: "unbalanced"; debit: number; credit: number }
  | { kind: "zero" };

/**
 * Checks the double-entry invariants for a set of lines.
 *
 * Returns the problem rather than throwing so both the posting engine and the
 * UI can use it — the entry form needs to show "out by RM0.05" while the
 * operator is still typing, not only when they submit.
 */
export function checkBalance(lines: LineAmounts[]): { ok: true; totalCents: number } | { ok: false; problem: BalanceProblem } {
  if (!Array.isArray(lines) || lines.length < 2) return { ok: false, problem: { kind: "too_few_lines" } };

  let debitCents = 0;
  let creditCents = 0;

  for (let index = 0; index < lines.length; index++) {
    const debit = toCents(lines[index].debit);
    const credit = toCents(lines[index].credit);
    if (debit < 0 || credit < 0) return { ok: false, problem: { kind: "negative", line: index + 1 } };
    if (debit === 0 && credit === 0) return { ok: false, problem: { kind: "empty", line: index + 1 } };
    if (debit > 0 && credit > 0) return { ok: false, problem: { kind: "two_sided", line: index + 1 } };
    debitCents += debit;
    creditCents += credit;
  }

  if (debitCents !== creditCents) {
    return { ok: false, problem: { kind: "unbalanced", debit: fromCents(debitCents), credit: fromCents(creditCents) } };
  }
  if (debitCents === 0) return { ok: false, problem: { kind: "zero" } };

  return { ok: true, totalCents: debitCents };
}

export function describeProblem(problem: BalanceProblem) {
  switch (problem.kind) {
    case "too_few_lines": return "A journal entry needs at least two lines.";
    case "negative": return `Line ${problem.line} cannot be negative.`;
    case "empty": return `Line ${problem.line} has no amount.`;
    case "two_sided": return `Line ${problem.line} cannot be both a debit and a credit.`;
    case "zero": return "An entry cannot be for zero.";
    case "unbalanced":
      return `Entry does not balance: debits ${problem.debit.toFixed(2)}, credits ${problem.credit.toFixed(2)}.`;
  }
}

/**
 * Splits a total across lines so the parts always sum back to the total.
 *
 * Allocating RM100 across three lines gives 33.33, 33.33, 33.34 — the remainder
 * cent goes to the last line rather than being lost to rounding, which is what
 * would otherwise leave an entry one cent out of balance.
 */
export function allocateCents(totalCents: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return weights.map(() => 0);

  const parts = weights.map((weight) => Math.floor((totalCents * weight) / totalWeight));
  const remainder = totalCents - parts.reduce((sum, part) => sum + part, 0);
  if (parts.length) parts[parts.length - 1] += remainder;
  return parts;
}

/**
 * Tax on a line. `inclusive` means the unit price already contains the tax, as
 * a Malaysian receipt total usually does.
 */
export function lineTax({ amountCents, ratePercent, inclusive = false }: { amountCents: number; ratePercent: number; inclusive?: boolean }) {
  const rate = Number(ratePercent) || 0;
  if (!rate) return { netCents: amountCents, taxCents: 0, grossCents: amountCents };

  if (inclusive) {
    const netCents = Math.round(amountCents / (1 + rate / 100));
    return { netCents, taxCents: amountCents - netCents, grossCents: amountCents };
  }
  const taxCents = Math.round((amountCents * rate) / 100);
  return { netCents: amountCents, taxCents, grossCents: amountCents + taxCents };
}

/** Standard aging buckets, by days past due. */
export function agingBucket(dueDate: string, asOf = new Date()): "current" | "1-30" | "31-60" | "61-90" | "90+" {
  if (!dueDate) return "current";
  const due = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return "current";
  const reference = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const days = Math.floor((reference.getTime() - due.getTime()) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

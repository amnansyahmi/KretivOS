/**
 * Deterministic detection of things worth checking in the ledger.
 *
 * Every figure here is computed in code. The AI layer in lib/accounting-ai.ts
 * reads these signals and explains them; it never calculates one. That split is
 * the whole design: a model that is asked to spot a duplicate payment will
 * occasionally invent one, and an invented duplicate in an accounting review is
 * worse than no review at all.
 *
 * Pure and free of database and AI imports, so every rule can be tested against
 * the exact cases it is meant to catch.
 */

import { toCents } from "./accounting-math.ts";

/** One posted amount, flattened from the journal for analysis. */
export type LedgerFact = {
  id: string;
  date: string;
  accountCode: string;
  accountName: string;
  accountType: "asset" | "liability" | "equity" | "income" | "expense";
  /** Always positive; direction is implied by the account type. */
  amount: number;
  vendorId?: string;
  vendorName?: string;
  customerName?: string;
  reference?: string;
  memo?: string;
};

export type SignalKind =
  | "duplicate"
  | "spike"
  | "missing_recurring"
  | "uncategorised"
  | "stale_receivable"
  | "unposted";

export type Signal = {
  kind: SignalKind;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  amount: number;
  recordIds: string[];
};

const month = (date: string) => String(date ?? "").slice(0, 7);
const money = (value: number) => `RM${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const daysBetween = (a: string, b: string) =>
  Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86_400_000;

/**
 * The same supplier, the same amount, a few days apart.
 *
 * The commonest real duplicate is a bill entered twice — once from the emailed
 * PDF and once from the photographed copy. Matching on vendor and exact amount
 * within a short window catches that without flagging a genuine weekly retainer,
 * which repeats monthly rather than within days.
 */
export function detectDuplicates(facts: LedgerFact[], { windowDays = 7 } = {}): Signal[] {
  const spend = facts.filter((fact) => fact.accountType === "expense" && toCents(fact.amount) > 0);
  const groups = new Map<string, LedgerFact[]>();

  for (const fact of spend) {
    // Keyed on counterparty and exact amount. An unnamed vendor is skipped:
    // "two RM50 expenses in a week" is normal and flagging it is noise.
    const who = fact.vendorId || fact.vendorName;
    if (!who) continue;
    const key = `${who}|${toCents(fact.amount)}`;
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }

  const signals: Signal[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));

    for (let index = 1; index < sorted.length; index++) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (daysBetween(previous.date, current.date) > windowDays) continue;
      signals.push({
        kind: "duplicate",
        severity: "high",
        title: `Possible duplicate: ${current.vendorName || "supplier"} ${money(current.amount)}`,
        detail: `Two payments of ${money(current.amount)} to ${current.vendorName || "the same supplier"} on ${previous.date} and ${current.date}.`,
        amount: current.amount,
        recordIds: [previous.id, current.id],
      });
    }
  }
  return signals;
}

/**
 * An expense account well above its own recent average.
 *
 * Compared against the account's trailing months rather than a fixed threshold,
 * because RM5,000 of advertising is routine and RM5,000 of bank charges is not.
 * A month with no history is not a spike — there is nothing to be high against.
 */
export function detectSpikes(
  facts: LedgerFact[],
  { period, months = 6, multiple = 2, minimumAmount = 200 }: { period: string; months?: number; multiple?: number; minimumAmount?: number },
): Signal[] {
  const spend = facts.filter((fact) => fact.accountType === "expense");
  const byAccount = new Map<string, Map<string, number>>();

  for (const fact of spend) {
    const perMonth = byAccount.get(fact.accountCode) ?? new Map<string, number>();
    const bucket = month(fact.date);
    perMonth.set(bucket, (perMonth.get(bucket) ?? 0) + toCents(fact.amount));
    byAccount.set(fact.accountCode, perMonth);
  }

  const signals: Signal[] = [];
  for (const [code, perMonth] of byAccount) {
    const currentCents = perMonth.get(period) ?? 0;
    if (currentCents < toCents(minimumAmount)) continue;

    const priorMonths = [...perMonth.entries()]
      .filter(([bucket]) => bucket < period)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, months);
    if (priorMonths.length < 2) continue;

    const averageCents = priorMonths.reduce((sum, [, cents]) => sum + cents, 0) / priorMonths.length;
    if (averageCents <= 0 || currentCents < averageCents * multiple) continue;

    const name = spend.find((fact) => fact.accountCode === code)?.accountName ?? code;
    signals.push({
      kind: "spike",
      severity: currentCents > averageCents * 4 ? "high" : "medium",
      title: `${name} is ${(currentCents / averageCents).toFixed(1)}× its usual`,
      detail: `${money(currentCents / 100)} this period against a ${priorMonths.length}-month average of ${money(averageCents / 100)}.`,
      amount: currentCents / 100,
      recordIds: spend.filter((fact) => fact.accountCode === code && month(fact.date) === period).map((fact) => fact.id),
    });
  }
  return signals;
}

/**
 * A supplier billed reliably every month, with nothing this month.
 *
 * Catches the rent or subscription nobody entered, which understates costs and
 * quietly overstates profit. Requires a run of consecutive prior months so a
 * one-off purchase is never mistaken for a missed recurring bill.
 */
export function detectMissingRecurring(
  facts: LedgerFact[],
  { period, minimumMonths = 3 }: { period: string; minimumMonths?: number },
): Signal[] {
  const spend = facts.filter((fact) => fact.accountType === "expense" && (fact.vendorId || fact.vendorName));
  const byVendor = new Map<string, { name: string; months: Set<string>; amounts: number[] }>();

  for (const fact of spend) {
    const key = fact.vendorId || fact.vendorName!;
    const entry = byVendor.get(key) ?? { name: fact.vendorName || key, months: new Set<string>(), amounts: [] };
    entry.months.add(month(fact.date));
    if (month(fact.date) < period) entry.amounts.push(fact.amount);
    byVendor.set(key, entry);
  }

  const signals: Signal[] = [];
  for (const [, entry] of byVendor) {
    if (entry.months.has(period)) continue;

    const priorMonths = [...entry.months].filter((bucket) => bucket < period).sort().reverse();
    if (priorMonths.length < minimumMonths) continue;

    // The run must be unbroken and reach the month immediately before this one,
    // otherwise a supplier who stopped six months ago is reported every month.
    const expected = expectedRun(period, priorMonths.length);
    const consecutive = expected.filter((bucket) => priorMonths.includes(bucket)).length;
    if (consecutive < minimumMonths) continue;

    const typical = entry.amounts.length
      ? entry.amounts.reduce((sum, value) => sum + value, 0) / entry.amounts.length
      : 0;

    signals.push({
      kind: "missing_recurring",
      severity: "medium",
      title: `Nothing from ${entry.name} this period`,
      detail: `Billed in each of the previous ${consecutive} months, usually around ${money(typical)}. The bill may not have been entered.`,
      amount: typical,
      recordIds: [],
    });
  }
  return signals;
}

/** The months immediately preceding `period`, most recent first. */
function expectedRun(period: string, count: number) {
  const [year, month] = period.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (index + 1), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** Cost sitting in the holding account, which means it is in no real category. */
export function detectUncategorised(balances: { code: string; name: string; systemKey?: string; balance: number }[]): Signal[] {
  const holding = balances.find((row) => row.systemKey === "uncategorised");
  if (!holding || toCents(holding.balance) <= 0) return [];
  return [{
    kind: "uncategorised",
    severity: "medium",
    title: `${money(holding.balance)} is uncategorised`,
    detail: `Sitting in ${holding.code} ${holding.name}. Until it is classified it distorts every expense line it should belong to.`,
    amount: holding.balance,
    recordIds: [],
  }];
}

/** Invoices long past due, which are the ones that stop being collectable. */
export function detectStaleReceivables(
  invoices: { id: string; reference?: string; customerName?: string; dueDate: string; outstanding: number }[],
  { asOf = new Date(), days = 60 } = {},
): Signal[] {
  const reference = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  return invoices
    .filter((invoice) => {
      if (toCents(invoice.outstanding) <= 0 || !invoice.dueDate) return false;
      const due = new Date(`${invoice.dueDate}T00:00:00Z`);
      return !Number.isNaN(due.getTime()) && (reference.getTime() - due.getTime()) / 86_400_000 > days;
    })
    .map((invoice) => {
      const overdueDays = Math.floor((reference.getTime() - new Date(`${invoice.dueDate}T00:00:00Z`).getTime()) / 86_400_000);
      return {
        kind: "stale_receivable" as const,
        severity: overdueDays > 90 ? ("high" as const) : ("medium" as const),
        title: `${invoice.customerName || "A client"} owes ${money(invoice.outstanding)}, ${overdueDays} days late`,
        detail: `Invoice ${invoice.reference || invoice.id} was due ${invoice.dueDate}.`,
        amount: invoice.outstanding,
        recordIds: [invoice.id],
      };
    });
}

/** Documents holding real money that never reached the ledger. */
export function detectUnposted({ invoices, cash, settlements, payroll }: {
  invoices: { count: number; value: number };
  cash: { count: number; net: number };
  settlements: { count: number };
  payroll?: { count: number; value: number };
}): Signal[] {
  const signals: Signal[] = [];
  if (invoices.count > 0) {
    signals.push({
      kind: "unposted", severity: "high",
      title: `${invoices.count} issued invoice${invoices.count === 1 ? "" : "s"} not on the ledger`,
      detail: `${money(invoices.value)} of revenue is missing from the reports until these are posted.`,
      amount: invoices.value, recordIds: [],
    });
  }
  if (settlements.count > 0) {
    signals.push({
      kind: "unposted", severity: "high",
      title: `${settlements.count} paid settlement${settlements.count === 1 ? "" : "s"} not on the ledger`,
      detail: "Settlement income is missing from the reports until these are posted.",
      amount: 0, recordIds: [],
    });
  }
  if (payroll && payroll.count > 0) {
    signals.push({
      kind: "unposted", severity: "high",
      title: `${payroll.count} payroll record${payroll.count === 1 ? "" : "s"} not on the ledger`,
      detail: `${money(payroll.value)} of staff cost is missing from the profit and loss, along with the EPF, SOCSO, EIS and PCB owed on it.`,
      amount: payroll.value, recordIds: [],
    });
  }
  if (cash.count > 0) {
    signals.push({
      kind: "unposted", severity: "medium",
      title: `${cash.count} cash record${cash.count === 1 ? "" : "s"} predate the ledger`,
      detail: `A net ${money(cash.net)} recorded before accounting existed, so it is not in the reports.`,
      amount: cash.net, recordIds: [],
    });
  }
  return signals;
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Highest severity first, then largest amount — what to look at, in order. */
export function rankSignals(signals: Signal[], limit = 20) {
  return [...signals]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.amount - a.amount)
    .slice(0, limit);
}

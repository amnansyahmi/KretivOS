/**
 * Month-end review: what in the ledger is worth a person's attention.
 *
 * The facts are pulled from the journal and the checks run in code
 * (lib/accounting-signals.ts). The AI layer only prioritises and explains them,
 * so the review still works — and still reports the same items — when the
 * service is unavailable.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";
import { accountBalances } from "@/lib/accounting";
import { reviewPeriod, type PeriodSummary } from "@/lib/accounting-ai";
import { toCents } from "@/lib/accounting-math";
import {
  detectDuplicates,
  detectMissingRecurring,
  detectSpikes,
  detectStaleReceivables,
  detectUncategorised,
  detectUnposted,
  rankSignals,
  type LedgerFact,
} from "@/lib/accounting-signals";
import { unpostedInvoiceCount } from "@/lib/invoice-posting";
import { unreconciledCashCount } from "@/lib/cash-posting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const isPeriod = (value: string) => /^\d{4}-\d{2}$/.test(value);

function monthBounds(period: string) {
  const [year, month] = period.split("-").map(Number);
  const from = `${period}-01`;
  const end = new Date(Date.UTC(year, month, 0));
  return { from, to: end.toISOString().slice(0, 10) };
}

export async function GET(request: NextRequest) {
  try {
    await requireHRSession(["hr_admin", "finance"]);

    const requested = String(request.nextUrl.searchParams.get("period") ?? "");
    const period = isPeriod(requested) ? requested : new Date().toISOString().slice(0, 7);
    const { from, to } = monthBounds(period);
    // History for the trend checks: a spike or a missing recurring bill can only
    // be judged against what the account normally does.
    const historyFrom = `${new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 7, 1)).toISOString().slice(0, 7)}-01`;

    const sql = getDatabase();
    const [factRows, periodBalances, cumulative, receivableRows, settlementRows, invoices, cash] = await Promise.all([
      sql`
        select l.id, e.entry_date, a.code, a.name as account_name, a.type,
               l.debit, l.credit, l.vendor_id, v.name as vendor_name,
               c.name as customer_name, e.reference, l.memo
        from journal_lines l
        join journal_entries e on e.id = l.entry_id and e.status = 'Posted'
        join ledger_accounts a on a.id = l.account_id
        left join vendors v on v.id = l.vendor_id
        left join customers c on c.id = l.customer_id
        where a.organization_id = ${ORGANIZATION_ID}
          and e.entry_date >= ${historyFrom}::date and e.entry_date <= ${to}::date
        order by e.entry_date
        limit 5000
      `,
      accountBalances({ from, to }),
      accountBalances({ to }),
      sql`
        select d.id, d.reference, d.due_date, d.value, c.name as customer_name,
          coalesce((select sum(pa.amount) from payment_allocations pa where pa.sales_document_id = d.id), 0) as allocated
        from sales_documents d join customers c on c.id = d.customer_id
        where c.organization_id = ${ORGANIZATION_ID}
          and d.type = 'Invoice' and d.status in ('Sent', 'Approved', 'Overdue', 'Partially paid')
      `,
      sql`
        select count(*)::int as count from settlements s join customers c on c.id = s.customer_id
        where c.organization_id = ${ORGANIZATION_ID} and s.status = 'Paid' and s.journal_entry_id is null
      `,
      unpostedInvoiceCount(),
      unreconciledCashCount(),
    ]);

    // Flattened to one positive amount per line, with direction implied by the
    // account type — which is the shape the detectors reason about.
    const facts: LedgerFact[] = factRows.map((row: any) => ({
      id: row.id,
      date: String(row.entry_date).slice(0, 10),
      accountCode: row.code,
      accountName: row.account_name,
      accountType: row.type,
      amount: ["asset", "expense"].includes(row.type)
        ? Number(row.debit) - Number(row.credit)
        : Number(row.credit) - Number(row.debit),
      vendorId: row.vendor_id || undefined,
      vendorName: row.vendor_name || undefined,
      customerName: row.customer_name || undefined,
      reference: row.reference || undefined,
      memo: row.memo || undefined,
    })).filter((fact: LedgerFact) => toCents(fact.amount) > 0);

    const inPeriod = facts.filter((fact) => fact.date >= from && fact.date <= to);

    const signals = rankSignals([
      ...detectUnposted({
        invoices,
        cash,
        settlements: { count: Number(settlementRows[0]?.count || 0) },
      }),
      ...detectDuplicates(inPeriod),
      ...detectSpikes(facts, { period }),
      ...detectMissingRecurring(facts, { period }),
      ...detectUncategorised(periodBalances),
      ...detectStaleReceivables(receivableRows.map((row: any) => ({
        id: row.id,
        reference: row.reference || "",
        customerName: row.customer_name,
        dueDate: row.due_date ? String(row.due_date).slice(0, 10) : "",
        outstanding: Number(row.value) - Number(row.allocated),
      }))),
    ]);

    const sumOf = (type: string) => periodBalances
      .filter((row) => row.type === type)
      .reduce((total, row) => total + toCents(row.balance), 0) / 100;

    const summary: PeriodSummary = {
      period,
      income: sumOf("income"),
      expense: sumOf("expense"),
      cash: cumulative.filter((row) => row.subtype === "Bank" || row.subtype === "Cash")
        .reduce((total, row) => total + toCents(row.balance), 0) / 100,
      receivable: cumulative.filter((row) => row.subtype === "Receivable")
        .reduce((total, row) => total + toCents(row.balance), 0) / 100,
      payable: cumulative.filter((row) => row.subtype === "Payable")
        .reduce((total, row) => total + toCents(row.balance), 0) / 100,
      topExpenses: periodBalances
        .filter((row) => row.type === "expense" && toCents(row.balance) > 0)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5)
        .map((row) => ({ name: row.name, amount: row.balance })),
    };

    const review = await reviewPeriod(signals, summary);

    return NextResponse.json({ period, summary, signals, review }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Accounting insights failed", error);
    if (error instanceof HRAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unable to review the period.";
    return NextResponse.json({
      error: /ledger_accounts|journal_/i.test(message)
        ? "Accounting tables are not ready. Apply db/migrations/0008_accounting_core.sql to the Neon database."
        : message,
      signals: [],
    }, { status: 503 });
  }
}

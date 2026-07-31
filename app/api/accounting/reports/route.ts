/**
 * Financial statements, computed from the journal rather than stored.
 *
 * Nothing here is cached or materialised: a report is a view of the ledger at a
 * point in time, and a stored copy is a copy that can disagree with the ledger.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { accountBalances, trialBalanceCheck } from "@/lib/accounting";
import { agingBucket, fromCents, toCents } from "@/lib/accounting-math";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

function monthStart(offsetMonths = 0) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1)).toISOString().slice(0, 10);
}

/**
 * Profit and loss for a window.
 *
 * Income and expense accounts only — balance-sheet accounts carry forward and
 * would double-count if they appeared here.
 */
function profitAndLoss(balances: Awaited<ReturnType<typeof accountBalances>>) {
  const income = balances.filter((row) => row.type === "income" && toCents(row.balance) !== 0);
  const expenses = balances.filter((row) => row.type === "expense" && toCents(row.balance) !== 0);

  const totalIncomeCents = income.reduce((sum, row) => sum + toCents(row.balance), 0);
  const totalExpenseCents = expenses.reduce((sum, row) => sum + toCents(row.balance), 0);
  const costOfSalesCents = expenses
    .filter((row) => row.subtype === "Cost of sales")
    .reduce((sum, row) => sum + toCents(row.balance), 0);

  return {
    income,
    expenses,
    totalIncome: fromCents(totalIncomeCents),
    totalExpense: fromCents(totalExpenseCents),
    costOfSales: fromCents(costOfSalesCents),
    grossProfit: fromCents(totalIncomeCents - costOfSalesCents),
    netProfit: fromCents(totalIncomeCents - totalExpenseCents),
  };
}

/**
 * Balance sheet as at a date.
 *
 * Profit for the period has not been journalled into equity, so it is added as
 * a computed line — without it the sheet would not balance, which is the usual
 * confusion when a P&L and a balance sheet are read side by side.
 */
function balanceSheet(cumulative: Awaited<ReturnType<typeof accountBalances>>) {
  const assets = cumulative.filter((row) => row.type === "asset" && toCents(row.balance) !== 0);
  const liabilities = cumulative.filter((row) => row.type === "liability" && toCents(row.balance) !== 0);
  const equity = cumulative.filter((row) => row.type === "equity" && toCents(row.balance) !== 0);

  const totalAssetsCents = assets.reduce((sum, row) => sum + toCents(row.balance), 0);
  const totalLiabilitiesCents = liabilities.reduce((sum, row) => sum + toCents(row.balance), 0);
  const bookedEquityCents = equity.reduce((sum, row) => sum + toCents(row.balance), 0);

  const incomeCents = cumulative.filter((row) => row.type === "income").reduce((sum, row) => sum + toCents(row.balance), 0);
  const expenseCents = cumulative.filter((row) => row.type === "expense").reduce((sum, row) => sum + toCents(row.balance), 0);
  const currentEarningsCents = incomeCents - expenseCents;

  const totalEquityCents = bookedEquityCents + currentEarningsCents;

  return {
    assets,
    liabilities,
    equity,
    totalAssets: fromCents(totalAssetsCents),
    totalLiabilities: fromCents(totalLiabilitiesCents),
    currentEarnings: fromCents(currentEarningsCents),
    totalEquity: fromCents(totalEquityCents),
    // Should be zero. A non-zero figure means something bypassed postEntry.
    outOfBalance: fromCents(totalAssetsCents - (totalLiabilitiesCents + totalEquityCents)),
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireHRSession(["hr_admin", "finance"]);
    const params = request.nextUrl.searchParams;
    const from = isDate(String(params.get("from"))) ? String(params.get("from")) : monthStart(-11);
    const to = isDate(String(params.get("to"))) ? String(params.get("to")) : new Date().toISOString().slice(0, 10);

    const sql = getDatabase();
    const [period, cumulative, check, payableRows, receivableRows, clientRows, bankRows] = await Promise.all([
      accountBalances({ from, to }),
      accountBalances({ to }),
      trialBalanceCheck({ to }),
      sql`
        select b.id, b.bill_number, b.due_date, b.total, b.amount_paid, v.name as vendor_name
        from bills b join vendors v on v.id = b.vendor_id
        where b.organization_id = ${ORGANIZATION_ID}
          and b.status not in ('Void', 'Paid', 'Draft')
          and b.total > b.amount_paid
      `,
      sql`
        select d.id, d.reference, d.title, d.due_date, d.value,
          coalesce(a.amount_paid, 0) as amount_paid, c.name as customer_name
        from sales_documents d join customers c on c.id = d.customer_id
        left join (
          select pa.sales_document_id, sum(pa.amount) as amount_paid
          from payment_allocations pa
          join payments p on p.id = pa.payment_id and p.organization_id = ${ORGANIZATION_ID}
          group by pa.sales_document_id
        ) a on a.sales_document_id = d.id
        where c.organization_id = ${ORGANIZATION_ID}
          and d.type = 'Invoice' and d.status in ('Sent', 'Approved', 'Overdue', 'Partially paid')
          and d.value > coalesce(a.amount_paid, 0)
      `,
      // Per-client profitability: an agency's most useful report, and the one
      // the single-entry cash log could never produce.
      sql`
        select c.id, c.name,
          coalesce(sum(case when a.type = 'income' then l.credit - l.debit else 0 end), 0) as income,
          coalesce(sum(case when a.type = 'expense' then l.debit - l.credit else 0 end), 0) as cost
        from customers c
        left join journal_lines l on l.customer_id = c.id
        left join journal_entries e on e.id = l.entry_id and e.status = 'Posted'
          and e.entry_date between ${from}::date and ${to}::date
        left join ledger_accounts a on a.id = l.account_id
        where c.organization_id = ${ORGANIZATION_ID} and (l.id is null or e.id is not null)
        group by c.id, c.name
        order by income desc
      `,
      sql`
        select a.id, a.code, a.name, a.bank_name,
          coalesce(sum(l.debit - l.credit), 0) as balance
        from ledger_accounts a
        left join journal_lines l on l.account_id = a.id
        left join journal_entries e on e.id = l.entry_id and e.status = 'Posted' and e.entry_date <= ${to}::date
        where a.organization_id = ${ORGANIZATION_ID} and a.is_bank
          and (l.id is null or e.id is not null)
        group by a.id, a.code, a.name, a.bank_name
        order by a.code
      `,
    ]);

    const bucketise = (rows: any[], amountOf: (row: any) => number, dueOf: (row: any) => string) => {
      const buckets: Record<string, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      const items = rows.map((row: any) => {
        const outstanding = amountOf(row);
        const bucket = agingBucket(dueOf(row));
        buckets[bucket] += toCents(outstanding);
        return { ...row, outstanding, bucket };
      });
      return {
        items,
        buckets: Object.fromEntries(Object.entries(buckets).map(([key, cents]) => [key, fromCents(cents)])),
        total: fromCents(Object.values(buckets).reduce((sum, cents) => sum + cents, 0)),
      };
    };

    const payable = bucketise(
      payableRows,
      (row) => Number(row.total) - Number(row.amount_paid),
      (row) => (row.due_date ? String(row.due_date).slice(0, 10) : ""),
    );
    const receivable = bucketise(
      receivableRows,
      (row) => Number(row.value) - Number(row.amount_paid || 0),
      (row) => (row.due_date ? String(row.due_date).slice(0, 10) : ""),
    );

    const clients = clientRows
      .map((row: any) => {
        const income = Number(row.income);
        const cost = Number(row.cost);
        return {
          id: row.id,
          name: row.name,
          income,
          cost,
          margin: fromCents(toCents(income) - toCents(cost)),
          marginPercent: toCents(income) > 0 ? Number((((income - cost) / income) * 100).toFixed(1)) : 0,
        };
      })
      .filter((row: any) => toCents(row.income) !== 0 || toCents(row.cost) !== 0);

    return NextResponse.json({
      range: { from, to },
      profitAndLoss: profitAndLoss(period),
      balanceSheet: balanceSheet(cumulative),
      trialBalance: { rows: period, ...check },
      payable,
      receivable,
      clients,
      bankAccounts: bankRows.map((row: any) => ({
        id: row.id, code: row.code, name: row.name, bankName: row.bank_name,
        balance: Number(row.balance),
      })),
      cash: fromCents(bankRows.reduce((sum: number, row: any) => sum + toCents(row.balance), 0)),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Accounting reports failed", error);
    if (error instanceof HRAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Reports are unavailable.";
    return NextResponse.json(
      {
        error: /ledger_accounts|journal_/i.test(message)
          ? "Accounting tables are not ready. Apply db/migrations/0008_accounting_core.sql to the Neon database."
          : message,
      },
      { status: 503 },
    );
  }
}

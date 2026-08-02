/**
 * Bank reconciliation: proving that the ledger agrees with the bank.
 *
 * The arithmetic lives in lib/reconciliation.ts and is tested there. This route
 * is the I/O around it — which lines are in play, what a locked period means,
 * and the roll-forward from one statement to the next.
 *
 * The roll-forward is the part worth reading. A reconciliation does not re-tick
 * every line ever posted; it starts from the statement balance of the last
 * locked period and considers only lines that have never been reconciled. An
 * uncleared line from three months ago stays in the pool until it clears or is
 * written off, which is exactly the behaviour an accountant expects and the
 * reason `summarise` takes an opening balance.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { fromCents, toCents } from "@/lib/accounting-math";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";
import { summarise, statementToBook, staleUncleared, type BankLine } from "@/lib/reconciliation";
import { isIsoDate, isoDate, todayIso } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const arr = (value: unknown) => (Array.isArray(value) ? value : []);

/** Bank accounts are the only ones that can be reconciled against a statement. */
async function bankAccounts(sql: any) {
  return sql`
    select id, code, name from ledger_accounts
    where organization_id = ${ORGANIZATION_ID} and is_bank and is_active
    order by (system_key = 'bank') desc, code
  `;
}

/**
 * The last locked reconciliation before this date, which supplies the opening
 * balance. Its statement balance is the agreed starting point — using the book
 * balance instead would carry forward the very difference being proved.
 */
async function openingFor(sql: any, accountId: string, statementDate: string) {
  const rows = await sql`
    select statement_date, statement_balance from bank_reconciliations
    where bank_account_id = ${accountId} and organization_id = ${ORGANIZATION_ID}
      and status = 'Locked' and statement_date < ${statementDate}::date
    order by statement_date desc
    limit 1
  `;
  return rows.length
    ? { date: isoDate(rows[0].statement_date), balanceCents: toCents(rows[0].statement_balance) }
    : { date: "", balanceCents: 0 };
}

/**
 * Lines in play: posted movements on the account, up to the statement date,
 * that no locked reconciliation has already accounted for.
 *
 * A bank account is an asset, so a debit is money in. The signed amount is what
 * the reconciliation arithmetic works in.
 */
async function linesFor(sql: any, accountId: string, statementDate: string, reconciliationId: string): Promise<BankLine[]> {
  const rows = await sql`
    select l.id, l.debit, l.credit, l.memo, l.cleared_at, l.reconciliation_id,
           e.entry_date, e.reference, e.memo as entry_memo
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    where l.account_id = ${accountId}
      and e.organization_id = ${ORGANIZATION_ID}
      and e.status = 'Posted'
      and e.entry_date <= ${statementDate}::date
      and (l.reconciliation_id is null or l.reconciliation_id = ${reconciliationId})
    order by e.entry_date, l.line_order
  `;

  return rows.map((row: any): BankLine => ({
    id: String(row.id),
    date: isoDate(row.entry_date),
    memo: clean(row.memo) || clean(row.entry_memo),
    reference: clean(row.reference),
    amountCents: toCents(row.debit) - toCents(row.credit),
    cleared: Boolean(row.cleared_at),
    reconciliationId: row.reconciliation_id ? String(row.reconciliation_id) : null,
  }));
}

async function existingReconciliation(sql: any, accountId: string, statementDate: string) {
  const rows = await sql`
    select id, statement_date, statement_balance, book_balance, difference, status, notes, locked_at
    from bank_reconciliations
    where bank_account_id = ${accountId} and organization_id = ${ORGANIZATION_ID}
      and statement_date = ${statementDate}::date
    limit 1
  `;
  return rows[0] ?? null;
}

export async function GET(request: NextRequest) {
  try {
    await requireHRSession(["hr_admin", "finance"]);
    const sql = getDatabase();

    const accounts = await bankAccounts(sql);
    if (!accounts.length) {
      return NextResponse.json({ accounts: [], error: "No bank account is set up to reconcile." });
    }

    const requestedAccount = clean(request.nextUrl.searchParams.get("accountId"), 100);
    const account = accounts.find((row: any) => row.id === requestedAccount) ?? accounts[0];

    const requestedDate = clean(request.nextUrl.searchParams.get("statementDate"), 10);
    const statementDate = isIsoDate(requestedDate) ? requestedDate : todayIso();

    const existing = await existingReconciliation(sql, account.id, statementDate);
    const opening = await openingFor(sql, account.id, statementDate);
    const lines = await linesFor(sql, account.id, statementDate, existing?.id ?? "");

    // A saved statement balance is what the operator typed last time; without
    // one there is nothing to prove against yet, so the summary starts at zero
    // and simply reports the book position.
    const statementBalance = existing ? Number(existing.statement_balance) : 0;
    const summary = summarise(lines, statementBalance, { openingCents: opening.balanceCents });

    const history = await sql`
      select id, statement_date, statement_balance, book_balance, difference, status, locked_at
      from bank_reconciliations
      where bank_account_id = ${account.id} and organization_id = ${ORGANIZATION_ID}
      order by statement_date desc
      limit 12
    `;

    return NextResponse.json({
      accounts: accounts.map((row: any) => ({ id: row.id, code: row.code, name: row.name })),
      account: { id: account.id, code: account.code, name: account.name },
      statementDate,
      opening: { date: opening.date, balance: fromCents(opening.balanceCents) },
      reconciliation: existing ? {
        id: existing.id,
        statementBalance: Number(existing.statement_balance),
        bookBalance: Number(existing.book_balance),
        difference: Number(existing.difference),
        status: existing.status,
        notes: existing.notes || "",
        lockedAt: existing.locked_at,
      } : null,
      lines: lines.map((line) => ({ ...line, amount: fromCents(line.amountCents) })),
      summary,
      proof: statementToBook(summary),
      stale: staleUncleared(lines, statementDate).map((line) => line.id),
      history: history.map((row: any) => ({
        id: row.id,
        statementDate: isoDate(row.statement_date),
        statementBalance: Number(row.statement_balance),
        bookBalance: Number(row.book_balance),
        difference: Number(row.difference),
        status: row.status,
        lockedAt: row.locked_at,
      })),
    });
  } catch (error) {
    if (error instanceof HRAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    const reason = error instanceof Error ? error.message : "Unable to load the reconciliation.";
    return NextResponse.json({ error: reason }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireHRSession(["hr_admin", "finance"]);
    const sql = getDatabase();
    const body = await request.json();
    const operation = clean(body?.operation, 40);

    const accountId = clean(body?.accountId, 100);
    const statementDate = clean(body?.statementDate, 10);
    if (!accountId) throw new Error("Choose a bank account.");
    if (!isIsoDate(statementDate)) throw new Error("Enter the statement date.");

    const owned = await sql`
      select id from ledger_accounts
      where id = ${accountId} and organization_id = ${ORGANIZATION_ID} and is_bank
    `;
    if (!owned.length) throw new Error("That is not a bank account on this organisation.");

    const existing = await existingReconciliation(sql, accountId, statementDate);

    if (operation === "reopen") {
      if (!existing) throw new Error("There is nothing to reopen.");
      await sql`
        update bank_reconciliations set status = 'Open', locked_at = null, locked_by = null, updated_at = now()
        where id = ${existing.id}
      `;
      return NextResponse.json({ ok: true, status: "Open" });
    }

    if (operation !== "save" && operation !== "lock") throw new Error("Unsupported reconciliation operation.");
    if (existing?.status === "Locked") {
      throw new Error("That reconciliation is locked. Reopen it before changing what has cleared.");
    }

    const statementBalance = Number(body?.statementBalance ?? 0);
    if (!Number.isFinite(statementBalance)) throw new Error("Enter the balance shown on the statement.");
    const notes = clean(body?.notes, 2000);
    const clearedIds = arr(body?.clearedIds).map((id) => clean(id, 100)).filter(Boolean);

    const id = existing?.id ?? crypto.randomUUID();
    const opening = await openingFor(sql, accountId, statementDate);

    // Written before the summary is computed so the ticked lines belong to this
    // reconciliation; the summary then reflects what was actually stored rather
    // than what the client claimed.
    await sql`
      insert into bank_reconciliations (
        id, organization_id, bank_account_id, statement_date, statement_balance,
        book_balance, difference, status, notes
      ) values (
        ${id}, ${ORGANIZATION_ID}, ${accountId}, ${statementDate}::date, ${statementBalance},
        0, 0, 'Open', ${notes}
      )
      on conflict (bank_account_id, statement_date) do update
        set statement_balance = excluded.statement_balance,
            notes = excluded.notes,
            updated_at = now()
    `;

    const candidates = await linesFor(sql, accountId, statementDate, id);
    const candidateIds = new Set(candidates.map((line) => line.id));
    // Only lines this reconciliation can actually see may be ticked, so a stale
    // client cannot clear a line belonging to a locked period.
    const ticked = clearedIds.filter((lineId) => candidateIds.has(lineId));

    await sql`
      update journal_lines set cleared_at = null, reconciliation_id = null
      where reconciliation_id = ${id}
    `;
    if (ticked.length) {
      await sql`
        update journal_lines
        set cleared_at = now(), reconciliation_id = ${id}
        where id = any(${ticked}::text[])
      `;
    }

    const lines = candidates.map((line) => ({ ...line, cleared: ticked.includes(line.id) }));
    const summary = summarise(lines, statementBalance, { openingCents: opening.balanceCents });

    if (operation === "lock" && !summary.balanced) {
      throw new Error(
        `The account is out by ${summary.difference.toFixed(2)}. A reconciliation can only be locked when it proves.`,
      );
    }

    await sql`
      update bank_reconciliations
      set book_balance = ${summary.bookBalance},
          difference = ${summary.difference},
          status = ${operation === "lock" ? "Locked" : "Open"},
          locked_at = ${operation === "lock" ? new Date().toISOString() : null},
          locked_by = ${operation === "lock" ? session.userId : null},
          updated_at = now()
      where id = ${id}
    `;

    return NextResponse.json({
      ok: true,
      id,
      status: operation === "lock" ? "Locked" : "Open",
      summary,
      proof: statementToBook(summary),
    });
  } catch (error) {
    if (error instanceof HRAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    const reason = error instanceof Error ? error.message : "Unable to save the reconciliation.";
    return NextResponse.json({ error: reason }, { status: 400 });
  }
}

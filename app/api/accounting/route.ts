/**
 * Accounting workspace API: accounts, vendors, bills, payments, journal and periods.
 *
 * Follows the resource/operation shape the Business workspace already uses, so
 * the client code reads the same way. Every money movement goes through
 * lib/accounting.ts rather than writing to the journal directly.
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { AccountingError, listAccounts, postEntry, prepareEntry, voidEntry } from "@/lib/accounting";
import { agingBucket, fromCents, lineTax, toCents } from "@/lib/accounting-math";
import { backfillSalesInvoices, postSalesInvoice, unpostedInvoiceCount } from "@/lib/invoice-posting";
import { backfillSettlements, postCashEntry, postSettlementPayment, unreconciledCashCount } from "@/lib/cash-posting";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";

const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const arr = (value: unknown) => (Array.isArray(value) ? value : []);
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const today = () => new Date().toISOString().slice(0, 10);

function tablesMissing(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /ledger_accounts|journal_entries|journal_lines|vendors|bills|payments|fiscal_periods/i.test(message);
}

function failure(error: unknown) {
  console.error("Accounting request failed", error);
  if (error instanceof HRAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof AccountingError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  if (["23503", "23514"].includes(code)) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Accounting data failed a database validation." }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "Accounting request failed.";
  return NextResponse.json(
    {
      error: tablesMissing(error)
        ? "Accounting tables are not ready. Apply db/migrations/0008_accounting_core.sql to the Neon database."
        : message,
    },
    { status: tablesMissing(error) ? 503 : 500 },
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

async function snapshot() {
  const sql = getDatabase();
  const [
    accounts, vendors, bills, payments, periods, entries,
    unpostedInvoices, unreconciledCash, cashRows, settlementRows, customerRows,
  ] = await Promise.all([
    listAccounts(),
    sql`
      select v.*, a.name as default_account_name
      from vendors v
      left join ledger_accounts a on a.id = v.default_expense_account_id
      where v.organization_id = ${ORGANIZATION_ID}
      order by v.status, v.name
    `,
    sql`
      select b.*, v.name as vendor_name,
        (b.total - b.amount_paid) as balance
      from bills b join vendors v on v.id = b.vendor_id
      where b.organization_id = ${ORGANIZATION_ID}
      order by b.bill_date desc, b.created_at desc
      limit 300
    `,
    sql`
      select p.*, v.name as vendor_name, c.name as customer_name, a.name as bank_account_name
      from payments p
      left join vendors v on v.id = p.vendor_id
      left join customers c on c.id = p.customer_id
      left join ledger_accounts a on a.id = p.bank_account_id
      where p.organization_id = ${ORGANIZATION_ID}
      order by p.payment_date desc, p.created_at desc
      limit 200
    `,
    sql`
      select * from fiscal_periods
      where organization_id = ${ORGANIZATION_ID}
      order by year desc, month desc
      limit 36
    `,
    sql`
      select e.*, coalesce(sum(l.debit), 0) as total
      from journal_entries e
      left join journal_lines l on l.entry_id = e.id
      where e.organization_id = ${ORGANIZATION_ID}
      group by e.id
      order by e.entry_date desc, e.created_at desc
      limit 100
    `,
    // Surfaced so revenue the ledger cannot see is visible in the workspace
    // rather than silently missing from every report.
    unpostedInvoiceCount(),
    unreconciledCashCount(),
    sql`
      select f.*, c.name as customer_name, b.name as bank_account_name, a.name as ledger_account_name
      from finance_transactions f
      left join customers c on c.id = f.customer_id
      left join ledger_accounts b on b.id = f.bank_account_id
      left join ledger_accounts a on a.id = f.ledger_account_id
      where (f.customer_id is null or c.organization_id = ${ORGANIZATION_ID})
      order by f.transaction_date desc, f.created_at desc
      limit 200
    `,
    sql`
      select s.*, c.name as customer_name
      from settlements s join customers c on c.id = s.customer_id
      where c.organization_id = ${ORGANIZATION_ID}
      order by s.period_end desc
      limit 100
    `,
    // Needed by the settlement editor, which now lives here.
    sql`
      select id, name from customers
      where organization_id = ${ORGANIZATION_ID}
      order by (status = 'Active') desc, name
    `,
  ]);

  return {
    accounts,
    vendors: vendors.map((row: any) => ({
      id: row.id, name: row.name, tin: row.tin, sstNumber: row.sst_number,
      registrationNumber: row.registration_number, email: row.email, phone: row.phone,
      paymentTermsDays: Number(row.payment_terms_days), currency: row.currency,
      defaultExpenseAccountId: row.default_expense_account_id || "",
      defaultAccountName: row.default_account_name || "",
      status: row.status, notes: row.notes,
      city: row.city, state: row.state, postcode: row.postcode,
      addressLine1: row.address_line1, addressLine2: row.address_line2,
      countryCode: row.country_code,
    })),
    bills: bills.map((row: any) => ({
      id: row.id, vendorId: row.vendor_id, vendorName: row.vendor_name,
      billNumber: row.bill_number, reference: row.reference,
      billDate: String(row.bill_date).slice(0, 10),
      dueDate: row.due_date ? String(row.due_date).slice(0, 10) : "",
      currency: row.currency, subtotal: Number(row.subtotal), taxAmount: Number(row.tax_amount),
      total: Number(row.total), amountPaid: Number(row.amount_paid), balance: Number(row.balance),
      status: row.status, notes: row.notes, captureId: row.capture_id || "",
      journalEntryId: row.journal_entry_id || "",
      aging: row.due_date && Number(row.balance) > 0 ? agingBucket(String(row.due_date).slice(0, 10)) : "current",
    })),
    payments: payments.map((row: any) => ({
      id: row.id, direction: row.direction, paymentDate: String(row.payment_date).slice(0, 10),
      bankAccountId: row.bank_account_id, bankAccountName: row.bank_account_name || "",
      vendorId: row.vendor_id || "", vendorName: row.vendor_name || "",
      customerId: row.customer_id || "", customerName: row.customer_name || "",
      amount: Number(row.amount), unallocated: Number(row.unallocated),
      method: row.method, reference: row.reference, notes: row.notes,
    })),
    periods: periods.map((row: any) => ({
      id: row.id, year: Number(row.year), month: Number(row.month), status: row.status,
      closedAt: row.closed_at, closedBy: row.closed_by || "",
    })),
    entries: entries.map((row: any) => ({
      id: row.id, date: String(row.entry_date).slice(0, 10), memo: row.memo,
      reference: row.reference, sourceType: row.source_type, sourceId: row.source_id || "",
      status: row.status, total: Number(row.total),
    })),
    unpostedInvoices,
    unreconciledCash,
    transactions: cashRows.map((row: any) => ({
      id: row.id, type: row.type, category: row.category,
      amount: Number(row.amount), date: String(row.transaction_date).slice(0, 10),
      status: row.status, reference: row.reference || "", notes: row.notes || "",
      customerId: row.customer_id || "", customerName: row.customer_name || "",
      bankAccountName: row.bank_account_name || "", ledgerAccountName: row.ledger_account_name || "",
      sourceType: row.source_type || "",
      // A row without an entry predates the ledger, or came from a path that no
      // longer writes here. Shown so the difference is visible, not hidden.
      onLedger: Boolean(row.journal_entry_id),
    })),
    settlements: settlementRows.map((row: any) => ({
      id: row.id, customerId: row.customer_id, customerName: row.customer_name,
      periodStart: String(row.period_start).slice(0, 10), periodEnd: String(row.period_end).slice(0, 10),
      units: Number(row.units), feePerUnit: Number(row.fee_per_unit),
      adReimbursement: Number(row.ad_reimbursement), incentive: Number(row.incentive),
      total: Number(row.units) * Number(row.fee_per_unit) + Number(row.ad_reimbursement) + Number(row.incentive),
      status: row.status, dueDate: row.due_date ? String(row.due_date).slice(0, 10) : "",
      onLedger: Boolean(row.journal_entry_id),
    })),
    customers: customerRows.map((row: any) => ({ id: row.id, name: row.name })),
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireHRSession(["hr_admin", "finance"]);
    const entryId = clean(request.nextUrl.searchParams.get("entryId"), 100);
    if (entryId) {
      const sql = getDatabase();
      const lines = await sql`
        select l.*, a.code, a.name as account_name
        from journal_lines l join ledger_accounts a on a.id = l.account_id
        where l.entry_id = ${entryId}
          and a.organization_id = ${ORGANIZATION_ID}
          and exists (
            select 1 from journal_entries e
            where e.id = l.entry_id and e.organization_id = ${ORGANIZATION_ID}
          )
        order by l.line_order
      `;
      return NextResponse.json({
        lines: lines.map((row: any) => ({
          id: row.id, accountId: row.account_id, accountCode: row.code, accountName: row.account_name,
          debit: Number(row.debit), credit: Number(row.credit), memo: row.memo,
          customerId: row.customer_id || "", vendorId: row.vendor_id || "",
        })),
      });
    }
    return NextResponse.json(await snapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** Computes bill totals from its lines so the header can never drift from them. */
function billTotals(lines: any[]) {
  let subtotalCents = 0;
  let taxCents = 0;

  const prepared = lines.map((line, index) => {
    const quantity = line.quantity === undefined || line.quantity === "" ? 1 : num(line.quantity);
    const unitPrice = num(line.unitPrice);
    const taxRate = num(line.taxRate);
    if (quantity <= 0) throw new AccountingError(`Bill line ${index + 1} needs a quantity greater than zero.`);
    if (unitPrice < 0) throw new AccountingError(`Bill line ${index + 1} cannot have a negative unit price.`);
    if (taxRate < 0 || taxRate > 100) throw new AccountingError(`Bill line ${index + 1} needs a tax rate between 0 and 100%.`);
    const amountCents = toCents(quantity * unitPrice);
    const { taxCents: lineTaxCents } = lineTax({ amountCents, ratePercent: taxRate });
    subtotalCents += amountCents;
    taxCents += lineTaxCents;
    return {
      accountId: clean(line.accountId, 100) || null,
      description: clean(line.description, 400),
      quantity,
      unitPrice,
      taxCode: clean(line.taxCode, 20),
      taxRate,
      amount: fromCents(amountCents),
      taxAmount: fromCents(lineTaxCents),
      customerId: clean(line.customerId, 100) || null,
      projectId: clean(line.projectId, 100) || null,
      order: index,
    };
  });

  return {
    lines: prepared,
    subtotal: fromCents(subtotalCents),
    taxAmount: fromCents(taxCents),
    total: fromCents(subtotalCents + taxCents),
  };
}

/**
 * Posts a bill: the expense (and recoverable tax) is recognised now, and the
 * amount owed sits in accounts payable until it is paid.
 */
function billEntryInput(bill: any, lines: any[], vendorName: string, createdBy: string) {
  const journalLines: any[] = [];

  for (const line of lines) {
    if (toCents(line.amount) === 0) continue;
    journalLines.push({
      accountId: line.accountId || undefined,
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
    memo: `${vendorName} ${bill.billNumber}`.trim(),
    vendorId: bill.vendorId,
  });

  return {
    date: bill.billDate,
    reference: bill.billNumber,
    memo: `Bill from ${vendorName}`,
    sourceType: "bill",
    sourceId: bill.id,
    createdBy,
    lines: journalLines,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireHRSession(["hr_admin", "finance"]);
    const body = await request.json();
    const resource = clean(body.resource, 40);
    const operation = clean(body.operation, 40) || "create";
    const data = body.data && typeof body.data === "object" ? body.data : {};
    const sql = getDatabase();

    // ---- vendors ----------------------------------------------------------
    if (resource === "vendor") {
      const name = clean(data.name, 200);
      if (!name) return NextResponse.json({ error: "A vendor name is required." }, { status: 400 });

      if (operation === "create") {
        const rows = await sql`
          insert into vendors (
            organization_id, name, registration_number, tin, sst_number, email, phone,
            address_line1, address_line2, city, state, postcode, country_code,
            payment_terms_days, default_expense_account_id, currency, notes
          ) values (
            ${ORGANIZATION_ID}, ${name}, ${clean(data.registrationNumber, 60)}, ${clean(data.tin, 60)},
            ${clean(data.sstNumber, 60)}, ${clean(data.email, 200)}, ${clean(data.phone, 60)},
            ${clean(data.addressLine1, 200)}, ${clean(data.addressLine2, 200)}, ${clean(data.city, 100)},
            ${clean(data.state, 100)}, ${clean(data.postcode, 20)}, ${clean(data.countryCode, 3) || "MYS"},
            ${Math.max(0, Math.min(365, num(data.paymentTermsDays) || 30))},
            ${clean(data.defaultExpenseAccountId, 100) || null}, ${clean(data.currency, 3) || "MYR"},
            ${clean(data.notes, 2000)}
          ) returning id
        `;
        return NextResponse.json({ id: rows[0].id, ...(await snapshot()) }, { status: 201 });
      }

      const id = clean(data.id, 100);
      if (!id) return NextResponse.json({ error: "A vendor ID is required." }, { status: 400 });
      await sql`
        update vendors set
          name = ${name}, registration_number = ${clean(data.registrationNumber, 60)},
          tin = ${clean(data.tin, 60)}, sst_number = ${clean(data.sstNumber, 60)},
          email = ${clean(data.email, 200)}, phone = ${clean(data.phone, 60)},
          address_line1 = ${clean(data.addressLine1, 200)}, address_line2 = ${clean(data.addressLine2, 200)},
          city = ${clean(data.city, 100)}, state = ${clean(data.state, 100)},
          postcode = ${clean(data.postcode, 20)}, country_code = ${clean(data.countryCode, 3) || "MYS"},
          payment_terms_days = ${Math.max(0, Math.min(365, num(data.paymentTermsDays) || 30))},
          default_expense_account_id = ${clean(data.defaultExpenseAccountId, 100) || null},
          status = ${clean(data.status, 20) === "Inactive" ? "Inactive" : "Active"},
          notes = ${clean(data.notes, 2000)}
        where id = ${id} and organization_id = ${ORGANIZATION_ID}
      `;
      return NextResponse.json(await snapshot());
    }

    // ---- bills ------------------------------------------------------------
    if (resource === "bill") {
      if (operation === "create") {
        const vendorId = clean(data.vendorId, 100);
        const billDate = clean(data.billDate, 10);
        if (!vendorId) return NextResponse.json({ error: "Select a vendor." }, { status: 400 });
        if (!isDate(billDate)) return NextResponse.json({ error: "A valid bill date is required." }, { status: 400 });

        const vendors = await sql`select id, name, payment_terms_days from vendors where id = ${vendorId} and organization_id = ${ORGANIZATION_ID}`;
        if (!vendors.length) return NextResponse.json({ error: "Vendor was not found." }, { status: 404 });

        const totals = billTotals(arr(data.lines));
        if (toCents(totals.total) <= 0) return NextResponse.json({ error: "A bill needs at least one line with an amount." }, { status: 400 });

        const billNumber = clean(data.billNumber, 100);
        // The vendor's own number is what identifies the document, so the same
        // invoice entered twice is caught here rather than in the ledger.
        if (billNumber) {
          const existing = await sql`
            select id from bills where vendor_id = ${vendorId} and lower(bill_number) = lower(${billNumber})
          `;
          if (existing.length) {
            return NextResponse.json(
              { error: `Bill ${billNumber} already exists for this vendor.`, duplicateOf: existing[0].id },
              { status: 409 },
            );
          }
        }

        const dueDate = isDate(clean(data.dueDate, 10))
          ? clean(data.dueDate, 10)
          : new Date(new Date(`${billDate}T00:00:00Z`).getTime() + Number(vendors[0].payment_terms_days || 30) * 86_400_000)
              .toISOString().slice(0, 10);

        const billId = randomUUID();
        const entry = await prepareEntry(
          billEntryInput(
            { id: billId, vendorId, billDate, billNumber, total: totals.total, taxAmount: totals.taxAmount },
            totals.lines,
            vendors[0].name,
            session.userId,
          ),
          { sql },
        );
        const statements: any[] = [
          sql`
            insert into bills (
              id, organization_id, vendor_id, bill_number, reference, bill_date, due_date,
              currency, subtotal, tax_amount, total, status, customer_id, project_id, capture_id, notes
            ) values (
              ${billId}, ${ORGANIZATION_ID}, ${vendorId}, ${billNumber}, ${clean(data.reference, 100)},
              ${billDate}, ${dueDate}, ${clean(data.currency, 3) || "MYR"},
              ${totals.subtotal}, ${totals.taxAmount}, ${totals.total}, 'Approved',
              ${clean(data.customerId, 100) || null}, ${clean(data.projectId, 100) || null},
              ${clean(data.captureId, 100) || null}, ${clean(data.notes, 2000)}
            )
          `,
        ];
        for (const line of totals.lines) {
          statements.push(sql`
            insert into bill_lines (
              bill_id, account_id, description, quantity, unit_price, tax_code, tax_rate,
              amount, tax_amount, customer_id, project_id, line_order
            ) values (
              ${billId}, ${line.accountId}, ${line.description}, ${line.quantity}, ${line.unitPrice},
              ${line.taxCode}, ${line.taxRate}, ${line.amount}, ${line.taxAmount},
              ${line.customerId}, ${line.projectId}, ${line.order}
            )
          `);
        }
        statements.push(...entry.statements);
        statements.push(sql`update bills set journal_entry_id = ${entry.id} where id = ${billId}`);
        if (clean(data.captureId, 100)) {
          statements.push(sql`
            update document_captures set status = 'Posted', bill_id = ${billId}, journal_entry_id = ${entry.id}, reviewed_at = now()
            where id = ${clean(data.captureId, 100)} and organization_id = ${ORGANIZATION_ID}
          `);
        }
        await sql.transaction(statements);
        return NextResponse.json({ id: billId, journalEntryId: entry.id, ...(await snapshot()) }, { status: 201 });
      }

      if (operation === "void") {
        const id = clean(data.id, 100);
        const bills = await sql`select * from bills where id = ${id} and organization_id = ${ORGANIZATION_ID}`;
        if (!bills.length) return NextResponse.json({ error: "Bill was not found." }, { status: 404 });
        if (Number(bills[0].amount_paid) > 0) {
          return NextResponse.json({ error: "Unallocate the payments before voiding this bill." }, { status: 400 });
        }
        if (bills[0].journal_entry_id) await voidEntry(bills[0].journal_entry_id, { memo: `Void bill ${bills[0].bill_number}`, createdBy: session.userId });
        await sql`update bills set status = 'Void' where id = ${id}`;
        return NextResponse.json(await snapshot());
      }
    }

    // ---- payments ---------------------------------------------------------
    if (resource === "payment" && operation === "create") {
      const direction = clean(data.direction, 5) === "in" ? "in" : "out";
      const paymentDate = clean(data.paymentDate, 10) || today();
      const bankAccountId = clean(data.bankAccountId, 100);
      const amount = num(data.amount);

      if (!isDate(paymentDate)) return NextResponse.json({ error: "A valid payment date is required." }, { status: 400 });
      if (!bankAccountId) return NextResponse.json({ error: "Select the bank or cash account used." }, { status: 400 });
      if (toCents(amount) <= 0) return NextResponse.json({ error: "A payment must be for more than zero." }, { status: 400 });

      const bankAccounts = await sql`
        select id from ledger_accounts
        where id = ${bankAccountId} and organization_id = ${ORGANIZATION_ID}
          and type = 'asset' and is_bank and is_active
      `;
      if (!bankAccounts.length) return NextResponse.json({ error: "The selected bank or cash account is not available." }, { status: 400 });

      const allocations = arr(data.allocations).map((item: any, index: number) => {
        const billId = clean(item.billId, 100) || null;
        const salesDocumentId = clean(item.salesDocumentId, 100) || null;
        const allocationAmount = num(item.amount);
        if ((billId ? 1 : 0) + (salesDocumentId ? 1 : 0) !== 1) {
          throw new AccountingError(`Allocation ${index + 1} must name exactly one bill or sales invoice.`);
        }
        if (toCents(allocationAmount) <= 0) {
          throw new AccountingError(`Allocation ${index + 1} must be greater than zero.`);
        }
        return { billId, salesDocumentId, amount: allocationAmount };
      });

      const allocatedCents = allocations.reduce((sum: number, item: any) => sum + toCents(item.amount), 0);
      if (allocatedCents > toCents(amount)) {
        return NextResponse.json({ error: "Allocations exceed the payment amount." }, { status: 400 });
      }

      const paymentId = randomUUID();
      let vendorId = clean(data.vendorId, 100) || null;
      let customerId = clean(data.customerId, 100) || null;

      if (vendorId) {
        const vendors = await sql`select id from vendors where id = ${vendorId} and organization_id = ${ORGANIZATION_ID}`;
        if (!vendors.length) return NextResponse.json({ error: "Vendor was not found." }, { status: 404 });
      }
      if (customerId) {
        const customers = await sql`select id from customers where id = ${customerId} and organization_id = ${ORGANIZATION_ID}`;
        if (!customers.length) return NextResponse.json({ error: "Customer was not found." }, { status: 404 });
      }

      const billAllocations = allocations.filter((item: any) => item.billId);
      const invoiceAllocations = allocations.filter((item: any) => item.salesDocumentId);
      if (direction === "out" && invoiceAllocations.length) {
        return NextResponse.json({ error: "Money-out payments can only be allocated to supplier bills." }, { status: 400 });
      }
      if (direction === "in" && billAllocations.length) {
        return NextResponse.json({ error: "Money-in receipts can only be allocated to customer invoices." }, { status: 400 });
      }

      if (direction === "out" && billAllocations.length) {
        const billIds = billAllocations.map((item: any) => item.billId);
        if (new Set(billIds).size !== billIds.length) return NextResponse.json({ error: "A bill can only be allocated once per payment." }, { status: 400 });
        const bills = await sql`
          select id, vendor_id, total, amount_paid, status
          from bills
          where organization_id = ${ORGANIZATION_ID} and id = any(${billIds})
        `;
        if (bills.length !== billIds.length) return NextResponse.json({ error: "One or more bills were not found." }, { status: 404 });
        const billsById = new Map(bills.map((bill: any) => [bill.id, bill]));
        const vendorsForAllocation = new Set<string>();
        for (const allocation of billAllocations) {
          const bill: any = billsById.get(allocation.billId);
          if (["Void", "Draft"].includes(bill.status)) return NextResponse.json({ error: "Draft or void bills cannot receive payments." }, { status: 400 });
          const outstandingCents = toCents(bill.total) - toCents(bill.amount_paid);
          if (toCents(allocation.amount) > outstandingCents) {
            return NextResponse.json({ error: `Allocation for bill ${bill.id} exceeds its outstanding balance.` }, { status: 400 });
          }
          vendorsForAllocation.add(bill.vendor_id);
          if (vendorId && vendorId !== bill.vendor_id) {
            return NextResponse.json({ error: "The selected vendor does not match the allocated bill." }, { status: 400 });
          }
        }
        if (!vendorId) {
          if (vendorsForAllocation.size !== 1) return NextResponse.json({ error: "Select the vendor before allocating a payment." }, { status: 400 });
          vendorId = Array.from(vendorsForAllocation)[0];
        }
      }

      if (direction === "in" && invoiceAllocations.length) {
        const documentIds = invoiceAllocations.map((item: any) => item.salesDocumentId);
        if (new Set(documentIds).size !== documentIds.length) return NextResponse.json({ error: "A customer invoice can only be allocated once per receipt." }, { status: 400 });
        const documents = await sql`
          select d.id, d.customer_id, d.value, d.status,
            coalesce(sum(pa.amount) filter (where p.organization_id = ${ORGANIZATION_ID}), 0) as allocated
          from sales_documents d
          join customers c on c.id = d.customer_id and c.organization_id = ${ORGANIZATION_ID}
          left join payment_allocations pa on pa.sales_document_id = d.id
          left join payments p on p.id = pa.payment_id
          where d.id = any(${documentIds}) and d.type = 'Invoice'
          group by d.id, d.customer_id, d.value, d.status
        `;
        if (documents.length !== documentIds.length) return NextResponse.json({ error: "One or more customer invoices were not found." }, { status: 404 });
        const documentsById = new Map(documents.map((document: any) => [document.id, document]));
        const customersForAllocation = new Set<string>();
        for (const allocation of invoiceAllocations) {
          const document: any = documentsById.get(allocation.salesDocumentId);
          if (["Draft", "Cancelled"].includes(document.status)) return NextResponse.json({ error: "Draft or cancelled invoices cannot receive payments." }, { status: 400 });
          const outstandingCents = toCents(document.value) - toCents(document.allocated);
          if (toCents(allocation.amount) > outstandingCents) {
            return NextResponse.json({ error: `Allocation for invoice ${document.id} exceeds its outstanding balance.` }, { status: 400 });
          }
          customersForAllocation.add(document.customer_id);
          if (customerId && customerId !== document.customer_id) {
            return NextResponse.json({ error: "The selected customer does not match the allocated invoice." }, { status: 400 });
          }
        }
        if (!customerId) {
          if (customersForAllocation.size !== 1) return NextResponse.json({ error: "Select the customer before allocating a receipt." }, { status: 400 });
          customerId = Array.from(customersForAllocation)[0];
        }
      }

      // Money out clears the payable and reduces the bank; money in does the
      // mirror image against receivables.
      const entry = await prepareEntry({
        date: paymentDate,
        reference: clean(data.reference, 100),
        memo: clean(data.notes, 400) || (direction === "out" ? "Supplier payment" : "Customer receipt"),
        sourceType: "payment",
        sourceId: paymentId,
        createdBy: session.userId,
        lines: direction === "out"
          ? [
            { accountKey: "accounts_payable", debit: amount, vendorId },
            { accountId: bankAccountId, credit: amount },
          ]
          : [
            { accountId: bankAccountId, debit: amount },
            { accountKey: "accounts_receivable", credit: amount, customerId },
          ],
      }, { sql });

      const statements: any[] = [
        ...entry.statements,
        sql`
          insert into payments (
            id, organization_id, direction, payment_date, bank_account_id, customer_id, vendor_id,
            amount, currency, method, reference, unallocated, journal_entry_id, notes
          ) values (
            ${paymentId}, ${ORGANIZATION_ID}, ${direction}, ${paymentDate}, ${bankAccountId},
            ${customerId}, ${vendorId}, ${amount}, ${clean(data.currency, 3) || "MYR"},
            ${clean(data.method, 60) || "Bank transfer"}, ${clean(data.reference, 100)},
            ${fromCents(toCents(amount) - allocatedCents)}, ${entry.id}, ${clean(data.notes, 2000)}
          )
        `,
      ];
      for (const allocation of allocations) {
        statements.push(sql`
          insert into payment_allocations (payment_id, bill_id, sales_document_id, amount)
          values (${paymentId}, ${allocation.billId}, ${allocation.salesDocumentId}, ${allocation.amount})
        `);
        if (allocation.billId) {
          // Keeping amount_paid on the bill means aging does not have to
          // re-aggregate allocations on every read.
          statements.push(sql`
            update bills set
              amount_paid = amount_paid + ${allocation.amount},
              status = case
                when amount_paid + ${allocation.amount} >= total then 'Paid'
                when amount_paid + ${allocation.amount} > 0 then 'Partially paid'
                else status end
            where id = ${allocation.billId} and organization_id = ${ORGANIZATION_ID}
          `);
        } else if (allocation.salesDocumentId) {
          statements.push(sql`
            update sales_documents
            set status = case
              when coalesce((select sum(pa.amount) from payment_allocations pa where pa.sales_document_id = sales_documents.id), 0) >= value then 'Paid'
              when coalesce((select sum(pa.amount) from payment_allocations pa where pa.sales_document_id = sales_documents.id), 0) > 0 then 'Partially paid'
              else status end
            where id = ${allocation.salesDocumentId}
          `);
        }
      }
      await sql.transaction(statements);
      return NextResponse.json({ id: paymentId, journalEntryId: entry.id, ...(await snapshot()) }, { status: 201 });
    }

    // ---- manual journal ---------------------------------------------------
    if (resource === "journal") {
      if (operation === "void") {
        await voidEntry(clean(data.id, 100), { memo: clean(data.reason, 300), createdBy: session.userId });
        return NextResponse.json(await snapshot());
      }
      const entry = await postEntry({
        date: clean(data.date, 10),
        memo: clean(data.memo, 400),
        reference: clean(data.reference, 100),
        sourceType: "manual",
        createdBy: session.userId,
        lines: arr(data.lines).map((line: any) => ({
          accountId: clean(line.accountId, 100),
          debit: num(line.debit),
          credit: num(line.credit),
          memo: clean(line.memo, 300),
          customerId: clean(line.customerId, 100) || null,
        })),
      });
      return NextResponse.json({ id: entry.id, ...(await snapshot()) }, { status: 201 });
    }

    // ---- periods ----------------------------------------------------------
    if (resource === "period") {
      const year = Math.trunc(num(data.year));
      const month = Math.trunc(num(data.month));
      if (!year || month < 1 || month > 12) return NextResponse.json({ error: "A valid year and month are required." }, { status: 400 });
      if (!["close", "open"].includes(operation)) return NextResponse.json({ error: "Use close or open for a fiscal period." }, { status: 400 });
      const status = operation === "close" ? "Closed" : "Open";
      const closedAt = status === "Closed" ? new Date().toISOString() : null;
      await sql`
        insert into fiscal_periods (organization_id, year, month, status, closed_at, closed_by)
        values (${ORGANIZATION_ID}, ${year}, ${month}, ${status}, ${closedAt}, ${status === "Closed" ? session.userId : null})
        on conflict (organization_id, year, month)
        do update set status = ${status}, closed_at = ${closedAt}, closed_by = ${status === "Closed" ? session.userId : null}
      `;
      return NextResponse.json(await snapshot());
    }

    // ---- direct cash movements --------------------------------------------
    if (resource === "cash" && operation === "create") {
      const result = await postCashEntry({
        direction: clean(data.direction, 5) === "in" ? "in" : "out",
        date: clean(data.date, 10) || today(),
        amount: num(data.amount),
        bankAccountId: clean(data.bankAccountId, 100),
        ledgerAccountId: clean(data.ledgerAccountId, 100),
        reference: clean(data.reference, 100),
        memo: clean(data.memo, 400),
        customerId: clean(data.customerId, 100) || null,
        vendorId: clean(data.vendorId, 100) || null,
        createdBy: session.userId,
      });
      return NextResponse.json({ ...result, ...(await snapshot()) }, { status: 201 });
    }

    // ---- settlements ------------------------------------------------------
    if (resource === "settlement") {
      // Settlements are created and edited here now: they are units times a fee
      // plus reimbursement and incentive, with no workflow outside the money.
      if (operation === "create" || operation === "update") {
        const customerId = clean(data.customerId, 100);
        const periodStart = clean(data.periodStart, 10);
        const periodEnd = clean(data.periodEnd, 10);
        if (!customerId) return NextResponse.json({ error: "Select a client." }, { status: 400 });
        if (!isDate(periodStart) || !isDate(periodEnd)) return NextResponse.json({ error: "A valid period start and end are required." }, { status: 400 });
        if (periodEnd < periodStart) return NextResponse.json({ error: "The period cannot end before it starts." }, { status: 400 });

        const owned = await sql`select id from customers where id = ${customerId} and organization_id = ${ORGANIZATION_ID}`;
        if (!owned.length) return NextResponse.json({ error: "Client was not found." }, { status: 404 });

        const values = {
          units: Math.max(0, num(data.units)),
          feePerUnit: Math.max(0, num(data.feePerUnit)),
          adReimbursement: Math.max(0, num(data.adReimbursement)),
          incentive: Math.max(0, num(data.incentive)),
          dueDate: isDate(clean(data.dueDate, 10)) ? clean(data.dueDate, 10) : null,
          notes: clean(data.notes, 2000),
        };

        if (operation === "create") {
          const rows = await sql`
            insert into settlements (customer_id, period_start, period_end, units, fee_per_unit, ad_reimbursement, incentive, status, due_date, notes)
            values (${customerId}, ${periodStart}, ${periodEnd}, ${values.units}, ${values.feePerUnit},
                    ${values.adReimbursement}, ${values.incentive}, 'Draft', ${values.dueDate}, ${values.notes})
            returning id
          `;
          return NextResponse.json({ id: rows[0].id, ...(await snapshot()) }, { status: 201 });
        }

        const id = clean(data.id, 100);
        // A posted settlement's figures are on the ledger; changing them here
        // would leave the entry describing something that no longer exists.
        const current = await sql`select journal_entry_id from settlements where id = ${id}`;
        if (!current.length) return NextResponse.json({ error: "Settlement was not found." }, { status: 404 });
        if (current[0].journal_entry_id) {
          return NextResponse.json({ error: "This settlement is on the ledger. Void its journal entry before editing it." }, { status: 409 });
        }

        await sql`
          update settlements set customer_id = ${customerId}, period_start = ${periodStart}, period_end = ${periodEnd},
            units = ${values.units}, fee_per_unit = ${values.feePerUnit}, ad_reimbursement = ${values.adReimbursement},
            incentive = ${values.incentive}, due_date = ${values.dueDate}, notes = ${values.notes}
          where id = ${id}
        `;
        return NextResponse.json(await snapshot());
      }

      if (operation === "advance") {
        const id = clean(data.id, 100);
        const rows = await sql`
          update settlements
          set status = case status when 'Draft' then 'Verified' when 'Verified' then 'Invoiced' else status end
          where id = ${id} returning id
        `;
        if (!rows.length) return NextResponse.json({ error: "Settlement was not found." }, { status: 404 });
        return NextResponse.json(await snapshot());
      }

      if (operation === "mark_paid") {
        const id = clean(data.id, 100);
        const rows = await sql`update settlements set status = 'Paid' where id = ${id} returning id`;
        if (!rows.length) return NextResponse.json({ error: "Settlement was not found." }, { status: 404 });
        const outcome = await postSettlementPayment(id, {
          createdBy: session.userId,
          bankAccountId: clean(data.bankAccountId, 100),
        });
        return NextResponse.json({
          ...(await snapshot()),
          ...(outcome.status === "failed" ? { ledgerError: outcome.reason } : {}),
        });
      }

      if (operation === "backfill") {
        const result = await backfillSettlements({ createdBy: session.userId });
        return NextResponse.json({ ...result, ...(await snapshot()) });
      }
      if (operation === "post") {
        const outcome = await postSettlementPayment(clean(data.id, 100), {
          createdBy: session.userId,
          bankAccountId: clean(data.bankAccountId, 100),
        });
        if (outcome.status === "failed") return NextResponse.json({ error: outcome.reason }, { status: 400 });
        return NextResponse.json({ ...outcome, ...(await snapshot()) });
      }
    }

    // ---- invoices ---------------------------------------------------------
    if (resource === "invoice") {
      // Invoices raised before this posting path existed carry real revenue the
      // ledger cannot see. Each posts at its own issue date so it lands in the
      // period it belongs to, not today.
      if (operation === "backfill") {
        const result = await backfillSalesInvoices({ createdBy: session.userId });
        return NextResponse.json({ ...result, ...(await snapshot()) });
      }
      if (operation === "post") {
        const outcome = await postSalesInvoice(clean(data.id, 100), { createdBy: session.userId });
        if (outcome.status === "failed") return NextResponse.json({ error: outcome.reason }, { status: 400 });
        return NextResponse.json({ ...outcome, ...(await snapshot()) });
      }
    }

    // ---- accounts ---------------------------------------------------------
    if (resource === "account" && operation === "create") {
      const code = clean(data.code, 20);
      const name = clean(data.name, 200);
      const type = clean(data.type, 20);
      const isBank = data.isBank === true || data.isBank === "true";
      if (!code || !name) return NextResponse.json({ error: "An account code and name are required." }, { status: 400 });
      if (!["asset", "liability", "equity", "income", "expense"].includes(type)) {
        return NextResponse.json({ error: "Select a valid account type." }, { status: 400 });
      }
      if (isBank && type !== "asset") {
        return NextResponse.json({ error: "Bank and cash accounts must be asset accounts." }, { status: 400 });
      }
      const rows = await sql`
        insert into ledger_accounts (organization_id, code, name, type, subtype, is_bank, bank_name, account_number, description)
        values (
          ${ORGANIZATION_ID}, ${code}, ${name}, ${type}, ${clean(data.subtype, 60)},
          ${isBank}, ${clean(data.bankName, 120)}, ${clean(data.accountNumber, 60)},
          ${clean(data.description, 500)}
        )
        on conflict (organization_id, code) do nothing
        returning id
      `;
      if (!rows.length) return NextResponse.json({ error: `Account code ${code} already exists.` }, { status: 409 });
      return NextResponse.json(await snapshot(), { status: 201 });
    }

    return NextResponse.json({ error: "Unsupported accounting operation." }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}

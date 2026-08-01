import assert from "node:assert/strict";
import test from "node:test";
import { checkBalance, toCents } from "./accounting-math.ts";
import {
  billEntryInput,
  creditNoteEntryInput,
  invoiceAmounts,
  isIssuedCreditNote,
  isIssuedInvoice,
  isPostableSalesDocument,
  paymentEntryInput,
  salesDocumentEntryInput,
  salesInvoiceEntryInput,
} from "./accounting-entries.ts";

const sumBy = (lines: any[], side: "debit" | "credit") =>
  lines.reduce((sum, line) => sum + toCents(line[side]), 0);
const lineFor = (lines: any[], key: string) => lines.find((line) => line.accountKey === key);

const invoice = {
  id: "inv-1",
  customerId: "cust-1",
  issueDate: "2026-07-15",
  reference: "INV-0001",
  title: "July retainer",
  netAmount: 5000,
  taxAmount: 400,
  total: 5400,
};

test("an invoice debits receivables and credits income plus output tax", () => {
  const entry = salesInvoiceEntryInput(invoice, "Chef Ammar");

  assert.equal(lineFor(entry.lines, "accounts_receivable").debit, 5400, "the client owes the gross amount");
  assert.equal(lineFor(entry.lines, "sales_income").credit, 5000, "revenue is net of tax");
  assert.equal(lineFor(entry.lines, "tax_output").credit, 400, "tax is a liability, not income");
  assert.equal(entry.sourceType, "invoice");
  assert.equal(entry.sourceId, "inv-1");
});

test("the invoice entry balances", () => {
  const entry = salesInvoiceEntryInput(invoice, "Chef Ammar");
  const result = checkBalance(entry.lines);
  assert.equal(result.ok, true);
  assert.equal(sumBy(entry.lines, "debit"), sumBy(entry.lines, "credit"));
});

test("revenue and receivables carry the customer, so profitability can attribute them", () => {
  const entry = salesInvoiceEntryInput(invoice, "Chef Ammar");
  for (const key of ["accounts_receivable", "sales_income"]) {
    assert.equal(lineFor(entry.lines, key).customerId, "cust-1", `${key} is tagged to the customer`);
  }
});

test("a zero-tax invoice omits the tax line rather than posting a zero", () => {
  const entry = salesInvoiceEntryInput({ ...invoice, netAmount: 5400, taxAmount: 0 }, "Chef Ammar");
  assert.equal(lineFor(entry.lines, "tax_output"), undefined);
  assert.equal(entry.lines.length, 2);
  assert.equal(checkBalance(entry.lines).ok, true);
});

test("an explicit income account overrides the default", () => {
  const entry = salesInvoiceEntryInput({ ...invoice, incomeAccountId: "acct-performance" }, "Chef Ammar");
  const revenue = entry.lines.find((line) => line.credit === 5000);
  assert.equal(revenue?.accountId, "acct-performance");
  assert.equal(revenue?.accountKey, undefined, "the key is not also set, or resolution would be ambiguous");
});

test("net plus tax always reconstructs the printed total", () => {
  // Awkward splits that would not survive recomputing the tax from a rate.
  for (const [net, tax] of [[3333, 266.64], [0.01, 0], [12345.67, 987.65]]) {
    const entry = salesInvoiceEntryInput({ ...invoice, netAmount: net, taxAmount: tax, total: net + tax }, "Client");
    assert.equal(sumBy(entry.lines, "debit"), sumBy(entry.lines, "credit"), `${net} + ${tax} balances`);
  }
});

test("amounts come from the line-item totals when a document has them", () => {
  const amounts = invoiceAmounts({
    value: 9999,
    lineItemTotals: { taxableAmount: 5000, taxAmount: 400, total: 5400 },
  });
  assert.deepEqual(amounts, { netAmount: 5000, taxAmount: 400, total: 5400 });
  assert.equal(amounts.netAmount + amounts.taxAmount, amounts.total, "the header value is ignored, the table wins");
});

test("net is derived from the total so a rounded tax cannot unbalance the entry", () => {
  // taxableAmount here disagrees with total - taxAmount by a cent; the printed
  // total is authoritative because that is what the client was sent.
  const amounts = invoiceAmounts({
    value: 0,
    lineItemTotals: { taxableAmount: 100.005, taxAmount: 6, total: 106 },
  });
  assert.equal(amounts.netAmount, 100);
  assert.equal(amounts.taxAmount, 6);
  assert.equal(toCents(amounts.netAmount) + toCents(amounts.taxAmount), toCents(amounts.total));
});

test("a document with only a header value posts as untaxed revenue", () => {
  assert.deepEqual(invoiceAmounts({ value: 2500, lineItemTotals: null }), { netAmount: 2500, taxAmount: 0, total: 2500 });
  assert.deepEqual(invoiceAmounts({ value: 2500, lineItemTotals: { total: 0 } }), { netAmount: 2500, taxAmount: 0, total: 2500 });
});

test("only issued invoices are recognised", () => {
  for (const status of ["Sent", "Approved", "Overdue", "Partially paid", "Paid"]) {
    assert.equal(isIssuedInvoice("Invoice", status), true, `${status} is issued`);
  }
  for (const status of ["Draft", "Cancelled"]) {
    assert.equal(isIssuedInvoice("Invoice", status), false, `${status} is not revenue yet`);
  }
  assert.equal(isIssuedInvoice("Quotation", "Approved"), false, "a quotation is not revenue");
});

test("a bill still balances after moving the builder", () => {
  const entry = billEntryInput(
    { id: "bill-1", vendorId: "v-1", billDate: "2026-07-10", billNumber: "SUP-77", total: 1060, taxAmount: 60 },
    [{ accountId: "acct-ads", amount: 1000, description: "Meta ads" }],
    "Meta Platforms",
  );
  assert.equal(checkBalance(entry.lines).ok, true);
  assert.equal(sumBy(entry.lines, "debit"), 106000);
  assert.equal(lineFor(entry.lines, "accounts_payable").credit, 1060);
  assert.equal(lineFor(entry.lines, "tax_input").debit, 60);
});

test("a bill line with no account falls back to the holding account", () => {
  const entry = billEntryInput(
    { id: "bill-2", vendorId: "v-1", billDate: "2026-07-10", total: 100, taxAmount: 0 },
    [{ amount: 100, description: "Unclassified" }],
    "Vendor",
  );
  assert.equal(lineFor(entry.lines, "uncategorised").debit, 100);
});

test("a customer overpayment clears only the invoice and holds the rest as an advance", () => {
  const entry = paymentEntryInput({
    id: "pay-in-1",
    date: "2026-08-01",
    direction: "in",
    amount: 1200,
    allocatedAmount: 1000,
    bankAccountId: "bank-1",
    customerId: "cust-1",
  });

  assert.equal(lineFor(entry.lines, "accounts_receivable").credit, 1000);
  assert.equal(lineFor(entry.lines, "customer_advances").credit, 200);
  assert.equal(entry.lines.find((line) => line.accountId === "bank-1")?.debit, 1200);
  assert.equal(lineFor(entry.lines, "customer_advances").customerId, "cust-1");
  assert.equal(checkBalance(entry.lines).ok, true);
});

test("a supplier advance never reduces accounts payable", () => {
  const entry = paymentEntryInput({
    id: "pay-out-1",
    date: "2026-08-01",
    direction: "out",
    amount: 350,
    allocatedAmount: 0,
    bankAccountId: "bank-1",
    vendorId: "vendor-1",
  });

  assert.equal(lineFor(entry.lines, "accounts_payable"), undefined);
  assert.equal(lineFor(entry.lines, "supplier_advances").debit, 350);
  assert.equal(lineFor(entry.lines, "supplier_advances").vendorId, "vendor-1");
  assert.equal(entry.lines.find((line) => line.accountId === "bank-1")?.credit, 350);
  assert.equal(checkBalance(entry.lines).ok, true);
});

test("a fully allocated receipt does not touch customer advances", () => {
  const entry = paymentEntryInput({
    id: "pay-in-2",
    date: "2026-08-01",
    direction: "in",
    amount: 99.99,
    allocatedAmount: 99.99,
    bankAccountId: "bank-1",
    customerId: "cust-1",
  });

  assert.equal(lineFor(entry.lines, "accounts_receivable").credit, 99.99);
  assert.equal(lineFor(entry.lines, "customer_advances"), undefined);
  assert.equal(checkBalance(entry.lines).ok, true);
});

test("a credit note is the invoice with every side reversed", () => {
  const note = creditNoteEntryInput(invoice, "Chef Ammar");
  const original = salesInvoiceEntryInput(invoice, "Chef Ammar");

  assert.equal(checkBalance(note.lines).ok, true, "a credit note balances");
  assert.equal(note.lines.length, original.lines.length, "same accounts, opposite sides");
  assert.equal(sumBy(note.lines, "debit"), sumBy(original.lines, "credit"));
  assert.equal(sumBy(note.lines, "credit"), sumBy(original.lines, "debit"));

  // Receivables must fall, not rise: this is the whole point of the document.
  const receivable = lineFor(note.lines, "accounts_receivable");
  assert.equal(toCents(receivable.credit) > 0, true, "receivables are credited");
  assert.equal(toCents(receivable.debit ?? 0), 0, "receivables are not debited");

  const income = note.lines.find((line: any) => line.accountKey === "sales_income" || line.accountId);
  assert.equal(toCents(income?.debit ?? 0) > 0, true, "revenue is taken back");
  assert.equal(note.sourceType, "credit_note", "traceable to the credit note, not an invoice");
});

test("a credit note keeps the customer tag so per-client profit stays right", () => {
  const note = creditNoteEntryInput(invoice, "Chef Ammar");
  for (const line of note.lines) {
    assert.equal(line.customerId, invoice.customerId, "every line stays attributed");
  }
});

test("credit notes and invoices are both postable, quotations are not", () => {
  assert.equal(isIssuedCreditNote("Credit Note", "Sent"), true);
  assert.equal(isIssuedCreditNote("Credit Note", "Draft"), false, "a draft credit note is not posted");
  assert.equal(isIssuedCreditNote("Invoice", "Sent"), false);

  assert.equal(isPostableSalesDocument("Invoice", "Paid"), true);
  assert.equal(isPostableSalesDocument("Credit Note", "Approved"), true);
  assert.equal(isPostableSalesDocument("Quotation", "Approved"), false);
  assert.equal(isPostableSalesDocument("Credit Note", "Cancelled"), false);
});

test("the dispatcher picks the builder from the document type", () => {
  const asInvoice = salesDocumentEntryInput(invoice, "Invoice", "Chef Ammar");
  const asNote = salesDocumentEntryInput(invoice, "Credit Note", "Chef Ammar");

  assert.equal(sumBy(asInvoice.lines, "debit"), sumBy(asNote.lines, "credit"),
    "the two are exact opposites");
  // Posting an invoice and then crediting it in full must leave nothing behind.
  const combined = [...asInvoice.lines, ...asNote.lines];
  assert.equal(checkBalance(combined).ok, true);
  assert.equal(sumBy(combined, "debit"), sumBy(combined, "credit"));
});

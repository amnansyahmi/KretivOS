import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrintModel, checkTotals, columnsFor, fillTokens, money, templateDate,
  type PrintCompany, type PrintDocument, type PrintTemplate,
} from "./print-templates.ts";

const company: PrintCompany = {
  name: "Kretivco Mediaworks",
  registrationNumber: "SA0463354-A",
  addressLines: ["No.15A, Jalan USJ1/19", "47600, Subang Jaya, Selangor"],
  email: "kretivco@gmail.com",
  phone: "+6011-21149204 / +6019-3663805",
  logoUrl: "/kretivco-logo.png",
};

const invoiceTemplate: PrintTemplate = {
  documentType: "Invoice",
  heading: "INVOICE",
  numberLabel: "Invoice No#",
  notes: [
    "Please make payment to {{bankName}} {{bankAccountNumber}} KRETIVCO MEDIAWORKS.",
    "Payment due within {{paymentTermsDays}} days from the invoice date.",
    "Email us at {{email}}",
  ],
  closingLine: "Thank you for your business!",
  showSignatures: true,
  issuedByLabel: "Issued by:",
  acceptedByLabel: "Accepted by:",
  bankName: "Maybank",
  bankAccountNumber: "5123 4567 8901",
  paymentTermsDays: 14,
};

const invoice: PrintDocument = {
  type: "Invoice",
  number: "INV-2026-014",
  date: "2026-08-01",
  issuedBy: "Amman",
  customerName: "Chef Ammar Sdn Bhd",
  customerAddressLines: ["12 Jalan Bangsar", "59100 Kuala Lumpur"],
  title: "Ramadan campaign production",
  items: [
    { description: "Creative direction", quantity: 1, unit: "package", unitPrice: 3500 },
    { description: "Video editing", quantity: 3, unit: "days", unitPrice: 800 },
  ],
  subtotal: 5900,
  deliveryAmount: 0,
  discountAmount: 0,
  total: 5900,
};

test("money prints two decimals with thousands separators", () => {
  assert.equal(money(5900), "5,900.00");
  assert.equal(money(1234567.5), "1,234,567.50");
  assert.equal(money(0), "0.00");
  assert.equal(money(80), "80.00");
  assert.equal(money(-250.4), "-250.40");
});

test("dates print as DD/MM/YY, not ISO", () => {
  assert.equal(templateDate("2026-08-01"), "01/08/26");
  assert.equal(templateDate("2026-12-25T10:00:00Z"), "25/12/26");
  assert.equal(templateDate(""), "", "a missing date prints nothing rather than NaN");
  assert.equal(templateDate("not a date"), "");
});

test("tokens are filled from the template and the company", () => {
  const model = buildPrintModel(invoice, company, invoiceTemplate);
  assert.equal(model.notes[0], "Please make payment to Maybank 5123 4567 8901 KRETIVCO MEDIAWORKS.");
  assert.equal(model.notes[1], "Payment due within 14 days from the invoice date.");
  assert.equal(model.notes[2], "Email us at kretivco@gmail.com");
});

test("an unset bank falls back to the placeholder the template ships with", () => {
  const model = buildPrintModel(invoice, company, { ...invoiceTemplate, bankName: "", bankAccountNumber: "" });
  assert.match(model.notes[0], /\[Bank Name\] \[Bank Account Number\]/);
});

test("an unknown token stays visible rather than printing a hole", () => {
  assert.equal(fillTokens("Pay {{bankNam}} now", { bankName: "Maybank" }), "Pay {{bankNam}} now");
});

test("an invoice prints numbered rows with unit, price and amount", () => {
  const model = buildPrintModel(invoice, company, invoiceTemplate);
  assert.deepEqual(model.columns.map((c) => c.label), ["No", "Description", "Unit", "Price", "Amount"]);
  assert.deepEqual(model.rows[0], ["1", "Creative direction", "1 package", "3,500.00", "3,500.00"]);
  assert.deepEqual(model.rows[1], ["2", "Video editing", "3 days", "800.00", "2,400.00"]);
});

test("the meta block uses the label the document type actually prints", () => {
  const invoiceModel = buildPrintModel(invoice, company, invoiceTemplate);
  assert.equal(invoiceModel.meta[0].label, "Invoice No#");

  const quotation = buildPrintModel(
    { ...invoice, type: "Quotation" },
    company,
    { ...invoiceTemplate, documentType: "Quotation", heading: "QUOTATION", numberLabel: "QNo#" },
  );
  assert.equal(quotation.heading, "QUOTATION");
  assert.equal(quotation.meta[0].label, "QNo#");
});

test("delivery and discount print only when they carry a value", () => {
  const plain = buildPrintModel(invoice, company, invoiceTemplate);
  assert.deepEqual(plain.totals.map((row) => row.label), ["Subtotal:", "Total (MYR):"]);

  const withExtras = buildPrintModel(
    { ...invoice, deliveryAmount: 150, discountAmount: 200, total: 5850 },
    company,
    invoiceTemplate,
  );
  assert.deepEqual(withExtras.totals.map((row) => row.label),
    ["Subtotal:", "Delivery:", "Discount:", "Total (MYR):"]);
  assert.equal(withExtras.totals[2].parenthesised, true, "discount prints in brackets");
  assert.equal(withExtras.totals[3].bold, true, "the total is the emphasised figure");
});

test("a receipt has its own columns and its own totals", () => {
  const receipt = buildPrintModel(
    {
      ...invoice,
      type: "Receipt",
      number: "RCP-2026-004",
      items: [{ description: "Payment for INV-2026-014", quantity: 1, unit: "", unitPrice: 5900 }],
      amountPaid: 4000,
      balanceDue: 1900,
      paymentMethod: "Bank Transfer",
    },
    company,
    { ...invoiceTemplate, documentType: "Receipt", heading: "RECEIPT", numberLabel: "Receipt No#" },
  );

  assert.deepEqual(receipt.columns.map((c) => c.label), ["No", "Description", "Payment Method", "Amount"]);
  assert.deepEqual(receipt.rows, [["1", "Payment for INV-2026-014", "Bank Transfer", "4,000.00"]]);
  assert.deepEqual(receipt.totals.map((row) => row.label),
    ["Amount Paid (MYR):", "Balance Due (MYR):"]);
  assert.equal(receipt.totals[0].value, "4,000.00");
  assert.equal(receipt.totals[1].value, "1,900.00");
});

test("a receipt prints the amount received, not the invoice value", () => {
  const receipt = buildPrintModel(
    { ...invoice, type: "Receipt", amountPaid: 1000, balanceDue: 4900, paymentMethod: "Cash" },
    company,
    { ...invoiceTemplate, documentType: "Receipt" },
  );
  assert.equal(receipt.rows[0][3], "1,000.00", "not 5,900.00");
});

test("signatures can be turned off", () => {
  const model = buildPrintModel(invoice, company, { ...invoiceTemplate, showSignatures: false });
  assert.equal(model.signatures, null);
});

test("blank customer address lines are dropped rather than printed empty", () => {
  const model = buildPrintModel(
    { ...invoice, customerAddressLines: ["12 Jalan Bangsar", "", "  "] },
    company,
    invoiceTemplate,
  );
  assert.deepEqual(model.customerAddressLines, ["12 Jalan Bangsar", "  "]);
});

test("the printed total is checked against the rows, not trusted", () => {
  assert.equal(checkTotals(invoice).ok, true);

  const wrong = checkTotals({ ...invoice, total: 5000 });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.expected, 5900);
  assert.equal(wrong.stored, 5000);

  // Delivery adds and discount subtracts.
  assert.equal(checkTotals({ ...invoice, deliveryAmount: 150, discountAmount: 200, total: 5850 }).ok, true);
});

test("totals stay exact across many rows", () => {
  // 0.1 + 0.2 territory, in a place where a sen would be visible to a client.
  const items = Array.from({ length: 30 }, () => ({ description: "x", quantity: 1, unit: "", unitPrice: 0.1 }));
  const check = checkTotals({ ...invoice, items, deliveryAmount: 0, discountAmount: 0, total: 3 });
  assert.equal(check.ok, true, `expected 3.00, computed ${check.expected}`);
});

test("receipt columns differ from sales columns", () => {
  assert.equal(columnsFor("Receipt").length, 4);
  assert.equal(columnsFor("Invoice").length, 5);
  assert.equal(columnsFor("Quotation").length, 5);
});

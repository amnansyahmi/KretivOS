/**
 * Turns a sales document into the printable model the three Kretivco templates
 * describe, free of React and of I/O so the arithmetic and the wording can be
 * tested directly.
 *
 * The geometry is not configurable and lives in the renderer: logo left,
 * company block beside it, document heading right, ruled table, right-aligned
 * totals, signature pair. That is what makes a quotation, an invoice and a
 * receipt read as one family. What *is* configurable is every word — the
 * heading, the number label, the numbered notes, the closing line — plus the
 * bank details and payment terms those notes refer to.
 *
 * Notes carry {{tokens}} rather than literal bank details so changing the bank
 * once changes every document, instead of six notes each holding their own copy
 * of the account number.
 */

import { toCents } from "./accounting-math.ts";

export type PrintDocumentType = "Invoice" | "Quotation" | "Receipt";

export type PrintCompany = {
  name: string;
  registrationNumber: string;
  addressLines: string[];
  email: string;
  phone: string;
  logoUrl: string;
};

export type PrintTemplate = {
  documentType: string;
  heading: string;
  numberLabel: string;
  notes: string[];
  closingLine: string;
  showSignatures: boolean;
  issuedByLabel: string;
  acceptedByLabel: string;
  bankName: string;
  bankAccountNumber: string;
  paymentTermsDays: number;
};

export type PrintLineItem = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type PrintDocument = {
  type: string;
  number: string;
  date: string;
  issuedBy: string;
  customerName: string;
  customerAddressLines: string[];
  title: string;
  items: PrintLineItem[];
  subtotal: number;
  deliveryAmount: number;
  discountAmount: number;
  total: number;
  /** Receipts only. */
  amountPaid?: number;
  balanceDue?: number;
  paymentMethod?: string;
};

export type PrintColumn = { key: string; label: string; align: "left" | "center" | "right" };
export type PrintTotalRow = { label: string; value: string; bold?: boolean; parenthesised?: boolean };

export type PrintModel = {
  heading: string;
  company: PrintCompany;
  meta: { label: string; value: string }[];
  customerName: string;
  customerAddressLines: string[];
  title: string;
  columns: PrintColumn[];
  rows: string[][];
  totals: PrintTotalRow[];
  notes: string[];
  closingLine: string;
  signatures: { issuedBy: string; acceptedBy: string } | null;
};

const CURRENCY = "MYR";

/** Two decimals with thousands separators, the way the templates print money. */
export function money(value: number): string {
  const cents = toCents(value);
  const negative = cents < 0;
  const text = (Math.abs(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `-${text}` : text;
}

/** DD/MM/YY, as the templates show it — not the ISO the database stores. */
export function templateDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? "").trim());
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1].slice(2)}`;
}

/**
 * Fills {{tokens}} in note text. An unknown token is left visible rather than
 * blanked, so a typo shows up as `{{bankNam}}` on the page instead of silently
 * printing a note with a hole in it.
 */
export function fillTokens(text: string, values: Record<string, string>): string {
  return String(text ?? "").replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole,
  );
}

export function noteTokens(company: PrintCompany, template: PrintTemplate): Record<string, string> {
  return {
    bankName: template.bankName || "[Bank Name]",
    bankAccountNumber: template.bankAccountNumber || "[Bank Account Number]",
    paymentTermsDays: String(template.paymentTermsDays ?? ""),
    email: company.email,
    phone: company.phone,
    companyName: company.name,
  };
}

const SALES_COLUMNS: PrintColumn[] = [
  { key: "no", label: "No", align: "left" },
  { key: "description", label: "Description", align: "left" },
  { key: "unit", label: "Unit", align: "center" },
  { key: "price", label: "Price", align: "right" },
  { key: "amount", label: "Amount", align: "right" },
];

const RECEIPT_COLUMNS: PrintColumn[] = [
  { key: "no", label: "No", align: "left" },
  { key: "description", label: "Description", align: "left" },
  { key: "method", label: "Payment Method", align: "left" },
  { key: "amount", label: "Amount", align: "right" },
];

export function columnsFor(documentType: string): PrintColumn[] {
  return documentType === "Receipt" ? RECEIPT_COLUMNS : SALES_COLUMNS;
}

/**
 * A receipt records one payment, not a priced breakdown, so it prints a single
 * row and takes its amount from what was actually received.
 */
function receiptRows(document: PrintDocument): string[][] {
  const description = document.items[0]?.description || document.title || "Payment received";
  return [[
    "1",
    description,
    document.paymentMethod || "",
    money(document.amountPaid ?? document.total),
  ]];
}

function salesRows(document: PrintDocument): string[][] {
  return document.items.map((item, index) => [
    String(index + 1),
    item.description,
    // Quantity carries the unit label when there is one: "2 days" reads better
    // than a bare 2 in a column headed Unit.
    item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity),
    money(item.unitPrice),
    money(item.quantity * item.unitPrice),
  ]);
}

function totalsFor(document: PrintDocument): PrintTotalRow[] {
  if (document.type === "Receipt") {
    return [
      { label: `Amount Paid (${CURRENCY}):`, value: money(document.amountPaid ?? document.total), bold: true },
      { label: `Balance Due (${CURRENCY}):`, value: money(document.balanceDue ?? 0) },
    ];
  }

  const rows: PrintTotalRow[] = [{ label: "Subtotal:", value: money(document.subtotal) }];
  // Delivery and discount only appear when they carry a value: an invoice with
  // no delivery charge should not print a line saying so.
  if (toCents(document.deliveryAmount) !== 0) {
    rows.push({ label: "Delivery:", value: money(document.deliveryAmount) });
  }
  if (toCents(document.discountAmount) !== 0) {
    rows.push({ label: "Discount:", value: money(document.discountAmount), parenthesised: true });
  }
  rows.push({ label: `Total (${CURRENCY}):`, value: money(document.total), bold: true });
  return rows;
}

export function buildPrintModel(
  document: PrintDocument,
  company: PrintCompany,
  template: PrintTemplate,
): PrintModel {
  const tokens = noteTokens(company, template);

  return {
    heading: template.heading,
    company,
    meta: [
      { label: template.numberLabel, value: document.number },
      { label: "Date", value: templateDate(document.date) },
      { label: "By", value: document.issuedBy },
    ],
    customerName: document.customerName,
    customerAddressLines: document.customerAddressLines.filter(Boolean),
    title: document.title,
    columns: columnsFor(document.type),
    rows: document.type === "Receipt" ? receiptRows(document) : salesRows(document),
    totals: totalsFor(document),
    notes: template.notes.map((note) => fillTokens(note, tokens)),
    closingLine: template.closingLine,
    signatures: template.showSignatures
      ? { issuedBy: template.issuedByLabel, acceptedBy: template.acceptedByLabel }
      : null,
  };
}

/**
 * Recomputes the printed totals from the rows.
 *
 * The document carries stored totals, but a printed invoice that does not add
 * up is worse than one that is late, so the renderer checks rather than trusts.
 * Discount is held as a positive amount and subtracted.
 */
export function checkTotals(document: PrintDocument): { ok: boolean; expected: number; stored: number } {
  const itemCents = document.items.reduce(
    (sum, item) => sum + toCents(item.quantity * item.unitPrice),
    0,
  );
  const expectedCents = itemCents + toCents(document.deliveryAmount) - toCents(document.discountAmount);
  const storedCents = toCents(document.total);
  return { ok: expectedCents === storedCents, expected: expectedCents / 100, stored: storedCents / 100 };
}

// ---------------------------------------------------------------------------
// Database row mappers
// ---------------------------------------------------------------------------
//
// Kept here rather than in the route: a Next.js route file may only export
// request handlers, and these are pure shape translations that the print page,
// the settings screen and the tests all want.

/** Falls back to the supplied template so a print never comes out blank. */
const DEFAULTS: Record<string, Pick<PrintTemplate, "heading" | "numberLabel">> = {
  Invoice: { heading: "INVOICE", numberLabel: "Invoice No#" },
  Quotation: { heading: "QUOTATION", numberLabel: "QNo#" },
  Receipt: { heading: "RECEIPT", numberLabel: "Receipt No#" },
};

export function toTemplate(row: any): PrintTemplate {
  const type = String(row.document_type);
  return {
    documentType: type,
    heading: row.heading || DEFAULTS[type]?.heading || type.toUpperCase(),
    numberLabel: row.number_label || DEFAULTS[type]?.numberLabel || "No#",
    notes: Array.isArray(row.notes) ? row.notes.map((note: unknown) => String(note)) : [],
    closingLine: row.closing_line ?? "",
    showSignatures: row.show_signatures !== false,
    issuedByLabel: row.issued_by_label || "Issued by:",
    acceptedByLabel: row.accepted_by_label || "Accepted by:",
    bankName: row.bank_name || "",
    bankAccountNumber: row.bank_account_number || "",
    paymentTermsDays: Number(row.payment_terms_days) || 14,
  };
}

export function toCompany(row: any): PrintCompany {
  const cityLine = [row?.postcode, row?.city, row?.state_code].filter(Boolean).join(", ");
  return {
    name: row?.name || "Kretivco Mediaworks",
    registrationNumber: row?.registration_number || "",
    addressLines: [row?.address_line1, row?.address_line2, cityLine].filter(Boolean),
    email: row?.contact_email || "",
    phone: row?.contact_phone || "",
    logoUrl: row?.logo_url || "/kretivco-logo.png",
  };
}

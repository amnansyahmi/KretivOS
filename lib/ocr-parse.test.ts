import assert from "node:assert/strict";
import test from "node:test";
import {
  duplicateFingerprint,
  fieldsNeedingReview,
  normaliseChequeNumber,
  normaliseVendor,
  overallConfidence,
  parseAmount,
  parseDocumentDate,
  reconcileTotals,
} from "./ocr-parse.ts";

test("amounts parse from what receipts actually print", () => {
  assert.equal(parseAmount("RM1,234.50"), 1234.5);
  assert.equal(parseAmount("RM 89.90"), 89.9);
  assert.equal(parseAmount("MYR12.00"), 12);
  assert.equal(parseAmount("1234.50"), 1234.5);
  assert.equal(parseAmount(1234.5), 1234.5);
  assert.equal(parseAmount("  42 "), 42);
});

test("European separators are not read as thousands", () => {
  // Some POS systems emit 1.234,50 for one thousand two hundred and thirty four fifty.
  assert.equal(parseAmount("1.234,50"), 1234.5);
  assert.equal(parseAmount("1,234.50"), 1234.5);
  // Commas alone: decimal only when exactly two digits follow.
  assert.equal(parseAmount("89,90"), 89.9);
  assert.equal(parseAmount("1,234"), 1234);
});

test("negatives print in three different ways and all mean the same", () => {
  assert.equal(parseAmount("-50.00"), -50);
  assert.equal(parseAmount("50.00-"), -50, "trailing minus from a receipt printer");
  assert.equal(parseAmount("(50.00)"), -50, "parenthesised, from an accounting export");
});

test("an unreadable amount is null rather than a plausible guess", () => {
  for (const value of ["", "   ", "N/A", "TOTAL", null, undefined, "abc"]) {
    assert.equal(parseAmount(value), null, `${JSON.stringify(value)} should not parse`);
  }
});

test("ambiguous numeric dates are read day-first, the Malaysian convention", () => {
  assert.equal(parseDocumentDate("03/04/2026"), "2026-04-03", "3 April, not 4 March");
  assert.equal(parseDocumentDate("12/03/2026"), "2026-03-12");
  assert.equal(parseDocumentDate("01-02-2026"), "2026-02-01");
});

test("an impossible day-first reading falls back to the other order", () => {
  // 13 cannot be a month, so this can only be MM/DD: 13 March.
  assert.equal(parseDocumentDate("03/13/2026"), "2026-03-13");
  // And the unambiguous day-first case still reads as written.
  assert.equal(parseDocumentDate("13/03/2026"), "2026-03-13");
});

test("dates parse from the other formats documents use", () => {
  assert.equal(parseDocumentDate("2026-04-03"), "2026-04-03");
  assert.equal(parseDocumentDate("2026/04/03"), "2026-04-03");
  assert.equal(parseDocumentDate("12 Mar 2026"), "2026-03-12");
  assert.equal(parseDocumentDate("12-March-2026"), "2026-03-12");
  assert.equal(parseDocumentDate("Mar 12, 2026"), "2026-03-12");
  assert.equal(parseDocumentDate("12/03/26"), "2026-03-12", "two-digit year");
});

test("dates that cannot exist are rejected", () => {
  assert.equal(parseDocumentDate("31/02/2026"), null, "no 31st of February");
  assert.equal(parseDocumentDate("00/01/2026"), null);
  assert.equal(parseDocumentDate("not a date"), null);
  assert.equal(parseDocumentDate(""), null);
});

test("vendor names normalise past company suffixes and punctuation", () => {
  assert.equal(normaliseVendor("KEDAI KOPI ABC SDN BHD"), "kedai kopi abc");
  assert.equal(normaliseVendor("Kedai Kopi ABC Sdn. Bhd."), "kedai kopi abc");
  assert.equal(normaliseVendor("  Kedai   Kopi  ABC  "), "kedai kopi abc");
  // The same shop written three ways collapses to one key.
  const forms = ["ABC Trading Sdn Bhd", "A.B.C. TRADING", "abc trading"];
  const normalised = new Set(forms.map(normaliseVendor));
  assert.equal(normalised.size, 1, `expected one key, got ${[...normalised].join(" / ")}`);
});

test("the same receipt photographed twice produces one fingerprint", () => {
  const first = duplicateFingerprint({ vendorName: "KEDAI KOPI ABC SDN BHD", documentDate: "12/03/2026", total: "RM89.90" });
  const second = duplicateFingerprint({ vendorName: "Kedai Kopi ABC", documentDate: "2026-03-12", total: 89.9 });
  assert.equal(first, second);
  assert.ok(first.length > 0);
});

test("different amounts or dates are not duplicates", () => {
  const base = { vendorName: "ABC", documentDate: "2026-03-12", total: 89.9 };
  assert.notEqual(duplicateFingerprint(base), duplicateFingerprint({ ...base, total: 89.91 }));
  assert.notEqual(duplicateFingerprint(base), duplicateFingerprint({ ...base, documentDate: "2026-03-13" }));
});

test("an incomplete extraction produces no fingerprint rather than a weak one", () => {
  assert.equal(duplicateFingerprint({ vendorName: "", documentDate: "2026-03-12", total: 10 }), "");
  assert.equal(duplicateFingerprint({ vendorName: "ABC", documentDate: "", total: 10 }), "");
  assert.equal(duplicateFingerprint({ vendorName: "ABC", documentDate: "2026-03-12", total: null }), "");
});

test("a missing total is derived from subtotal and tax", () => {
  const result = reconcileTotals({ subtotal: 100, tax: 6, total: null });
  assert.equal(result.total, 106);
  assert.deepEqual(result.derived, ["total"]);
  assert.equal(result.discrepancyCents, 0);
});

test("a missing subtotal or tax is derived from the other two", () => {
  assert.equal(reconcileTotals({ subtotal: null, tax: 6, total: 106 }).subtotal, 100);
  assert.equal(reconcileTotals({ subtotal: 100, tax: null, total: 106 }).tax, 6);
});

test("a cash receipt showing only a total is treated as untaxed", () => {
  const result = reconcileTotals({ subtotal: null, tax: null, total: 25.5 });
  assert.equal(result.subtotal, 25.5);
  assert.equal(result.tax, 0);
  assert.equal(result.total, 25.5);
});

test("totals that do not add up report the discrepancy instead of being trusted", () => {
  // The model read the tax as 6.00 but the printed total implies 6.50.
  const result = reconcileTotals({ subtotal: 100, tax: 6, total: 106.5 });
  assert.equal(result.discrepancyCents, 50);
  assert.equal(result.total, 106.5, "the printed total is preserved, not overwritten");
});

test("confidence is the weakest required field, not the average", () => {
  // Certain about vendor and date, unsure about the amount. Averaging would
  // report 0.83 and hide exactly the case a reviewer must see.
  const score = overallConfidence({ documentDate: 0.99, vendorName: 0.98, total: 0.52 });
  assert.equal(score, 0.52);
});

test("a missing confidence field counts as zero", () => {
  assert.equal(overallConfidence({ documentDate: 0.99, vendorName: 0.98 }), 0);
  assert.equal(overallConfidence({}), 0);
});

test("low-confidence fields are listed for review", () => {
  const fields = fieldsNeedingReview({ documentDate: 0.95, vendorName: 0.4, total: 0.99, taxAmount: 0.6 });
  assert.deepEqual(fields.sort(), ["taxAmount", "vendorName"]);
});

test("cheque numbers reduce to digits for statement matching", () => {
  assert.equal(normaliseChequeNumber("No. 000123"), "000123");
  assert.equal(normaliseChequeNumber("123-456"), "123456");
  assert.equal(normaliseChequeNumber(""), "");
});

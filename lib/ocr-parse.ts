/**
 * Normalisation for extracted document fields.
 *
 * A model reading a photographed receipt returns something shaped like the
 * answer but rarely typed like it: "RM 1,234.50", "12/03/2026", "Total: 89.90-",
 * "1.234,50". This module turns that into values the ledger can use, and is kept
 * free of I/O so the awkward cases can be tested directly.
 *
 * Everything here is deliberately conservative: when a value cannot be read with
 * confidence it returns null rather than guessing, because a wrong amount that
 * looks plausible is worse than an empty field the reviewer must fill in.
 */

import { toCents } from "./accounting-math.ts";

/**
 * Parses a monetary amount from free text.
 *
 * Handles the separators Malaysian documents actually use — "RM1,234.50" and
 * the European "1.234,50" that some POS systems emit — plus trailing-minus
 * negatives and parenthesised negatives from accounting exports.
 */
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let text = String(value ?? "").trim();
  if (!text) return null;

  const parenthesised = /^\((.*)\)$/.exec(text);
  if (parenthesised) text = `-${parenthesised[1]}`;

  // Trailing minus, as printed by many receipt printers.
  if (/-$/.test(text)) text = `-${text.slice(0, -1)}`;

  const negative = text.trim().startsWith("-");
  // Strip currency words and symbols, keeping digits and separators.
  text = text.replace(/(rm|myr|usd|sgd|\$)/gi, "").replace(/[^\d.,]/g, "");
  if (!text) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  const hasComma = lastComma !== -1;
  const hasDot = lastDot !== -1;

  if (hasComma && hasDot) {
    // Both present, so whichever comes last is the decimal separator:
    // "1.234,50" is European, "1,234.50" is not.
    text = lastComma > lastDot
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (hasComma) {
    // Commas only. "89,90" is a decimal; "1,234" is grouped thousands. Checked
    // before the both-present branch above would have caught it, because there
    // `lastDot` is -1 and every comma would read as a decimal point.
    const parts = text.split(",");
    text = parts.length === 2 && parts[1].length === 2 ? parts.join(".") : parts.join("");
  }
  // Dots only: already in the form Number() expects.

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (value: number) => String(value).padStart(2, "0");
const isRealDate = (year: number, month: number, day: number) => {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/**
 * Parses a document date to YYYY-MM-DD.
 *
 * Ambiguous numeric dates are read day-first, which is the Malaysian
 * convention — 03/04/2026 is 3 April, not 4 March. Where the first component is
 * unambiguously above 12 the other order is used instead.
 */
export function parseDocumentDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  // Already ISO.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    const [, year, month, day] = iso.map(Number) as unknown as number[];
    return isRealDate(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
  }

  // "12 Mar 2026", "12-March-26"
  const named = /^(\d{1,2})[\s\-./]*([A-Za-z]{3,9})[\s\-./]*(\d{2,4})$/.exec(text);
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS[named[2].slice(0, 4).toLowerCase()] ?? MONTHS[named[2].slice(0, 3).toLowerCase()];
    let year = Number(named[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month && isRealDate(year, month, day)) return `${year}-${pad(month)}-${pad(day)}`;
    return null;
  }

  // "Mar 12, 2026"
  const namedFirst = /^([A-Za-z]{3,9})[\s\-./]+(\d{1,2}),?[\s\-./]+(\d{2,4})$/.exec(text);
  if (namedFirst) {
    const month = MONTHS[namedFirst[1].slice(0, 4).toLowerCase()] ?? MONTHS[namedFirst[1].slice(0, 3).toLowerCase()];
    const day = Number(namedFirst[2]);
    let year = Number(namedFirst[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month && isRealDate(year, month, day)) return `${year}-${pad(month)}-${pad(day)}`;
    return null;
  }

  const numeric = /^(\d{1,4})[\-/.](\d{1,2})[\-/.](\d{1,4})$/.exec(text);
  if (numeric) {
    let [, first, second, third] = numeric.map(Number) as unknown as number[];

    // Leading four-digit component is a year: YYYY/MM/DD.
    if (String(numeric[1]).length === 4) {
      return isRealDate(first, second, third) ? `${first}-${pad(second)}-${pad(third)}` : null;
    }

    let year = third;
    if (year < 100) year += year < 70 ? 2000 : 1900;

    // Day-first unless the first component cannot be a day.
    let day = first;
    let month = second;
    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      day = second;
      month = first;
    }
    return isRealDate(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
  }

  return null;
}

/** Collapses casing, punctuation and company suffixes so vendors match. */
export function normaliseVendor(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    // Periods go first so an acronym written "A.B.C." matches "ABC". Doing this
    // before the suffix pass also normalises "Sdn. Bhd." into "sdn bhd".
    .replace(/\./g, "")
    .replace(/\b(sdn\s*bhd|bhd|enterprise|trading|holdings?|group|company|co|inc|ltd|llp|plt)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Identity of a document for duplicate detection: same vendor, same date, same
 * total. Deliberately excludes the document number, because the commonest
 * duplicate is the same receipt photographed twice by two people, where the
 * number is often unreadable on one of them.
 */
export function duplicateFingerprint({ vendorName, documentDate, total }: { vendorName?: unknown; documentDate?: unknown; total?: unknown }) {
  const vendor = normaliseVendor(vendorName);
  const date = parseDocumentDate(documentDate) ?? "";
  const amount = parseAmount(total);
  if (!vendor || !date || amount === null) return "";
  return `${vendor}|${date}|${toCents(amount)}`;
}

export type ExtractedTotals = { subtotal: number | null; tax: number | null; total: number | null };

/**
 * Reconciles the three totals against each other.
 *
 * A model reading a crumpled receipt often gets two of the three right and the
 * third wrong or missing. Where exactly one is missing it is derived; where all
 * three are present but do not add up, the discrepancy is reported so the
 * reviewer is told rather than the number being silently trusted.
 */
export function reconcileTotals(input: ExtractedTotals): ExtractedTotals & { derived: string[]; discrepancyCents: number } {
  const subtotalCents = input.subtotal === null ? null : toCents(input.subtotal);
  const taxCents = input.tax === null ? null : toCents(input.tax);
  const totalCents = input.total === null ? null : toCents(input.total);
  const derived: string[] = [];

  let subtotal = subtotalCents;
  let tax = taxCents;
  let total = totalCents;

  if (total === null && subtotal !== null && tax !== null) {
    total = subtotal + tax;
    derived.push("total");
  } else if (subtotal === null && total !== null && tax !== null) {
    subtotal = total - tax;
    derived.push("subtotal");
  } else if (tax === null && total !== null && subtotal !== null) {
    tax = total - subtotal;
    derived.push("tax");
  } else if (tax === null && total !== null && subtotal === null) {
    // A receipt with only a total is normal for small cash purchases.
    tax = 0;
    subtotal = total;
    derived.push("subtotal", "tax");
  }

  const discrepancyCents = subtotal !== null && tax !== null && total !== null
    ? total - (subtotal + tax)
    : 0;

  return {
    subtotal: subtotal === null ? null : subtotal / 100,
    tax: tax === null ? null : tax / 100,
    total: total === null ? null : total / 100,
    derived,
    discrepancyCents,
  };
}

/** Digits only, for matching a cheque number against a bank statement. */
export function normaliseChequeNumber(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

const CONFIDENCE_FIELDS = ["documentDate", "vendorName", "total"] as const;

/**
 * Overall confidence is the *lowest* of the fields that must be right, not the
 * average. An extraction that is certain about the vendor and unsure about the
 * amount is an unsure extraction — averaging would hide exactly the case a
 * reviewer needs to see first.
 */
export function overallConfidence(confidence: Record<string, unknown>) {
  const scores = CONFIDENCE_FIELDS.map((field) => {
    const value = Number(confidence?.[field]);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  });
  return Number(Math.min(...scores).toFixed(3));
}

/** Fields a reviewer must look at before this can post. */
export function fieldsNeedingReview(confidence: Record<string, unknown>, threshold = 0.8) {
  return Object.entries(confidence ?? {})
    .filter(([, score]) => {
      const value = Number(score);
      return !Number.isFinite(value) || value < threshold;
    })
    .map(([field]) => field);
}

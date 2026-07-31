/**
 * Document extraction for receipts, invoices and cheques.
 *
 * The model is asked for a fixed JSON shape with a confidence score per field,
 * then everything it returns is re-parsed and re-checked by lib/ocr-parse.ts.
 * The model is treated as a reader, not as an authority: it proposes values, the
 * parser normalises them, and a human confirms before anything reaches the
 * ledger. Nothing here posts.
 *
 * Extraction failure is an expected state, not an exception. A blurred photo, an
 * unreachable service or a model that returns prose all land the capture in
 * `Failed` or `Needs review` with the image intact, so the operator can key the
 * fields by hand rather than losing the document.
 */

import { aiNonymauzChat, imageMessage } from "@/lib/ai-nonymauz";
import {
  duplicateFingerprint,
  fieldsNeedingReview,
  normaliseChequeNumber,
  overallConfidence,
  parseAmount,
  parseDocumentDate,
  reconcileTotals,
} from "@/lib/ocr-parse";

export type CaptureKind = "receipt" | "invoice" | "cheque" | "statement" | "other";

export type ExtractedLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxAmount: number;
  confidence: number;
};

export type ExtractionResult = {
  ok: boolean;
  kind: CaptureKind;
  vendorName: string;
  documentNumber: string;
  documentDate: string | null;
  currency: string;
  subtotal: number | null;
  taxAmount: number | null;
  total: number | null;
  taxNumber: string;
  paymentMethod: string;
  chequeNumber: string;
  chequePayee: string;
  chequeBank: string;
  chequeAmountWords: string;
  lines: ExtractedLine[];
  confidence: Record<string, number>;
  overall: number;
  needsReview: string[];
  /** Non-fatal problems the reviewer should see: totals not adding up, and so on. */
  warnings: string[];
  fingerprint: string;
  model: string;
  durationMs: number;
  error: string;
};

const FIELD_GUIDE: Record<CaptureKind, string> = {
  receipt: "A retail or restaurant receipt. The vendor name is usually the largest text at the top. The total is the last and largest amount.",
  invoice: "A supplier tax invoice. Capture the invoice number, the supplier's SST or tax registration number, payment terms and the due date if printed.",
  cheque: "A bank cheque. Capture the cheque number, the payee written on the 'pay to' line, the bank name, the numeric amount and the amount written in words.",
  statement: "A bank statement page. Capture the account number and each transaction row with its date, description and signed amount.",
  other: "A financial document of unknown type. Capture whatever identifying fields, dates and amounts are present.",
};

function prompt(kind: CaptureKind) {
  return [
    "You are reading a scanned or photographed financial document for a Malaysian company's accounting system.",
    FIELD_GUIDE[kind],
    "",
    "Return ONLY a JSON object, no prose and no code fence, in exactly this shape:",
    `{
  "vendorName": string,
  "documentNumber": string,
  "documentDate": string,
  "currency": string,
  "subtotal": string,
  "taxAmount": string,
  "total": string,
  "taxNumber": string,
  "paymentMethod": string,
  "chequeNumber": string,
  "chequePayee": string,
  "chequeBank": string,
  "chequeAmountWords": string,
  "lines": [{ "description": string, "quantity": string, "unitPrice": string, "amount": string, "taxAmount": string, "confidence": number }],
  "confidence": {
    "vendorName": number, "documentNumber": number, "documentDate": number,
    "subtotal": number, "taxAmount": number, "total": number
  }
}`,
    "",
    "Rules:",
    "- Transcribe values exactly as printed. Do not convert currencies, reformat dates or recalculate totals.",
    "- Use an empty string for any field that is not present on the document. Never invent a value.",
    "- Confidence is 0 to 1 and means how clearly you could READ that field, not how plausible it looks.",
    "- If a field is obscured, creased or cut off, give it a low confidence rather than a best guess.",
    "- Malaysian dates are usually day-first. Transcribe the date exactly as printed and let the caller interpret it.",
    "- SST is Malaysian service tax. A receipt total often already includes it.",
  ].join("\n");
}

/** Pulls the JSON object out of a reply that may still be wrapped in prose or a fence. */
function parseModelJson(content: string): Record<string, any> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  const candidate = (fenced ? fenced[1] : content).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to the outermost braces, which survives a leading apology.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

const text = (value: unknown) => String(value ?? "").trim().slice(0, 300);
const score = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
};

function emptyResult(kind: CaptureKind, error: string, durationMs = 0): ExtractionResult {
  return {
    ok: false, kind, vendorName: "", documentNumber: "", documentDate: null, currency: "MYR",
    subtotal: null, taxAmount: null, total: null, taxNumber: "", paymentMethod: "",
    chequeNumber: "", chequePayee: "", chequeBank: "", chequeAmountWords: "",
    lines: [], confidence: {}, overall: 0, needsReview: [],
    warnings: [], fingerprint: "", model: "", durationMs, error,
  };
}

/**
 * Reads a document image and returns normalised, confidence-scored fields.
 *
 * `imageDataUrl` is a data: URL — the same form the attendance camera produces —
 * so the caller can pass a freshly captured photo without staging a file first.
 */
export async function extractDocument({
  imageDataUrl,
  kind = "receipt",
  hint = "",
}: {
  imageDataUrl: string;
  kind?: CaptureKind;
  hint?: string;
}): Promise<ExtractionResult> {
  const started = Date.now();

  if (!/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(imageDataUrl)) {
    return emptyResult(kind, "The document must be a JPEG, PNG, WEBP or PDF data URL.");
  }

  let content = "";
  let model = "";
  try {
    const result = await aiNonymauzChat({
      messages: [imageMessage(hint ? `${prompt(kind)}\n\nOperator note: ${hint}` : prompt(kind), imageDataUrl)],
      mode: "vision",
      temperature: 0,
      useRag: false,
      useTools: false,
      maxTokens: 2000,
    });
    content = result.content;
    model = result.model;
  } catch (error) {
    // `vision` is a declared mode on the service but was never exercised before
    // this feature, so an unsupported-mode failure is a realistic outcome. The
    // capture survives and can be keyed by hand.
    return emptyResult(
      kind,
      error instanceof Error ? error.message : "The extraction service is unavailable.",
      Date.now() - started,
    );
  }

  const parsed = parseModelJson(content);
  if (!parsed) {
    return emptyResult(kind, "The extraction did not return readable fields.", Date.now() - started);
  }

  const warnings: string[] = [];

  const totals = reconcileTotals({
    subtotal: parseAmount(parsed.subtotal),
    tax: parseAmount(parsed.taxAmount),
    total: parseAmount(parsed.total),
  });
  if (totals.derived.length) warnings.push(`Derived ${totals.derived.join(" and ")} from the other amounts.`);
  if (totals.discrepancyCents !== 0) {
    warnings.push(`Subtotal plus tax is out by ${(Math.abs(totals.discrepancyCents) / 100).toFixed(2)} against the printed total.`);
  }

  const documentDate = parseDocumentDate(parsed.documentDate);
  if (parsed.documentDate && !documentDate) warnings.push(`Could not read the date "${text(parsed.documentDate)}".`);

  const rawConfidence = parsed.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {};
  const confidence: Record<string, number> = {
    vendorName: score(rawConfidence.vendorName),
    documentNumber: score(rawConfidence.documentNumber),
    documentDate: documentDate ? score(rawConfidence.documentDate) : 0,
    subtotal: score(rawConfidence.subtotal),
    taxAmount: score(rawConfidence.taxAmount),
    total: totals.total === null ? 0 : score(rawConfidence.total),
  };

  const lines: ExtractedLine[] = (Array.isArray(parsed.lines) ? parsed.lines : [])
    .slice(0, 100)
    .map((line: any) => ({
      description: text(line?.description),
      quantity: parseAmount(line?.quantity) ?? 1,
      unitPrice: parseAmount(line?.unitPrice) ?? 0,
      amount: parseAmount(line?.amount) ?? 0,
      taxAmount: parseAmount(line?.taxAmount) ?? 0,
      confidence: score(line?.confidence),
    }))
    .filter((line: ExtractedLine) => line.description || line.amount);

  // Lines that do not sum to the subtotal usually mean a row was missed on a
  // long receipt, which matters when the reviewer allocates costs per line.
  if (lines.length && totals.subtotal !== null) {
    const lineTotal = lines.reduce((sum, line) => sum + line.amount, 0);
    if (Math.abs(lineTotal - totals.subtotal) > 0.05) {
      warnings.push(`Line items total ${lineTotal.toFixed(2)} but the subtotal reads ${totals.subtotal.toFixed(2)} — a row may be missing.`);
    }
  }

  const vendorName = text(parsed.vendorName);
  if (!vendorName) warnings.push("No vendor name was readable.");
  if (totals.total === null) warnings.push("No total was readable.");

  return {
    ok: true,
    kind,
    vendorName,
    documentNumber: text(parsed.documentNumber),
    documentDate,
    currency: (text(parsed.currency) || "MYR").toUpperCase().slice(0, 3),
    subtotal: totals.subtotal,
    taxAmount: totals.tax,
    total: totals.total,
    taxNumber: text(parsed.taxNumber),
    paymentMethod: text(parsed.paymentMethod),
    chequeNumber: normaliseChequeNumber(parsed.chequeNumber),
    chequePayee: text(parsed.chequePayee),
    chequeBank: text(parsed.chequeBank),
    chequeAmountWords: text(parsed.chequeAmountWords),
    lines,
    confidence,
    overall: overallConfidence(confidence),
    needsReview: fieldsNeedingReview(confidence),
    warnings,
    fingerprint: duplicateFingerprint({ vendorName, documentDate, total: totals.total }),
    model,
    durationMs: Date.now() - started,
    error: "",
  };
}

/**
 * Suggests an expense account from the vendor and line text.
 *
 * Deliberately a keyword table rather than a model call: it runs instantly, is
 * inspectable when it gets something wrong, and the reviewer confirms the
 * account anyway. Anything unmatched goes to the holding account rather than
 * being guessed into a real one.
 */
const ACCOUNT_HINTS: { key: string; patterns: RegExp }[] = [
  { key: "advertising", patterns: /\b(facebook|meta|google\s*ads?|tiktok|shopee\s*ads|lazada\s*ads|advertis|boost|iklan)\b/i },
  { key: "software", patterns: /\b(adobe|figma|canva|notion|slack|github|openai|anthropic|aws|vercel|subscription|saas|licen[cs]e|domain|hosting)\b/i },
  { key: "travel", patterns: /\b(grab|touch\s*'?n\s*go|petrol|shell|petronas|caltex|parking|toll|flight|airasia|hotel|train|ets)\b/i },
  { key: "meals", patterns: /\b(restoran|restaurant|cafe|kopitiam|mamak|makan|catering|food|starbucks|zus)\b/i },
  { key: "bank_charges", patterns: /\b(bank\s*charge|service\s*charge|gateway\s*fee|stripe|billplz|toyyibpay|merchant\s*fee)\b/i },
  { key: "salaries", patterns: /\b(salary|gaji|payroll|wages)\b/i },
];

export function suggestAccountKey(vendorName: string, description = "") {
  const haystack = `${vendorName} ${description}`;
  for (const hint of ACCOUNT_HINTS) {
    if (hint.patterns.test(haystack)) return hint.key;
  }
  return "uncategorised";
}

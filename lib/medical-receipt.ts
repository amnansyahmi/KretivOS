/**
 * Reading a Malaysian clinic receipt for a medical claim.
 *
 * A claim receipt has been read on upload since claims shipped, using the
 * extractor built for retail and restaurant receipts. That extractor is told
 * "the total is the last and largest amount", which is true of a supermarket
 * slip and wrong here. A clinic receipt stacks four figures:
 *
 *     Bill Total / Total OS Amt : RM 83.00
 *     Previous Payment          : RM  0.00
 *     Current Payment           : RM 83.00
 *     Balance                   : RM  0.00
 *
 * The last amount is the balance, which is usually zero, and the largest is
 * whichever of the bill or the payment happens to be bigger. Neither is the
 * answer. **What can be claimed is the current payment** — the money that
 * actually left the employee today. Somebody who paid RM 50 against an RM 83
 * bill is out of pocket RM 50, and a form that filled in RM 83 would have the
 * company reimburse a debt the employee still owes the clinic.
 *
 * Three other things this document carries that a till receipt does not, and
 * that a medical claim turns on:
 *
 * The patient's name. It is frequently not the employee — a spouse or a child —
 * which decides whether the claim is allowed at all under most policies. Read
 * and reported; never guessed at.
 *
 * The amount in words. "RM EIGHTY THREE ONLY" printed beside "83.00" is a
 * built-in check digit, and a misread numeral on a claim is the error that
 * costs money. Parsed and compared.
 *
 * An outstanding balance. Non-zero means the bill is not settled, and a claim
 * for the full bill total would be a claim for money not yet spent.
 *
 * The NRIC is deliberately read and deliberately not returned. It is on the
 * stored image either way, so reading it costs nothing, but putting it in an
 * API response and onto a claim record would spread it into places that have
 * no use for it.
 *
 * Parsing and the checks are pure and asserted in `medical-receipt.test.ts`;
 * only `extractMedicalReceipt` talks to a model.
 */

import { aiNonymauzChat, imageMessage } from "./ai-nonymauz.ts";
import { parseAmount, parseDocumentDate } from "./ocr-parse.ts";

export type MedicalReceipt = {
  ok: boolean;
  clinicName: string;
  receiptNumber: string;
  billNumber: string;
  documentDate: string | null;
  patientName: string;
  /** What the visit was for, as printed: "Consultation; Medication;". */
  treatment: string;
  billTotal: number | null;
  previousPayment: number | null;
  currentPayment: number | null;
  balance: number | null;
  /** The printed words, and what they parse to. A check against the numerals. */
  amountInWords: string;
  wordsAmount: number | null;
  paymentMode: string;
  confidence: Record<string, number>;
  warnings: string[];
  model: string;
  durationMs: number;
  error: string;
};

/**
 * The parts of a reading the patient check consults.
 *
 * Narrower than `MedicalReceipt` because that check runs in the browser against
 * what the upload endpoint sent back, which is a subset — the server does not
 * know who is filling the form in, only that somebody uploaded a file, so the
 * comparison has to happen where the session is.
 */
export type ReadReceipt = {
  ok: boolean;
  patientName?: string;
  confidence?: Record<string, number>;
};

const text = (value: unknown) => String(value ?? "").trim().slice(0, 300);

const score = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
};

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Words that carry no value: currency names, filler and the closing "only". */
const NOISE = new Set(["rm", "ringgit", "malaysia", "myr", "and", "only", "sahaja", "the", "sum", "of"]);

/**
 * The amount a receipt spells out, as a number.
 *
 * Malaysian receipts print "RM EIGHTY THREE ONLY" beside the figure, and
 * sometimes "... AND FIFTY SEN ONLY". Parsed so it can be checked against the
 * numerals, because a misread digit on a claim is the mistake that costs money
 * and this is the one document that carries its own check.
 *
 * Returns null rather than a partial reading: a half-understood amount used as
 * a cross-check would raise false alarms, which is worse than not checking.
 */
export function parseRinggitWords(value: unknown): number | null {
  const words = String(value ?? "").toLowerCase().replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
  if (!words.length) return null;

  /*
   * "sen" trails the number it belongs to — "EIGHTY THREE AND FIFTY SEN" is
   * 83.50, not 133. So the fractional part is the run of words ending at "sen",
   * starting after the "and" that separates it from the ringgit. Splitting at
   * "sen" and taking everything before it as ringgit reads the sen twice.
   */
  const marker = words.findIndex((word) => word === "sen" || word === "cent" || word === "cents");

  let ringgitWords = words;
  let senWords: string[] = [];
  if (marker !== -1) {
    const separator = words.lastIndexOf("and", marker);
    senWords = words.slice(separator === -1 ? 0 : separator + 1, marker);
    ringgitWords = separator === -1 ? [] : words.slice(0, separator);
  }

  const toNumber = (parts: string[]): number | null => {
    let total = 0;
    let current = 0;
    let sawValue = false;

    for (const word of parts) {
      if (NOISE.has(word)) continue;
      if (word in UNITS) { current += UNITS[word]; sawValue = true; continue; }
      if (word in TENS) { current += TENS[word]; sawValue = true; continue; }
      if (word === "hundred") { current = (current || 1) * 100; sawValue = true; continue; }
      if (word === "thousand") { total += (current || 1) * 1000; current = 0; sawValue = true; continue; }
      if (word === "million") { total += (current || 1) * 1_000_000; current = 0; sawValue = true; continue; }
      // Anything unrecognised means this is not a plain amount in words.
      return null;
    }
    return sawValue ? total + current : null;
  };

  // "FIFTY SEN ONLY" has no ringgit half at all, which is zero rather than
  // unreadable.
  const ringgit = ringgitWords.length ? toNumber(ringgitWords) : (marker === -1 ? null : 0);
  if (ringgit === null) return null;

  // The sen half is read the same way; "fifty sen" is 0.50, not 50.
  const sen = senWords.length ? toNumber(senWords) : 0;
  if (sen === null || sen < 0 || sen > 99) return null;

  return Number((ringgit + sen / 100).toFixed(2));
}

export const MEDICAL_RECEIPT_PROMPT = [
  "You are reading a Malaysian clinic or hospital payment receipt so an HR system can process a medical expense claim.",
  "",
  "Return ONLY a JSON object, no prose and no code fence, in exactly this shape:",
  `{
  "clinicName": string,
  "receiptNumber": string,
  "billNumber": string,
  "documentDate": string,
  "patientName": string,
  "patientNric": string,
  "treatment": string,
  "billTotal": string,
  "previousPayment": string,
  "currentPayment": string,
  "balance": string,
  "amountInWords": string,
  "paymentMode": string,
  "confidence": {
    "clinicName": number, "documentDate": number, "patientName": number,
    "billTotal": number, "currentPayment": number
  }
}`,
  "",
  "Rules:",
  "- Transcribe values exactly as printed. Do not reformat dates or recalculate any amount.",
  "- These receipts print several amounts. Keep them apart and do not merge them:",
  "  billTotal is labelled 'Bill Total', 'Total OS Amt' or 'Total Amount'.",
  "  previousPayment is what was paid before today. Often 0.00.",
  "  currentPayment is what was paid on this visit. This is the important one.",
  "  balance is what is still owed. Often 0.00.",
  "- If only one amount is printed, put it in currentPayment and leave the others empty.",
  "- patientName is the person treated, on the 'Received from' or 'Patient' line. It is often not the person claiming.",
  "- treatment is what the payment was for, such as 'Consultation; Medication;'. Transcribe it as printed.",
  "- amountInWords is the amount spelled out, such as 'RM EIGHTY THREE ONLY'. Transcribe it in full.",
  "- Use an empty string for any field that is not present. Never invent a value.",
  "- Confidence is 0 to 1 and means how clearly you could READ that field, not how plausible it looks.",
  "- If a field is stamped over, creased, in shadow or cut off, give it a low confidence rather than a best guess.",
  "- Malaysian dates are usually day-first, and often written like 26/Sep/2025. Transcribe exactly as printed.",
].join("\n");

export function emptyMedicalReceipt(error: string, durationMs = 0): MedicalReceipt {
  return {
    ok: false, clinicName: "", receiptNumber: "", billNumber: "", documentDate: null,
    patientName: "", treatment: "", billTotal: null, previousPayment: null,
    currentPayment: null, balance: null, amountInWords: "", wordsAmount: null,
    paymentMode: "", confidence: {}, warnings: [], model: "", durationMs, error,
  };
}

/** Normalises the model's reply and cross-checks the figures against each other. */
export function toMedicalReceipt(parsed: Record<string, any>): MedicalReceipt {
  const warnings: string[] = [];

  const billTotal = parseAmount(parsed?.billTotal);
  const previousPayment = parseAmount(parsed?.previousPayment);
  let currentPayment = parseAmount(parsed?.currentPayment);
  const balance = parseAmount(parsed?.balance);
  const amountInWords = text(parsed?.amountInWords);
  const wordsAmount = parseRinggitWords(amountInWords);

  // A receipt that prints only one figure: the amount paid is the amount.
  if (currentPayment === null && billTotal !== null && balance === 0) currentPayment = billTotal;

  if (wordsAmount !== null && currentPayment !== null && Math.abs(wordsAmount - currentPayment) >= 0.01) {
    warnings.push(`The receipt says "${amountInWords}" but the figure reads ${currentPayment.toFixed(2)}. Check the amount.`);
  }

  if (balance !== null && balance > 0) {
    warnings.push(`RM ${balance.toFixed(2)} is still outstanding on this bill, so only what has been paid can be claimed.`);
  }

  // Bill total should be what was paid plus what is still owed. A mismatch
  // means a figure was misread, and the figures are the whole point here.
  if (billTotal !== null && currentPayment !== null && balance !== null && previousPayment !== null) {
    const accounted = previousPayment + currentPayment + balance;
    if (Math.abs(accounted - billTotal) >= 0.01) {
      warnings.push(`The payments and balance come to ${accounted.toFixed(2)} against a bill of ${billTotal.toFixed(2)}. Check the figures.`);
    }
  }

  const documentDate = parseDocumentDate(parsed?.documentDate);
  if (parsed?.documentDate && !documentDate) warnings.push(`Could not read the date "${text(parsed.documentDate)}".`);
  if (currentPayment === null) warnings.push("No amount paid could be read, so key it in.");

  const rawConfidence = parsed?.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {};

  return {
    ok: true,
    clinicName: text(parsed?.clinicName),
    receiptNumber: text(parsed?.receiptNumber),
    billNumber: text(parsed?.billNumber),
    documentDate,
    patientName: text(parsed?.patientName),
    treatment: text(parsed?.treatment),
    billTotal, previousPayment, currentPayment, balance,
    amountInWords, wordsAmount,
    paymentMode: text(parsed?.paymentMode),
    confidence: {
      clinicName: score(rawConfidence.clinicName),
      documentDate: documentDate ? score(rawConfidence.documentDate) : 0,
      patientName: score(rawConfidence.patientName),
      billTotal: billTotal === null ? 0 : score(rawConfidence.billTotal),
      currentPayment: currentPayment === null ? 0 : score(rawConfidence.currentPayment),
    },
    warnings,
    model: "", durationMs: 0, error: "",
  };
}

export type ClaimableAmount = {
  amount: number | null;
  /** Which line the figure came from, so a queried claim can be explained. */
  basis: "current payment" | "bill total" | "none";
  note: string;
};

/**
 * What can actually be claimed.
 *
 * The current payment, because that is the money the employee is out of
 * pocket. The bill total is only used when nothing else was readable and
 * nothing is outstanding, in which case the two are the same number anyway.
 */
export function claimableAmount(receipt: MedicalReceipt | null): ClaimableAmount {
  if (!receipt?.ok) return { amount: null, basis: "none", note: "" };

  if (receipt.currentPayment !== null && receipt.currentPayment > 0) {
    // Says where the figure came from and stops. How much is still owed is the
    // outstanding-balance warning's job; saying it in both places puts two
    // cards on the screen that read as the same sentence twice.
    const differs = receipt.billTotal !== null && Math.abs(receipt.billTotal - receipt.currentPayment) >= 0.01;
    return {
      amount: receipt.currentPayment,
      basis: "current payment",
      note: differs ? `Taken from the payment made, not the RM ${receipt.billTotal!.toFixed(2)} bill total.` : "",
    };
  }

  if (receipt.billTotal !== null && receipt.billTotal > 0 && (receipt.balance === null || receipt.balance === 0)) {
    return { amount: receipt.billTotal, basis: "bill total", note: "Taken from the bill total; no separate payment line was readable." };
  }

  return { amount: null, basis: "none", note: "" };
}

/**
 * Who the receipt is for.
 *
 * Matched loosely, and on the same reasoning as a certificate: a receipt reads
 * "NUR ANIS BINTI ALIAS" where a record says "Nur Anis", and initials and
 * middle names vary. Only a complete absence of overlap is reported — and it is
 * reported as a fact about the claim, not as a problem, because claiming for a
 * spouse or a child is normal and whether the policy allows it is HR's call.
 */
export function receiptPatient(receipt: ReadReceipt | null, employeeName: string): { self: boolean; message: string } {
  const onReceipt = String(receipt?.patientName ?? "").trim();
  const onRecord = String(employeeName ?? "").trim();
  if (!receipt?.ok || !onReceipt || !onRecord) return { self: true, message: "" };
  if ((receipt.confidence?.patientName ?? 0) < 0.5) return { self: true, message: "" };

  const parts = onRecord.toLowerCase().split(/[^a-z]+/).filter((part) => part.length > 2);
  if (parts.some((part) => onReceipt.toLowerCase().includes(part))) return { self: true, message: "" };

  return { self: false, message: `This receipt is for ${onReceipt}. Say who they are in the description if you are claiming for a dependant.` };
}

/** Pulls the JSON object out of a reply that may still be wrapped in prose or a fence. */
function parseModelJson(content: string): Record<string, any> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  const candidate = (fenced ? fenced[1] : content).trim();

  try {
    return JSON.parse(candidate);
  } catch {
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

/**
 * Reads a clinic receipt and returns normalised, cross-checked fields.
 *
 * Never throws. The receipt is stored before this runs, so a failure leaves a
 * receipt on file and a keyable form.
 */
export async function extractMedicalReceipt({ imageDataUrl }: { imageDataUrl: string }): Promise<MedicalReceipt> {
  const started = Date.now();

  if (!/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(imageDataUrl)) {
    return emptyMedicalReceipt("The receipt must be a JPEG, PNG, WEBP or PDF data URL.");
  }

  let content = "";
  let model = "";
  try {
    const result = await aiNonymauzChat({
      messages: [imageMessage(MEDICAL_RECEIPT_PROMPT, imageDataUrl)],
      mode: "vision",
      temperature: 0,
      useRag: false,
      useTools: false,
      maxTokens: 1500,
    });
    content = result.content;
    model = result.model;
  } catch (error) {
    return emptyMedicalReceipt(
      error instanceof Error ? error.message : "The extraction service is unavailable.",
      Date.now() - started,
    );
  }

  const parsed = parseModelJson(content);
  if (!parsed) return emptyMedicalReceipt("The extraction did not return readable fields.", Date.now() - started);

  return { ...toMedicalReceipt(parsed), model, durationMs: Date.now() - started };
}

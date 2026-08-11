/**
 * Reading a medical certificate.
 *
 * A claim receipt already gets read on upload so the amount and date do not
 * have to be keyed twice. A medical certificate did not, because the only
 * extractor was built for financial documents — it asks for a vendor, a
 * subtotal and a tax number, none of which is on an MC. Forcing one through
 * that schema returns a clinic name in `vendorName` and nothing else useful.
 *
 * So this asks for what an MC actually carries, and what a leave request
 * actually needs: who signed it, and the dates it covers. Those two dates are
 * the leave request, which is why extraction is worth doing at all — attach the
 * certificate and the form fills itself in.
 *
 * The model is a reader, not an authority. Everything it returns is re-parsed
 * here, the dates are cross-checked against the days it claims, and a
 * disagreement becomes a warning rather than a silently-preferred value. A
 * certificate that cannot be read is still a certificate on file: extraction
 * failure returns an empty result and the form stays keyable.
 *
 * The parsing and cross-checking are pure and asserted in
 * `medical-certificate.test.ts`; only `extractMedicalCertificate` talks to a
 * model.
 */

import { aiNonymauzChat, imageMessage } from "./ai-nonymauz.ts";
import { parseDocumentDate } from "./ocr-parse.ts";

export type MedicalCertificate = {
  ok: boolean;
  clinicName: string;
  practitioner: string;
  certificateNumber: string;
  patientName: string;
  /** First and last day the certificate excuses, inclusive. */
  startDate: string | null;
  endDate: string | null;
  /** The figure printed on the certificate, which may disagree with the range. */
  statedDays: number | null;
  /** What the dates actually span. Derived here, never taken from the model. */
  rangeDays: number | null;
  issuedDate: string | null;
  confidence: Record<string, number>;
  overall: number;
  /** Non-fatal problems an approver should see. */
  warnings: string[];
  model: string;
  durationMs: number;
  error: string;
};

/**
 * The parts of a reading the checks below actually consult.
 *
 * Narrower than `MedicalCertificate` on purpose: the checks run on the client
 * against what the upload endpoint sent back over the wire, which is a subset
 * of the extraction — no model name, no timings, no raw `statedDays`. Typing
 * them to the full record would force the browser to carry fields it has no use
 * for, or force a cast at every call site.
 */
export type ReadCertificate = {
  ok: boolean;
  startDate: string | null;
  endDate: string | null;
  patientName?: string;
  confidence?: Record<string, number>;
};

const text = (value: unknown) => String(value ?? "").trim().slice(0, 300);

const score = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
};

const wholeDays = (value: unknown): number | null => {
  const parsed = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
};

/**
 * Days from start to end counting both ends.
 *
 * A certificate for the 3rd to the 4th is two days off, not one. Counted in UTC
 * from the date parts so a timezone never shifts a boundary.
 */
export function daysBetweenInclusive(start: string, end: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return Math.round((to - from) / 86_400_000) + 1;
}

export const MEDICAL_CERTIFICATE_PROMPT = [
  "You are reading a Malaysian medical certificate (MC) issued by a clinic or hospital, so an HR system can check it against a sick leave request.",
  "",
  "Return ONLY a JSON object, no prose and no code fence, in exactly this shape:",
  `{
  "clinicName": string,
  "practitioner": string,
  "certificateNumber": string,
  "patientName": string,
  "startDate": string,
  "endDate": string,
  "days": string,
  "issuedDate": string,
  "confidence": {
    "clinicName": number, "patientName": number,
    "startDate": number, "endDate": number, "days": number
  }
}`,
  "",
  "Rules:",
  "- Transcribe values exactly as printed. Do not reformat dates or recalculate the number of days.",
  "- startDate and endDate are the first and last day the patient is excused from work, inclusive.",
  "- A certificate for a single day has the same startDate and endDate. Never leave endDate empty in that case.",
  "- issuedDate is when the certificate was signed, which is often but not always the first day excused. Keep them separate.",
  "- days is the figure printed on the certificate. Transcribe it even when it disagrees with the dates.",
  "- practitioner is the doctor's name, not the clinic's.",
  "- Use an empty string for any field that is not present. Never invent a value.",
  "- Confidence is 0 to 1 and means how clearly you could READ that field, not how plausible it looks.",
  "- If a field is handwritten, smudged, stamped over or cut off, give it a low confidence rather than a best guess.",
  "- Malaysian dates are usually day-first. Transcribe exactly as printed and let the caller interpret it.",
].join("\n");

export function emptyCertificate(error: string, durationMs = 0): MedicalCertificate {
  return {
    ok: false, clinicName: "", practitioner: "", certificateNumber: "", patientName: "",
    startDate: null, endDate: null, statedDays: null, rangeDays: null, issuedDate: null,
    confidence: {}, overall: 0, warnings: [], model: "", durationMs, error,
  };
}

/**
 * Normalises what the model returned, and says where it disagrees with itself.
 *
 * Two disagreements matter enough to name. A certificate whose printed day
 * count does not match its own date range has been misread or is ambiguous, and
 * the range is preferred because it is two readings rather than one. A single
 * date with no end is treated as one day, which is how a same-day MC is almost
 * always printed — but it is said out loud rather than assumed silently.
 */
export function toCertificate(parsed: Record<string, any>): MedicalCertificate {
  const warnings: string[] = [];

  const startDate = parseDocumentDate(parsed?.startDate);
  let endDate = parseDocumentDate(parsed?.endDate);
  const issuedDate = parseDocumentDate(parsed?.issuedDate);
  const statedDays = wholeDays(parsed?.days);

  if (parsed?.startDate && !startDate) warnings.push(`Could not read the first day "${text(parsed.startDate)}".`);
  if (parsed?.endDate && !endDate) warnings.push(`Could not read the last day "${text(parsed.endDate)}".`);

  if (startDate && !endDate) {
    // A one-day MC usually prints a single date. Derive the end so the leave
    // form has a range, and say so rather than letting it look like a reading.
    endDate = statedDays && statedDays > 1
      ? new Date(Date.parse(`${startDate}T00:00:00Z`) + (statedDays - 1) * 86_400_000).toISOString().slice(0, 10)
      : startDate;
    warnings.push(statedDays && statedDays > 1
      ? `Only one date was printed; the last day was worked out from the ${statedDays} days stated.`
      : "Only one date was printed, so this was read as a single day.");
  }

  if (startDate && endDate && endDate < startDate) {
    warnings.push("The last day reads as before the first day. Check the certificate.");
    endDate = null;
  }

  const rangeDays = startDate && endDate ? daysBetweenInclusive(startDate, endDate) : null;

  if (statedDays !== null && rangeDays !== null && statedDays !== rangeDays) {
    warnings.push(`The certificate says ${statedDays} day${statedDays === 1 ? "" : "s"} but the dates cover ${rangeDays}. The dates were used.`);
  }
  if (!startDate) warnings.push("No dates were readable, so the leave dates were not filled in.");

  const rawConfidence = parsed?.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {};
  const confidence: Record<string, number> = {
    clinicName: score(rawConfidence.clinicName),
    patientName: score(rawConfidence.patientName),
    startDate: startDate ? score(rawConfidence.startDate) : 0,
    endDate: endDate ? score(rawConfidence.endDate) : 0,
    days: statedDays === null ? 0 : score(rawConfidence.days),
  };

  // The dates are the only fields anything is done with, so they are the only
  // ones the overall score is allowed to depend on. A crisply printed clinic
  // letterhead must not raise confidence in a handwritten date.
  const dateScores = [confidence.startDate, confidence.endDate];
  const overall = dateScores.reduce((sum, value) => sum + value, 0) / dateScores.length;

  return {
    ok: true,
    clinicName: text(parsed?.clinicName),
    practitioner: text(parsed?.practitioner),
    certificateNumber: text(parsed?.certificateNumber),
    patientName: text(parsed?.patientName),
    startDate, endDate, statedDays, rangeDays, issuedDate,
    confidence, overall, warnings,
    model: "", durationMs: 0, error: "",
  };
}

/**
 * The leave dates to offer, or nothing.
 *
 * Withheld below a confidence floor: a half-read date quietly dropped into the
 * form is worse than an empty field, because an empty field gets filled in and
 * a wrong one gets submitted. The threshold is deliberately low — the employee
 * still sees and confirms whatever lands in the form.
 */
export function suggestLeaveFromCertificate(
  certificate: MedicalCertificate,
  { minimumConfidence = 0.5 } = {},
): { startDate: string; endDate: string } | null {
  if (!certificate.ok || !certificate.startDate || !certificate.endDate) return null;
  if (certificate.overall < minimumConfidence) return null;
  return { startDate: certificate.startDate, endDate: certificate.endDate };
}

/**
 * Whether the certificate actually covers the leave being asked for.
 *
 * The reason this feature earns its place. Sick leave is the one type that
 * comes with evidence, and nothing was checking the evidence against the
 * request — a two-day certificate attached to a week off went through looking
 * exactly like a valid one. This does not block anything; it tells the employee
 * before they submit and the approver before they approve.
 */
export function certificateCoverage(
  certificate: ReadCertificate | null,
  leave: { startDate?: string; endDate?: string },
): { covered: boolean; message: string } {
  const start = String(leave?.startDate ?? "").trim();
  const end = String(leave?.endDate ?? "").trim() || start;

  if (!certificate?.ok || !certificate.startDate || !certificate.endDate) return { covered: true, message: "" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { covered: true, message: "" };

  const before = start < certificate.startDate;
  const after = end > certificate.endDate;
  if (!before && !after) return { covered: true, message: "" };

  const range = certificate.startDate === certificate.endDate
    ? certificate.startDate
    : `${certificate.startDate} to ${certificate.endDate}`;

  return {
    covered: false,
    message: before && after
      ? `The certificate covers ${range}, which is inside the leave you are asking for.`
      : before
        ? `The certificate starts on ${certificate.startDate}, after the leave you are asking for.`
        : `The certificate ends on ${certificate.endDate}, before the leave you are asking for.`,
  };
}

/**
 * Whether the certificate names the person applying.
 *
 * Compared loosely on purpose: a certificate reads "MUHAMMAD AFIQ BIN ISMAIL"
 * where the record says "Muhammad Afiq", and initials, honorifics and middle
 * names all vary. Only a complete absence of overlap is reported, which catches
 * the case that matters — somebody else's certificate attached by mistake.
 */
export function certificateNameMismatch(certificate: ReadCertificate | null, employeeName: string): string {
  const onCertificate = String(certificate?.patientName ?? "").toLowerCase();
  const onRecord = String(employeeName ?? "").toLowerCase();
  if (!certificate?.ok || !onCertificate || !onRecord) return "";
  if ((certificate.confidence?.patientName ?? 0) < 0.5) return "";

  const parts = onRecord.split(/[^a-z]+/).filter((part) => part.length > 2);
  if (!parts.length) return "";
  if (parts.some((part) => onCertificate.includes(part))) return "";

  return `The certificate names ${certificate.patientName}, which does not match your record.`;
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
 * Reads a certificate image and returns normalised, cross-checked fields.
 *
 * Never throws. Extraction failure — a blurred photo, an unreachable model, a
 * reply that is prose — is an expected state, and the certificate is already
 * stored by the time this runs. The form stays keyable either way.
 */
export async function extractMedicalCertificate({
  imageDataUrl,
}: {
  imageDataUrl: string;
}): Promise<MedicalCertificate> {
  const started = Date.now();

  if (!/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(imageDataUrl)) {
    return emptyCertificate("The certificate must be a JPEG, PNG, WEBP or PDF data URL.");
  }

  let content = "";
  let model = "";
  try {
    const result = await aiNonymauzChat({
      messages: [imageMessage(MEDICAL_CERTIFICATE_PROMPT, imageDataUrl)],
      mode: "vision",
      temperature: 0,
      useRag: false,
      useTools: false,
      maxTokens: 1200,
    });
    content = result.content;
    model = result.model;
  } catch (error) {
    return emptyCertificate(
      error instanceof Error ? error.message : "The extraction service is unavailable.",
      Date.now() - started,
    );
  }

  const parsed = parseModelJson(content);
  if (!parsed) return emptyCertificate("The extraction did not return readable fields.", Date.now() - started);

  return { ...toCertificate(parsed), model, durationMs: Date.now() - started };
}

/**
 * Shared pieces of the two AI writing helpers.
 *
 * "Improve with AI" rewrites what the user typed; "Generate with AI" writes the
 * field from nothing. They differ in one instruction and share everything else —
 * the same anti-invention rules, the same house voice, and the same idea of what
 * "the record this field belongs to" means — so those live here rather than
 * drifting apart in two route files.
 */

export type SubjectDetail = { label: string; value: string };

/** Trims one detail label/value pair to something a prompt can carry. */
function tidyDetail(label: unknown, value: unknown): SubjectDetail | null {
  const cleanLabel = String(label ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const cleanValue = String(value ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 240);
  if (!cleanLabel || !cleanValue) return null;
  return { label: cleanLabel, value: cleanValue };
}

/**
 * Reads the record snapshot a client sends, accepting either an array of
 * label/value pairs or a plain object, and caps it so one enormous form cannot
 * push the actual instruction out of the model's context.
 */
export function parseSubjectDetails(
  raw: unknown,
  skipLabel = "",
  maxEntries = 24,
  maxChars = 2600,
): SubjectDetail[] {
  const candidates: SubjectDetail[] = [];

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const detail = tidyDetail((entry as any).label, (entry as any).value);
      if (detail) candidates.push(detail);
    }
  } else if (raw && typeof raw === "object") {
    for (const [label, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === null || value === undefined || typeof value === "object") continue;
      const detail = tidyDetail(label, value);
      if (detail) candidates.push(detail);
    }
  }

  // The field being written is already sent on its own, and handing it back as
  // evidence about itself only encourages the model to repeat it.
  const skip = skipLabel.trim().toLowerCase();
  const seen = new Set<string>();
  const details: SubjectDetail[] = [];
  let budget = maxChars;

  for (const detail of candidates) {
    const key = detail.label.toLowerCase();
    if (seen.has(key) || key === skip) continue;
    const cost = detail.label.length + detail.value.length + 3;
    if (cost > budget) continue;
    seen.add(key);
    budget -= cost;
    details.push(detail);
    if (details.length >= maxEntries) break;
  }

  return details;
}

/** Flattens a snapshot into the plain text used for language detection. */
export function detailsText(details: SubjectDetail[]): string {
  return details.map((detail) => `${detail.label}: ${detail.value}`).join("\n");
}

/**
 * The rules that keep AI writing usable in front of a paying client: nothing
 * invented, nothing inflated, and no words the team would have to delete.
 */
export const WRITING_GUARDRAILS = [
  "Keep every proper name, number, price, date, product detail, constraint and intended meaning accurate.",
  "Do not invent claims, certifications, ingredients, results, features, camera facts, awards or client information.",
  "Avoid corporate filler and AI-sounding language such as elevate, revolutionise, captivating, stunning, masterpiece, ultra-detailed, game-changing, seamless or world-class unless the user explicitly wrote it for a factual reason.",
  "Preserve every {{token}} exactly as written, keep one item per line where the draft or field is a list, and keep existing line breaks.",
  "Do not explain your writing, do not add a preamble, and do not wrap the result in quotation marks.",
];

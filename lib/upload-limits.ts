/**
 * How large a supporting file may be, and what has to happen to get it there.
 *
 * The stated limit was 2 MB, which is under a single photograph from any phone
 * made in the last decade — so the commonest case, someone photographing a
 * receipt, failed by default and the fix was to go and find a compressor.
 *
 * Raising the number alone would not have fixed it, because of how the file
 * travels. Uploads go as a base64 data URL inside a JSON body, and base64 costs
 * a third more than the bytes it carries: a 5 MB file becomes a ~6.7 MB
 * request. Serverless platforms cap request bodies well below that — Vercel,
 * where this deploys, at 4.5 MB — so the platform rejects it before any code
 * here runs, and the user gets an opaque failure rather than a message.
 *
 * Working backwards from the cap gives the real ceiling for the wire: about
 * 3.3 MB of actual file. So the limit is 5 MB and images are downscaled to fit
 * beneath the wire budget before they are sent, which is what makes the limit
 * true rather than aspirational. A PDF cannot be downscaled, so one too large
 * to transmit is refused here with an explanation instead of failing at the
 * edge with none.
 *
 * Pure, and asserted directly in `upload-limits.test.ts`.
 */

/** What a person may choose. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * What may actually go over the wire, after base64.
 *
 * Held below the platform's 4.5 MB body cap rather than at it: the JSON around
 * the data URL — filename, purpose, employee id — costs a little more, and a
 * limit that only just fits is one that fails on a long filename.
 */
export const MAX_REQUEST_BYTES = 4_000_000;

/** base64 carries three bytes in every four characters. */
export const BASE64_OVERHEAD = 4 / 3;

/** The largest file that still fits the request budget once encoded. */
export const MAX_TRANSPORT_BYTES = Math.floor(MAX_REQUEST_BYTES / BASE64_OVERHEAD);

/** Characters a data URL of this many bytes will occupy, encoding included. */
export const MAX_DATA_URL_CHARACTERS = Math.ceil(MAX_UPLOAD_BYTES * BASE64_OVERHEAD) + 200;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const UPLOAD_TYPES = [...IMAGE_TYPES, "application/pdf"];

export function isImageType(type: string) {
  return IMAGE_TYPES.includes(String(type ?? "").trim().toLowerCase());
}

/** Bytes carried by a base64 data URL, from its length alone. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = String(dataUrl ?? "").split(",")[1] ?? "";
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

/** "4.2 MB", the way a person would say it. */
export function describeSize(bytes: number): string {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export type UploadCheck =
  | { ok: true; needsCompression: boolean }
  | { ok: false; reason: string };

/**
 * Whether a chosen file can be uploaded, and whether it has to be shrunk first.
 *
 * An image over the wire budget is not an error — it is compressed. A PDF over
 * it is, because there is nothing this can do to make it smaller, and the
 * honest thing is to say so here rather than let the platform drop it.
 */
export function checkUpload({ size, type }: { size: number; type: string }): UploadCheck {
  const bytes = Math.max(0, Number(size) || 0);
  const mimeType = String(type ?? "").trim().toLowerCase();

  if (!UPLOAD_TYPES.includes(mimeType)) {
    return { ok: false, reason: "File must be a PDF, JPG, PNG or WebP." };
  }
  if (bytes <= 0) {
    return { ok: false, reason: "That file appears to be empty." };
  }
  if (bytes > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `File is ${describeSize(bytes)}. The limit is ${describeSize(MAX_UPLOAD_BYTES)}.` };
  }
  if (bytes > MAX_TRANSPORT_BYTES && !isImageType(mimeType)) {
    return {
      ok: false,
      reason: `This PDF is ${describeSize(bytes)}, which is too large to send in one request. Split it or export it at a lower quality — images of any size up to ${describeSize(MAX_UPLOAD_BYTES)} are compressed automatically.`,
    };
  }
  return { ok: true, needsCompression: bytes > MAX_TRANSPORT_BYTES || isImageType(mimeType) && bytes > MAX_TRANSPORT_BYTES };
}

/**
 * How far an image's longest edge should be scaled to reach a target size.
 *
 * File size tracks pixel *area*, so halving the size means scaling each edge by
 * the square root — scaling both edges by half would quarter the area and throw
 * away far more detail than asked for. Never scales up, and never below a
 * quarter in one pass, so a wildly oversized photo steps down rather than
 * collapsing to something unreadable.
 */
export function scaleForTarget(currentBytes: number, targetBytes: number): number {
  const current = Math.max(1, Number(currentBytes) || 0);
  const target = Math.max(1, Number(targetBytes) || 0);
  if (current <= target) return 1;
  return Math.max(0.25, Math.sqrt(target / current));
}

/**
 * The longest edge to render an image at.
 *
 * Capped at 2400px regardless of the arithmetic: a receipt or a medical
 * certificate is read, not zoomed into, and past that the extra pixels cost
 * upload time and database bytes without making anything more legible.
 */
export const MAX_IMAGE_EDGE = 2400;

export function targetEdge(width: number, height: number, scale: number): { width: number; height: number } {
  const longest = Math.max(1, width, height);
  const capped = Math.min(scale, MAX_IMAGE_EDGE / longest);
  const factor = Math.min(1, Math.max(0.05, capped));
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

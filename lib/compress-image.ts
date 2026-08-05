"use client";

/**
 * Shrinks a chosen image until it fits the request budget.
 *
 * A 5 MB limit is only true if a 5 MB file arrives, and base64 over JSON cannot
 * carry one — see `upload-limits.ts` for the arithmetic. So an oversized image
 * is redrawn smaller rather than refused, which is what a person expects when
 * they pick a photograph of a receipt off their phone.
 *
 * Deliberately thin: every decision it makes lives in `upload-limits.ts` and is
 * tested there. What is left here is canvas work, which needs a browser and so
 * cannot be. Keeping the split at that line means the part that can be wrong in
 * an interesting way is the part under test.
 */

import {
  dataUrlBytes, isImageType, MAX_TRANSPORT_BYTES, scaleForTarget, targetEdge,
} from "./upload-limits.ts";

/** How many times to redraw before accepting what we have. */
const MAX_PASSES = 4;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that image."));
    image.src = dataUrl;
  });
}

export type PreparedFile = {
  dataUrl: string;
  bytes: number;
  /** True when the image was redrawn, so the caller can say so. */
  compressed: boolean;
  originalBytes: number;
};

/**
 * A file ready to send, compressed if it had to be.
 *
 * PDFs and images already within budget pass through untouched — re-encoding an
 * image that was fine would lose quality for nothing.
 *
 * Redraws in passes because JPEG quality is not linear: the first estimate is
 * from pixel area, and if the encoder lands over budget anyway the next pass
 * uses what actually came back rather than the guess. It gives up after a few
 * passes and returns the smallest it managed — a slightly oversized upload that
 * fails with a clear message beats a loop that never ends.
 */
export async function prepareUpload(file: File): Promise<PreparedFile> {
  const original = await readAsDataUrl(file);
  const originalBytes = file.size || dataUrlBytes(original);

  if (!isImageType(file.type) || originalBytes <= MAX_TRANSPORT_BYTES) {
    return { dataUrl: original, bytes: originalBytes, compressed: false, originalBytes };
  }

  const image = await loadImage(original);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return { dataUrl: original, bytes: originalBytes, compressed: false, originalBytes };

  let best = original;
  let bestBytes = originalBytes;
  let bytes = originalBytes;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const scale = scaleForTarget(bytes, MAX_TRANSPORT_BYTES);
    const size = targetEdge(image.naturalWidth || image.width, image.naturalHeight || image.height, scale);

    canvas.width = size.width;
    canvas.height = size.height;
    // White behind the drawing: a transparent PNG re-encoded as JPEG would
    // otherwise pick up black wherever it was see-through.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);

    // JPEG regardless of what came in — a photograph of a receipt has no use
    // for PNG's lossless pixels, and they are most of why it was too big.
    const candidate = canvas.toDataURL("image/jpeg", 0.82);
    const candidateBytes = dataUrlBytes(candidate);

    if (candidateBytes < bestBytes) {
      best = candidate;
      bestBytes = candidateBytes;
    }
    if (candidateBytes <= MAX_TRANSPORT_BYTES) break;
    // Feed the measured size back in rather than the estimate that missed.
    bytes = candidateBytes;
  }

  return { dataUrl: best, bytes: bestBytes, compressed: best !== original, originalBytes };
}

/**
 * Converting a VAPID public key for `PushManager.subscribe`.
 *
 * The server publishes the key as base64url text. `applicationServerKey` wants
 * raw bytes. Getting the conversion wrong fails in the worst possible way: the
 * subscribe call rejects with a generic error, or worse succeeds against a
 * malformed key and every push is silently dropped by the push service, with
 * nothing on either end saying why.
 *
 * Two differences from ordinary base64, and both matter. base64url swaps `+`
 * and `/` for `-` and `_`, and it usually drops the `=` padding — `atob`
 * accepts neither.
 *
 * Pure, and asserted in `push-key.test.ts`.
 */

/**
 * base64url text to the bytes it encodes.
 *
 * Throws on input that is not decodable rather than returning an empty array: a
 * zero-length key would be handed to the browser, which would reject it with a
 * message naming nothing useful.
 */
/*
 * `Uint8Array<ArrayBuffer>` rather than a bare `Uint8Array`: since TypeScript
 * 5.7 the bare form is generic over `ArrayBufferLike`, which includes
 * `SharedArrayBuffer` and so is not assignable to the `BufferSource` that
 * `applicationServerKey` wants. Pinning it here keeps the cast out of the
 * caller.
 */
export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const text = String(value ?? "").trim();
  if (!text) throw new Error("The push key is empty.");

  // Pad back to a multiple of four, which is what the encoder dropped.
  const padded = text.padEnd(text.length + ((4 - (text.length % 4)) % 4), "=");
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("The push key is not valid base64url.");

  const binary = typeof atob === "function"
    ? atob(base64)
    : Buffer.from(base64, "base64").toString("binary");

  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * The length an uncompressed P-256 public key must be.
 *
 * 0x04 followed by two 32-byte coordinates. Checked because a truncated or
 * doubled key is the likeliest way a copy-pasted environment variable goes
 * wrong, and it is invisible until notifications quietly never arrive.
 */
export const VAPID_KEY_BYTES = 65;

export function toApplicationServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const bytes = decodeBase64Url(publicKey);
  if (bytes.length !== VAPID_KEY_BYTES) {
    throw new Error(`The push key decodes to ${bytes.length} bytes; a VAPID key is ${VAPID_KEY_BYTES}.`);
  }
  if (bytes[0] !== 0x04) throw new Error("The push key is not an uncompressed P-256 point.");
  return bytes;
}

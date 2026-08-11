import assert from "node:assert/strict";
import test from "node:test";
import { decodeBase64Url, toApplicationServerKey, VAPID_KEY_BYTES } from "./push-key.ts";

/** A well-formed key: 0x04 then 64 bytes, encoded the way a server publishes it. */
function sampleKey(bytes = VAPID_KEY_BYTES, lead = 0x04) {
  const raw = Buffer.alloc(bytes);
  raw[0] = lead;
  for (let index = 1; index < bytes; index += 1) raw[index] = (index * 7) % 256;
  return { raw, encoded: raw.toString("base64url") };
}

test("base64url decodes to exactly the bytes that were encoded", () => {
  const { raw, encoded } = sampleKey();
  assert.deepEqual(Buffer.from(decodeBase64Url(encoded)), raw);
});

test("the missing padding is put back", () => {
  // Lengths 1..3 mod 4 all need padding; a decoder that forgets throws on some
  // keys and not others, which is why this is the bug that ships.
  for (const size of [10, 11, 12, 13]) {
    const raw = Buffer.alloc(size, 9);
    const encoded = raw.toString("base64url");
    assert.deepEqual(Buffer.from(decodeBase64Url(encoded)), raw, `${size} bytes failed`);
  }
});

test("the url-safe alphabet is translated back", () => {
  // 0xfb 0xff produces both '-' and '_' in base64url and '+' and '/' in base64.
  const raw = Buffer.from([0xfb, 0xff, 0xbf, 0xfb, 0xef, 0xbe]);
  const encoded = raw.toString("base64url");
  assert.ok(/[-_]/.test(encoded), "the fixture should exercise the url-safe characters");
  assert.deepEqual(Buffer.from(decodeBase64Url(encoded)), raw);
});

test("an empty or unreadable key is refused, not silently emptied", () => {
  // A zero-length key handed to the browser fails with a message naming nothing.
  assert.throws(() => decodeBase64Url(""), /empty/);
  assert.throws(() => decodeBase64Url("   "), /empty/);
  assert.throws(() => decodeBase64Url("not valid!@£$"), /base64url/);
});

test("a real-shaped VAPID key is accepted", () => {
  const { raw, encoded } = sampleKey();
  const result = toApplicationServerKey(encoded);
  assert.equal(result.length, VAPID_KEY_BYTES);
  assert.equal(result[0], 0x04);
  assert.deepEqual(Buffer.from(result), raw);
});

test("a truncated key is caught with its actual length", () => {
  // The likeliest way an environment variable goes wrong, and otherwise
  // invisible until notifications quietly never arrive.
  const { encoded } = sampleKey(40);
  assert.throws(() => toApplicationServerKey(encoded), /decodes to 40 bytes/);
});

test("a key that is not an uncompressed point is caught", () => {
  const { encoded } = sampleKey(VAPID_KEY_BYTES, 0x02);
  assert.throws(() => toApplicationServerKey(encoded), /uncompressed P-256/);
});

test("surrounding whitespace from a pasted variable is tolerated", () => {
  const { raw, encoded } = sampleKey();
  assert.deepEqual(Buffer.from(toApplicationServerKey(`  ${encoded}\n`)), raw);
});

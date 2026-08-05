import assert from "node:assert/strict";
import test from "node:test";
import {
  checkUpload,
  dataUrlBytes,
  describeSize,
  isImageType,
  MAX_IMAGE_EDGE,
  MAX_TRANSPORT_BYTES,
  MAX_UPLOAD_BYTES,
  scaleForTarget,
  targetEdge,
} from "./upload-limits.ts";

const MB = 1024 * 1024;

test("the wire budget sits below the stated limit, because base64 costs a third", () => {
  assert.equal(MAX_UPLOAD_BYTES, 5 * MB);
  assert.ok(MAX_TRANSPORT_BYTES < MAX_UPLOAD_BYTES);
  // 4,000,000 bytes of request budget carries three quarters of itself as
  // actual file, so anything larger than this has to be shrunk before it is
  // sent — which is the whole reason compression exists below.
  assert.equal(MAX_TRANSPORT_BYTES, 3_000_000);
});

test("bytes are read back from a data URL's own length", () => {
  // "AAAA" is four base64 characters with no padding: three bytes.
  assert.equal(dataUrlBytes("data:image/png;base64,AAAA"), 3);
  assert.equal(dataUrlBytes("data:image/png;base64,AAA="), 2);
  assert.equal(dataUrlBytes("data:image/png;base64,AA=="), 1);
  assert.equal(dataUrlBytes(""), 0);
  assert.equal(dataUrlBytes("not a data url"), 0);
});

test("sizes read the way somebody would say them", () => {
  assert.equal(describeSize(512), "512 B");
  assert.equal(describeSize(2048), "2 KB");
  assert.equal(describeSize(4.2 * MB), "4.2 MB");
  assert.equal(describeSize(-1), "0 B");
});

test("images and PDFs are the accepted kinds", () => {
  assert.equal(isImageType("image/jpeg"), true);
  assert.equal(isImageType("IMAGE/PNG"), true);
  assert.equal(isImageType("application/pdf"), false);
  assert.equal(checkUpload({ size: 1000, type: "image/gif" }).ok, false);
  assert.equal(checkUpload({ size: 1000, type: "text/html" }).ok, false);
});

test("a small file of an accepted kind just uploads", () => {
  const result = checkUpload({ size: 400 * 1024, type: "application/pdf" });
  assert.equal(result.ok, true);
});

test("anything over the stated limit is refused, whatever it is", () => {
  const image = checkUpload({ size: 6 * MB, type: "image/jpeg" });
  assert.equal(image.ok, false);
  assert.ok(image.ok === false && image.reason.includes("5.0 MB"), image.ok === false ? image.reason : "");

  assert.equal(checkUpload({ size: 6 * MB, type: "application/pdf" }).ok, false);
});

test("a large photo is accepted and marked for compression rather than rejected", () => {
  // The case that used to fail: a 4 MB phone photograph of a receipt.
  const result = checkUpload({ size: 4 * MB, type: "image/jpeg" });
  assert.equal(result.ok, true);
  assert.equal(result.ok === true && result.needsCompression, true);
});

test("a PDF too large to transmit says why, since it cannot be shrunk", () => {
  const result = checkUpload({ size: 4 * MB, type: "application/pdf" });
  assert.equal(result.ok, false);
  assert.ok(result.ok === false && result.reason.includes("too large to send"));
  assert.ok(result.ok === false && result.reason.includes("images"), "and points at the thing that does work");
});

test("an empty file is caught rather than uploaded as nothing", () => {
  assert.equal(checkUpload({ size: 0, type: "image/png" }).ok, false);
});

test("scaling follows area, not edge length", () => {
  // Halving the bytes means scaling each edge by √½, not by ½ — scaling both
  // edges by half would quarter the area.
  assert.ok(Math.abs(scaleForTarget(1000, 500) - Math.SQRT1_2) < 0.001);
  assert.equal(scaleForTarget(1000, 1000), 1, "already small enough");
  assert.equal(scaleForTarget(500, 1000), 1, "never scales up");
});

test("one pass never collapses an image past a quarter", () => {
  assert.equal(scaleForTarget(100 * MB, 1000), 0.25);
});

test("the longest edge is capped however big the original was", () => {
  const { width, height } = targetEdge(6000, 4000, 1);
  assert.equal(width, MAX_IMAGE_EDGE, "a receipt is read, not zoomed into");
  assert.equal(height, 1600, "and the aspect ratio holds");
});

test("a small image is left at its own size", () => {
  assert.deepEqual(targetEdge(800, 600, 1), { width: 800, height: 600 });
});

test("scale and cap combine, taking whichever is stricter", () => {
  const { width } = targetEdge(4000, 3000, 0.5);
  assert.equal(width, 2000, "half of 4000 is under the cap, so the scale wins");

  const capped = targetEdge(8000, 6000, 0.9);
  assert.equal(capped.width, MAX_IMAGE_EDGE, "90% of 8000 is over the cap, so the cap wins");
});

test("dimensions never round down to nothing", () => {
  const { width, height } = targetEdge(10, 4, 0.05);
  assert.ok(width >= 1 && height >= 1);
});

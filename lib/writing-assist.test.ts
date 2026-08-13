import assert from "node:assert/strict";
import test from "node:test";
import { detailsText, parseSubjectDetails, WRITING_GUARDRAILS } from "./writing-assist.ts";

test("a record snapshot is accepted as pairs or as a plain object", () => {
  assert.deepEqual(
    parseSubjectDetails([{ label: "Customer", value: "Kedai Kek Ratu" }, { label: "Total", value: 1200 }]),
    [{ label: "Customer", value: "Kedai Kek Ratu" }, { label: "Total", value: "1200" }],
  );
  assert.deepEqual(
    parseSubjectDetails({ Customer: "Kedai Kek Ratu", Paid: false, Notes: null, Nested: { a: 1 } }),
    [{ label: "Customer", value: "Kedai Kek Ratu" }, { label: "Paid", value: "false" }],
    "empty and nested values are dropped, everything printable is kept",
  );
});

test("the field being written is not fed back as evidence about itself", () => {
  const details = parseSubjectDetails({ Title: "Raya campaign", Customer: "Kedai Kek Ratu" }, "title");
  assert.deepEqual(details, [{ label: "Customer", value: "Kedai Kek Ratu" }]);
});

test("duplicate labels and blank entries never reach the prompt", () => {
  const details = parseSubjectDetails([
    { label: "Customer", value: "Kedai Kek Ratu" },
    { label: "customer", value: "Something else" },
    { label: "", value: "no label" },
    { label: "Empty", value: "   " },
  ]);
  assert.deepEqual(details, [{ label: "Customer", value: "Kedai Kek Ratu" }]);
});

test("one huge form cannot crowd out the instruction", () => {
  const wide = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`Field ${index}`, `value ${index}`]));
  assert.equal(parseSubjectDetails(wide).length, 24);

  const long = parseSubjectDetails({ Notes: "x".repeat(900) });
  assert.equal(long[0].value.length, 240, "a single value is capped");

  const many = parseSubjectDetails(
    Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`Field ${index}`, "y".repeat(240)])),
  );
  assert.ok(detailsText(many).length <= 2600, "the snapshot as a whole is capped");
});

test("line structure inside a value survives, runaway blank lines do not", () => {
  const details = parseSubjectDetails({ Notes: "Bayaran 50%\n\n\n\nSelebihnya sebelum hantar" });
  assert.equal(details[0].value, "Bayaran 50%\n\nSelebihnya sebelum hantar");
});

test("a snapshot flattens to label: value lines for language detection", () => {
  assert.equal(
    detailsText([{ label: "Customer", value: "Kedai Kek Ratu" }, { label: "Total", value: "1200" }]),
    "Customer: Kedai Kek Ratu\nTotal: 1200",
  );
  assert.equal(detailsText([]), "");
});

test("the guardrails still protect template tokens and list structure", () => {
  const rules = WRITING_GUARDRAILS.join(" ");
  assert.match(rules, /\{\{token\}\} exactly/);
  assert.match(rules, /one item per line/);
  assert.match(rules, /Do not invent/);
});

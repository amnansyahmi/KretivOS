import assert from "node:assert/strict";
import test from "node:test";
import { staleUncleared, statementToBook, suggestClearings, summarise, type BankLine } from "./reconciliation.ts";

const line = (id: string, date: string, amountCents: number, cleared = false): BankLine =>
  ({ id, date, memo: id, reference: "", amountCents, cleared });

test("an account with everything cleared reconciles to the statement", () => {
  const lines = [
    line("a", "2026-07-02", 250_000, true),
    line("b", "2026-07-10", -48_000, true),
    line("c", "2026-07-20", -12_055, true),
  ];
  const summary = summarise(lines, 1899.45);

  assert.equal(summary.bookBalance, 1899.45);
  assert.equal(summary.clearedBalance, 1899.45);
  assert.equal(summary.difference, 0);
  assert.equal(summary.balanced, true);
  assert.equal(summary.unclearedCount, 0);
});

test("uncleared items explain the gap between bank and books", () => {
  const lines = [
    line("cleared-in", "2026-07-02", 250_000, true),
    line("uncleared-cheque", "2026-07-28", -48_000),
    line("uncleared-receipt", "2026-07-30", 30_000),
  ];
  // The bank has only seen the first line.
  const summary = summarise(lines, 2500);

  assert.equal(summary.balanced, true, "cleared side agrees with the statement");
  assert.equal(summary.bookBalance, 2320, "books already carry both uncleared items");
  assert.equal(summary.unclearedPayments, 480);
  assert.equal(summary.unclearedDeposits, 300);

  // The printed form must arrive at the same book balance.
  const proof = statementToBook(summary);
  assert.equal(proof.derivedBookBalance, 2320);
  assert.equal(proof.agrees, true);
});

test("a missing or mistyped amount shows as a difference rather than passing", () => {
  const lines = [line("a", "2026-07-02", 250_000, true), line("b", "2026-07-10", -48_000, true)];
  const summary = summarise(lines, 2019.99);
  assert.equal(summary.balanced, false);
  assert.equal(summary.difference, 0.01, "one sen out is still out");
});

test("the brought-forward balance carries into both sides", () => {
  const lines = [line("a", "2026-08-03", -10_000, true)];
  const summary = summarise(lines, 900, { openingCents: 100_000 });
  assert.equal(summary.bookBalance, 900);
  assert.equal(summary.clearedBalance, 900);
  assert.equal(summary.balanced, true);
});

test("an empty account with no statement movement is balanced", () => {
  const summary = summarise([], 0);
  assert.equal(summary.balanced, true);
  assert.equal(summary.bookBalance, 0);
});

test("cents never drift, however many lines", () => {
  // 0.1 + 0.2 territory: a hundred ten-sen movements must land exactly.
  const lines = Array.from({ length: 100 }, (_, index) => line(`l${index}`, "2026-07-01", 10, true));
  const summary = summarise(lines, 10);
  assert.equal(summary.clearedBalance, 10);
  assert.equal(summary.balanced, true);
});

test("stale uncleared items are the ones worth chasing", () => {
  const lines = [
    line("old-cheque", "2026-03-01", -50_000),
    line("recent", "2026-07-20", -20_000),
    line("old-but-cleared", "2026-03-02", -30_000, true),
  ];
  const stale = staleUncleared(lines, "2026-08-01", 90);
  assert.deepEqual(stale.map((row) => row.id), ["old-cheque"], "cleared items are never stale");
});

test("clearing suggestions refuse to guess between equal amounts", () => {
  const lines = [
    line("unique", "2026-07-02", -48_000),
    line("twin-a", "2026-07-03", -10_000),
    line("twin-b", "2026-07-04", -10_000),
  ];
  // 480 matches exactly one line; 100 matches two, so neither is suggested.
  assert.deepEqual(suggestClearings(lines, [-480, -100]), ["unique"]);
});

test("a suggestion is never made twice for the same line", () => {
  const lines = [line("only", "2026-07-02", -48_000)];
  assert.deepEqual(suggestClearings(lines, [-480, -480]), ["only"]);
});

test("already-cleared lines are not suggested again", () => {
  const lines = [line("done", "2026-07-02", -48_000, true)];
  assert.deepEqual(suggestClearings(lines, [-480]), []);
});

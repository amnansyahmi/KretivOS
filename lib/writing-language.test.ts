import assert from "node:assert/strict";
import test from "node:test";
import {
  detectWritingLanguage,
  enforceLanguage,
  languageDirectives,
  resolveWritingLanguage,
  toMalaysianMalay,
} from "./writing-language.ts";

test("Malay drafts are detected as Malay", () => {
  assert.equal(
    detectWritingLanguage("Kami akan hantar draf ini kepada pelanggan supaya mereka boleh semak dahulu"),
    "malay",
  );
  assert.equal(detectWritingLanguage("Sesi fotografi untuk kedai bunga ini perlu siap sebelum raya"), "malay");
});

test("English drafts are detected as English", () => {
  assert.equal(
    detectWritingLanguage("We will send this draft to the client so that they can review it first"),
    "english",
  );
});

test("Malay-dominant writing with English loanwords stays Malay", () => {
  // Malaysians write like this constantly. It is Malay, and the directives keep
  // the English words as-is rather than translating "follow up" into Malay.
  assert.equal(
    detectWritingLanguage("Kami akan follow up dengan client ini next week untuk confirm the shoot date"),
    "malay",
  );
  assert.match(languageDirectives("malay").join(" "), /Keep every English word the writer chose/);
});

test("genuinely balanced Malay-English writing is left as mixed", () => {
  assert.equal(detectWritingLanguage("We need the shoot done, tapi client belum bayar deposit"), "mixed");
});

test("the surrounding record decides the language when the field is empty", () => {
  // Generate runs on an empty field, so the record's other values carry the
  // language. Without this a Malay workspace gets English drafts.
  assert.equal(detectWritingLanguage("", "Jenama: Kedai Kek Ratu. Audiens: keluarga muda di Shah Alam"), "malay");
});

test("an explicit request beats detection, and anything else falls back to it", () => {
  assert.equal(resolveWritingLanguage("ms", "We will send this to the client"), "malay");
  assert.equal(resolveWritingLanguage("english", "Kami akan hantar kepada pelanggan"), "english");
  assert.equal(resolveWritingLanguage("auto", "Kami akan hantar draf ini kepada pelanggan"), "malay");
  assert.equal(resolveWritingLanguage(undefined, "We will send this draft to the client today"), "english");
});

test("Indonesian vocabulary is repaired into Malaysian Malay", () => {
  // The exact complaint: asking for Malay returned Bahasa Indonesia.
  assert.equal(
    toMalaysianMalay("Anda bisa lihat kualitas layanan perusahaan kami"),
    "Anda boleh lihat kualiti perkhidmatan syarikat kami",
  );
  assert.equal(toMalaysianMalay("Silakan hubungi kantor kami"), "Sila hubungi pejabat kami");
  assert.equal(
    toMalaysianMalay("Nomor faktur dan kwitansi sudah dikirim"),
    "Nombor invois dan resit sudah dikirim",
  );
});

test("the repair keeps the original casing", () => {
  assert.equal(toMalaysianMalay("Bisa juga"), "Boleh juga");
  assert.equal(toMalaysianMalay("KUALITAS terjamin"), "KUALITI terjamin");
});

test("the longest form wins, so a prefix rule cannot mangle a longer word", () => {
  assert.equal(toMalaysianMalay("Sila mengunduh fail itu"), "Sila memuat turun fail itu");
  assert.equal(toMalaysianMalay("standar baharu"), "standard baharu", "no partial match inside standard");
  assert.equal(toMalaysianMalay("Ini adalah standard baharu"), "Ini adalah standard baharu");
});

test("template variables are never rewritten", () => {
  // Print templates address database keys by name; renaming one silently
  // empties that line on every printed quotation.
  assert.equal(
    toMalaysianMalay("Sila jelaskan {{nomor_invois}} sebelum {{jadwal_bayaran}}"),
    "Sila jelaskan {{nomor_invois}} sebelum {{jadwal_bayaran}}",
  );
  assert.equal(
    toMalaysianMalay("Nomor rujukan: {{nomor_invois}}"),
    "Nombor rujukan: {{nomor_invois}}",
  );
});

test("Malay words that are correct in Malaysia are left alone", () => {
  const kept = "Polisi insurans ini rapat dengan pesanan pelanggan";
  assert.equal(toMalaysianMalay(kept), kept);
});

test("English output is not touched by the Malay repair", () => {
  const english = "Design the standard service package for this brand";
  assert.equal(enforceLanguage(english, "english"), english);
  assert.equal(
    enforceLanguage("Kami bisa bantu kualitas konten Anda", "english"),
    "Kami boleh bantu kualiti konten Anda",
    "a Malay reply to an English record is still held to Malaysian Malay",
  );
  assert.equal(enforceLanguage("Anda bisa mula sekarang", "malay"), "Anda boleh mula sekarang");
  assert.equal(
    enforceLanguage("Kami akan follow up, dan client bisa review dulu", "mixed"),
    "Kami akan follow up, dan client boleh review dulu",
    "mixed writing still gets Malaysian Malay vocabulary",
  );
});

test("the model is told which language to use, and never to use Indonesian", () => {
  const malay = languageDirectives("malay").join(" ");
  assert.match(malay, /Bahasa Melayu Malaysia/);
  assert.match(malay, /never Bahasa Indonesia/);
  assert.match(malay, /boleh \(not bisa\)/, "the instruction is generated from the repair list");

  assert.match(malay, /sila \(not silakan\/silahkan\)/, "variants of one word share a single hint");

  const english = languageDirectives("english").join(" ");
  assert.match(english, /Write in English/);
  assert.doesNotMatch(english, /Bahasa Melayu/);

  assert.match(languageDirectives("mixed").join(" "), /Hold that same balance/);
});

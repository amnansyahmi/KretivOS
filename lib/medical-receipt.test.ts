import assert from "node:assert/strict";
import test from "node:test";
import {
  claimableAmount,
  emptyMedicalReceipt,
  parseRinggitWords,
  receiptPatient,
  toMedicalReceipt,
} from "./medical-receipt.ts";

const sure = { clinicName: 0.95, documentDate: 0.95, patientName: 0.9, billTotal: 0.95, currentPayment: 0.95 };

/**
 * A real Klinik Mediviron receipt, transcribed field for field. The whole
 * module exists because of this document's shape, so it is the fixture.
 */
const MEDIVIRON = {
  clinicName: "Klinik Mediviron Seksyen 22 - Shah Alam",
  receiptNumber: "RCC0000125968",
  billNumber: "BL0024033",
  documentDate: "26/Sep/2025",
  patientName: "NUR ANIS BINTI ALIAS",
  patientNric: "930318016952",
  treatment: "Consultation; Medication;",
  billTotal: "83.00",
  previousPayment: "0.00",
  currentPayment: "83.00",
  balance: "0.00",
  amountInWords: "RM EIGHTY THREE ONLY.",
  paymentMode: "CREDIT CARD - VISA",
  confidence: sure,
};

test("a real clinic receipt reads field for field", () => {
  const receipt = toMedicalReceipt(MEDIVIRON);

  assert.equal(receipt.ok, true);
  assert.equal(receipt.clinicName, "Klinik Mediviron Seksyen 22 - Shah Alam");
  assert.equal(receipt.receiptNumber, "RCC0000125968");
  assert.equal(receipt.billNumber, "BL0024033");
  assert.equal(receipt.documentDate, "2025-09-26", "26/Sep/2025 is day-first");
  assert.equal(receipt.patientName, "NUR ANIS BINTI ALIAS");
  assert.equal(receipt.treatment, "Consultation; Medication;");
  assert.equal(receipt.currentPayment, 83);
  assert.equal(receipt.balance, 0);
  assert.equal(receipt.paymentMode, "CREDIT CARD - VISA");
  assert.deepEqual(receipt.warnings, [], "everything agrees, so nothing is said");
});

test("the NRIC is never carried out of the extraction", () => {
  // It is on the stored image regardless, so reading it costs nothing — but it
  // has no business on a claim record or in an API response.
  const receipt = toMedicalReceipt(MEDIVIRON) as Record<string, any>;
  assert.equal(receipt.patientNric, undefined);
  assert.equal(JSON.stringify(receipt).includes("930318016952"), false);
});

test("what can be claimed is what was paid, not the bill total", () => {
  const receipt = toMedicalReceipt(MEDIVIRON);
  const claim = claimableAmount(receipt);
  assert.equal(claim.amount, 83);
  assert.equal(claim.basis, "current payment");
});

test("a part-paid bill is claimable only for the part paid", () => {
  // The mistake this module exists to prevent: reimbursing a debt the employee
  // still owes the clinic.
  const receipt = toMedicalReceipt({
    ...MEDIVIRON, billTotal: "83.00", previousPayment: "0.00", currentPayment: "50.00", balance: "33.00",
    amountInWords: "RM FIFTY ONLY.",
  });
  const claim = claimableAmount(receipt);

  assert.equal(claim.amount, 50, "not 83");
  assert.match(claim.note, /not the RM 83\.00 bill total/);
  assert.ok(receipt.warnings.some((warning) => /33\.00 is still outstanding/.test(warning)));
});

test("the amount note and the balance warning do not say the same thing twice", () => {
  // Two cards on screen reading as one sentence repeated is worse than one.
  const receipt = toMedicalReceipt({
    ...MEDIVIRON, billTotal: "83.00", previousPayment: "0.00", currentPayment: "50.00", balance: "33.00",
    amountInWords: "RM FIFTY ONLY.",
  });
  const { note } = claimableAmount(receipt);
  assert.ok(!/outstanding/.test(note), `the note repeats the warning: ${note}`);
});

test("a fully paid bill needs no explanation of where the figure came from", () => {
  assert.equal(claimableAmount(toMedicalReceipt(MEDIVIRON)).note, "", "paid in full, so payment and bill total are the same number");
});

test("the balance line is not mistaken for the total", () => {
  // A retail extractor told "the total is the last amount" reads this as 0.00.
  const receipt = toMedicalReceipt(MEDIVIRON);
  assert.notEqual(claimableAmount(receipt).amount, 0);
  assert.equal(receipt.balance, 0, "the balance is still read, just not used as the total");
});

test("a receipt printing a single amount still yields a claim", () => {
  const receipt = toMedicalReceipt({ clinicName: "Klinik Kita", billTotal: "45.00", balance: "0.00", confidence: sure });
  assert.equal(claimableAmount(receipt).amount, 45);
});

test("a receipt with nothing readable claims nothing rather than guessing", () => {
  const receipt = toMedicalReceipt({ clinicName: "Klinik Kita", confidence: sure });
  assert.deepEqual(claimableAmount(receipt), { amount: null, basis: "none", note: "" });
  assert.ok(receipt.warnings.some((warning) => /No amount paid could be read/.test(warning)));
  assert.equal(claimableAmount(emptyMedicalReceipt("offline")).amount, null);
  assert.equal(claimableAmount(null).amount, null);
});

test("the amount in words catches a misread figure", () => {
  // The reason the words are worth parsing: a digit misread on a claim is the
  // error that costs money, and this receipt carries its own check.
  const receipt = toMedicalReceipt({ ...MEDIVIRON, currentPayment: "830.00", billTotal: "830.00" });
  assert.ok(receipt.warnings.some((warning) => /EIGHTY THREE ONLY.*830\.00/.test(warning)), JSON.stringify(receipt.warnings));
});

test("words and figures that agree raise nothing", () => {
  assert.deepEqual(toMedicalReceipt(MEDIVIRON).warnings, []);
});

test("figures that do not add up are reported", () => {
  const receipt = toMedicalReceipt({
    ...MEDIVIRON, billTotal: "120.00", previousPayment: "0.00", currentPayment: "83.00", balance: "0.00",
  });
  assert.ok(receipt.warnings.some((warning) => /come to 83\.00 against a bill of 120\.00/.test(warning)));
});

test("a previous payment counts towards the bill", () => {
  const receipt = toMedicalReceipt({
    ...MEDIVIRON, billTotal: "150.00", previousPayment: "67.00", currentPayment: "83.00", balance: "0.00",
  });
  assert.equal(receipt.warnings.filter((w) => /come to/.test(w)).length, 0, "67 + 83 + 0 = 150, which balances");
  assert.equal(claimableAmount(receipt).amount, 83, "only today's payment is this claim");
});

test("plain amounts in words parse", () => {
  assert.equal(parseRinggitWords("RM EIGHTY THREE ONLY."), 83);
  assert.equal(parseRinggitWords("RINGGIT MALAYSIA ONE HUNDRED AND FIFTY ONLY"), 150);
  assert.equal(parseRinggitWords("TWO THOUSAND FIVE HUNDRED"), 2500);
  assert.equal(parseRinggitWords("ninety nine"), 99);
  assert.equal(parseRinggitWords("RM SEVENTEEN ONLY"), 17);
  assert.equal(parseRinggitWords("ONE THOUSAND"), 1000);
});

test("sen are a fraction, not a second number", () => {
  assert.equal(parseRinggitWords("RM EIGHTY THREE AND FIFTY SEN ONLY"), 83.5);
  assert.equal(parseRinggitWords("RM TWELVE AND FIVE SEN ONLY"), 12.05);
  assert.equal(parseRinggitWords("RM NINE AND NINETY NINE CENTS"), 9.99);
});

test("the common misspelling is accepted", () => {
  assert.equal(parseRinggitWords("RM FOURTY ONLY"), 40, "printed on more Malaysian receipts than not");
});

test("anything not a plain amount reads as nothing rather than as a wrong number", () => {
  // A half-understood cross-check raises false alarms, which is worse than not
  // checking at all.
  assert.equal(parseRinggitWords("RM EIGHTY THREE AND SOMETHING"), null);
  assert.equal(parseRinggitWords("see attached"), null);
  assert.equal(parseRinggitWords(""), null);
  assert.equal(parseRinggitWords(null), null);
  assert.equal(parseRinggitWords("RM ONLY"), null, "currency words alone are not an amount");
});

test("an unparseable amount in words silently skips the check", () => {
  const receipt = toMedicalReceipt({ ...MEDIVIRON, amountInWords: "as per bill attached" });
  assert.equal(receipt.wordsAmount, null);
  assert.deepEqual(receipt.warnings, [], "no words to check against is not a discrepancy");
});

test("a receipt in the employee's own name says nothing", () => {
  const receipt = toMedicalReceipt(MEDIVIRON);
  assert.deepEqual(receiptPatient(receipt, "Nur Anis"), { self: true, message: "" });
  assert.equal(receiptPatient(receipt, "NUR ANIS BINTI ALIAS").self, true);
});

test("a receipt for somebody else is reported as a fact, not a problem", () => {
  // Claiming for a spouse or a child is normal; whether policy allows it is
  // HR's call, so this prompts rather than accuses.
  const result = receiptPatient(toMedicalReceipt(MEDIVIRON), "Amirul Hafiz");
  assert.equal(result.self, false);
  assert.match(result.message, /NUR ANIS BINTI ALIAS/);
  assert.match(result.message, /dependant/);
  assert.ok(!/fraud|invalid|not allowed/i.test(result.message));
});

test("a badly-read patient name accuses nobody", () => {
  const receipt = toMedicalReceipt({ ...MEDIVIRON, confidence: { ...sure, patientName: 0.2 } });
  assert.equal(receiptPatient(receipt, "Amirul Hafiz").self, true);
  assert.equal(receiptPatient(receipt, "").self, true);
  assert.equal(receiptPatient(null, "Amirul Hafiz").self, true);
});

test("an unreadable date is named rather than dropped in silence", () => {
  const receipt = toMedicalReceipt({ ...MEDIVIRON, documentDate: "smudged" });
  assert.equal(receipt.documentDate, null);
  assert.ok(receipt.warnings.some((warning) => /Could not read the date "smudged"/.test(warning)));
});

test("a garbage payload yields an empty receipt rather than throwing", () => {
  const receipt = toMedicalReceipt({});
  assert.equal(receipt.ok, true);
  assert.equal(receipt.currentPayment, null);
  assert.equal(claimableAmount(receipt).amount, null);
});

test("a sen-only amount is a fraction of a ringgit", () => {
  assert.equal(parseRinggitWords("FIFTY SEN ONLY"), 0.5);
  assert.equal(parseRinggitWords("RM NINETY SEN ONLY"), 0.9);
});

test("sen beyond ninety-nine is a misreading, not an amount", () => {
  // "ONE HUNDRED SEN" would be a ringgit, and something has gone wrong.
  assert.equal(parseRinggitWords("RM FIVE AND ONE HUNDRED SEN"), null);
});

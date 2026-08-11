import assert from "node:assert/strict";
import test from "node:test";
import {
  certificateCoverage,
  certificateNameMismatch,
  daysBetweenInclusive,
  emptyCertificate,
  suggestLeaveFromCertificate,
  toCertificate,
} from "./medical-certificate.ts";

const confident = { startDate: 0.95, endDate: 0.95, days: 0.9, clinicName: 0.9, patientName: 0.9 };

test("a certificate covering both ends of a day counts both", () => {
  assert.equal(daysBetweenInclusive("2026-08-03", "2026-08-04"), 2, "the 3rd to the 4th is two days off");
  assert.equal(daysBetweenInclusive("2026-08-03", "2026-08-03"), 1);
  assert.equal(daysBetweenInclusive("2026-08-01", "2026-08-31"), 31);
});

test("a reversed or unreadable range counts nothing", () => {
  assert.equal(daysBetweenInclusive("2026-08-04", "2026-08-03"), null);
  assert.equal(daysBetweenInclusive("", "2026-08-03"), null);
  assert.equal(daysBetweenInclusive("3 Aug", "4 Aug"), null);
});

test("day counting survives a month and a year boundary", () => {
  assert.equal(daysBetweenInclusive("2026-08-30", "2026-09-02"), 4);
  assert.equal(daysBetweenInclusive("2026-12-31", "2027-01-01"), 2);
  assert.equal(daysBetweenInclusive("2028-02-28", "2028-03-01"), 3, "2028 is a leap year");
});

test("an ordinary two-day certificate reads cleanly", () => {
  const result = toCertificate({
    clinicName: "Klinik Kesihatan Subang Jaya",
    practitioner: "Dr Siti Nurhaliza",
    certificateNumber: "MC/2026/00841",
    patientName: "Amirul Hafiz",
    startDate: "03/08/2026",
    endDate: "04/08/2026",
    days: "2",
    confidence: confident,
  });

  assert.equal(result.ok, true);
  assert.equal(result.startDate, "2026-08-03");
  assert.equal(result.endDate, "2026-08-04");
  assert.equal(result.statedDays, 2);
  assert.equal(result.rangeDays, 2);
  assert.deepEqual(result.warnings, [], "nothing disagrees, so nothing is said");
});

test("the range is derived here rather than trusted from the model", () => {
  // The model is told not to recalculate. Even if it returns a wrong count,
  // rangeDays comes from the dates.
  const result = toCertificate({ startDate: "2026-08-03", endDate: "2026-08-05", days: "9", confidence: confident });
  assert.equal(result.rangeDays, 3);
  assert.equal(result.statedDays, 9, "what was printed is kept, not overwritten");
});

test("a printed day count that disagrees with the dates is reported", () => {
  const result = toCertificate({ startDate: "2026-08-03", endDate: "2026-08-05", days: "2", confidence: confident });
  assert.ok(result.warnings.some((warning) => /says 2 days but the dates cover 3/.test(warning)));
});

test("a single-date certificate is read as one day, and says so", () => {
  const result = toCertificate({ startDate: "2026-08-03", endDate: "", days: "1", confidence: confident });
  assert.equal(result.startDate, "2026-08-03");
  assert.equal(result.endDate, "2026-08-03");
  assert.equal(result.rangeDays, 1);
  assert.ok(result.warnings.some((warning) => /single day/.test(warning)), "an inference is never silent");
});

test("one date plus a day count extends the range", () => {
  const result = toCertificate({ startDate: "2026-08-03", endDate: "", days: "3", confidence: confident });
  assert.equal(result.endDate, "2026-08-05", "three days from the 3rd ends on the 5th, not the 6th");
  assert.equal(result.rangeDays, 3);
  assert.ok(result.warnings.some((warning) => /worked out from the 3 days/.test(warning)));
});

test("an end before the start is refused rather than swapped", () => {
  // Swapping would invent a range nobody wrote. The dates are dropped and the
  // employee keys them.
  const result = toCertificate({ startDate: "2026-08-05", endDate: "2026-08-03", days: "3", confidence: confident });
  assert.equal(result.endDate, null);
  assert.equal(result.rangeDays, null);
  assert.ok(result.warnings.some((warning) => /before the first day/.test(warning)));
});

test("an unreadable date is named rather than dropped in silence", () => {
  const result = toCertificate({ startDate: "smudged", endDate: "", confidence: confident });
  assert.equal(result.startDate, null);
  assert.ok(result.warnings.some((warning) => /Could not read the first day "smudged"/.test(warning)));
  assert.ok(result.warnings.some((warning) => /No dates were readable/.test(warning)));
});

test("the issue date is kept apart from the first day excused", () => {
  const result = toCertificate({ startDate: "2026-08-03", endDate: "2026-08-04", issuedDate: "2026-08-02", confidence: confident });
  assert.equal(result.issuedDate, "2026-08-02");
  assert.equal(result.startDate, "2026-08-03", "an MC signed the day before still starts when it says");
});

test("confidence depends on the dates alone", () => {
  // A crisp letterhead must not vouch for a handwritten date.
  const result = toCertificate({
    startDate: "2026-08-03", endDate: "2026-08-04", days: "2",
    clinicName: "Very Legible Clinic Sdn Bhd",
    confidence: { clinicName: 1, patientName: 1, days: 1, startDate: 0.2, endDate: 0.2 },
  });
  assert.ok(result.overall < 0.5, `dates read badly should not score ${result.overall}`);
});

test("a garbage payload yields an empty certificate rather than throwing", () => {
  const result = toCertificate({});
  assert.equal(result.ok, true);
  assert.equal(result.startDate, null);
  assert.equal(result.overall, 0);
});

test("confident dates are offered to the form", () => {
  const certificate = toCertificate({ startDate: "2026-08-03", endDate: "2026-08-04", days: "2", confidence: confident });
  assert.deepEqual(suggestLeaveFromCertificate(certificate), { startDate: "2026-08-03", endDate: "2026-08-04" });
});

test("badly-read dates are withheld, because an empty field gets filled in and a wrong one gets submitted", () => {
  const certificate = toCertificate({
    startDate: "2026-08-03", endDate: "2026-08-04", days: "2",
    confidence: { ...confident, startDate: 0.2, endDate: 0.2 },
  });
  assert.equal(suggestLeaveFromCertificate(certificate), null);
});

test("a failed extraction suggests nothing", () => {
  assert.equal(suggestLeaveFromCertificate(emptyCertificate("service unavailable")), null);
});

test("leave inside the certificate is covered", () => {
  const certificate = toCertificate({ startDate: "2026-08-03", endDate: "2026-08-07", days: "5", confidence: confident });
  assert.equal(certificateCoverage(certificate, { startDate: "2026-08-04", endDate: "2026-08-05" }).covered, true);
  assert.equal(certificateCoverage(certificate, { startDate: "2026-08-03", endDate: "2026-08-07" }).covered, true, "exactly matching is covered");
});

test("leave running past the certificate is reported", () => {
  const certificate = toCertificate({ startDate: "2026-08-03", endDate: "2026-08-04", days: "2", confidence: confident });
  const result = certificateCoverage(certificate, { startDate: "2026-08-03", endDate: "2026-08-07" });
  assert.equal(result.covered, false);
  assert.match(result.message, /ends on 2026-08-04, before the leave/);
});

test("leave starting before the certificate is reported", () => {
  const certificate = toCertificate({ startDate: "2026-08-05", endDate: "2026-08-06", days: "2", confidence: confident });
  const result = certificateCoverage(certificate, { startDate: "2026-08-03", endDate: "2026-08-06" });
  assert.equal(result.covered, false);
  assert.match(result.message, /starts on 2026-08-05, after the leave/);
});

test("a certificate sitting inside a longer absence is reported once", () => {
  const certificate = toCertificate({ startDate: "2026-08-04", endDate: "2026-08-05", days: "2", confidence: confident });
  const result = certificateCoverage(certificate, { startDate: "2026-08-03", endDate: "2026-08-07" });
  assert.equal(result.covered, false);
  assert.match(result.message, /inside the leave/);
});

test("a single-day request needs no end date to be checked", () => {
  const certificate = toCertificate({ startDate: "2026-08-03", endDate: "2026-08-03", days: "1", confidence: confident });
  assert.equal(certificateCoverage(certificate, { startDate: "2026-08-03" }).covered, true);
  assert.equal(certificateCoverage(certificate, { startDate: "2026-08-04" }).covered, false);
});

test("nothing is claimed when there is nothing to check against", () => {
  const certificate = toCertificate({ startDate: "2026-08-03", endDate: "2026-08-04", confidence: confident });
  assert.equal(certificateCoverage(null, { startDate: "2026-08-03" }).covered, true);
  assert.equal(certificateCoverage(certificate, {}).covered, true, "an unfilled form is not a mismatch");
  assert.equal(certificateCoverage(emptyCertificate("failed"), { startDate: "2026-08-03" }).covered, true);
});

test("a certificate in somebody else's name is caught", () => {
  const certificate = toCertificate({ startDate: "2026-08-03", endDate: "2026-08-03", patientName: "Nurfadilah Binti Rahman", confidence: confident });
  assert.match(certificateNameMismatch(certificate, "Amirul Hafiz"), /does not match your record/);
});

test("the usual spelling differences are not treated as mismatches", () => {
  const full = toCertificate({ startDate: "2026-08-03", endDate: "2026-08-03", patientName: "MUHAMMAD AFIQ BIN ISMAIL", confidence: confident });
  assert.equal(certificateNameMismatch(full, "Muhammad Afiq"), "", "a full legal name on the MC is normal");

  const short = toCertificate({ startDate: "2026-08-03", endDate: "2026-08-03", patientName: "Amirul", confidence: confident });
  assert.equal(certificateNameMismatch(short, "Amirul Hafiz"), "", "a partial name is normal too");
});

test("a badly-read name accuses nobody", () => {
  const certificate = toCertificate({
    startDate: "2026-08-03", endDate: "2026-08-03", patientName: "Nurfadilah",
    confidence: { ...confident, patientName: 0.2 },
  });
  assert.equal(certificateNameMismatch(certificate, "Amirul Hafiz"), "", "a smudged name is not evidence of fraud");
  assert.equal(certificateNameMismatch(certificate, ""), "");
});

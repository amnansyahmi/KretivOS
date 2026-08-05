import assert from "node:assert/strict";
import test from "node:test";
import {
  ageAtPeriod,
  annualTax,
  bandUpperLimit,
  computePayroll,
  eisContribution,
  epfContribution,
  monthlyTaxDeduction,
  profileForPeriod,
  socsoContribution,
  SEEDED_PROFILE,
  toStatutoryProfile,
  type StatutoryProfile,
} from "./payroll-statutory.ts";

const profile = SEEDED_PROFILE;

/** A profile with an explicit table, to prove a pasted schedule wins. */
const tabled: StatutoryProfile = {
  ...profile,
  socso: {
    ...profile.socso,
    table: [
      { upTo: 1000, employee: 4.5, employer: 15.75 },
      { upTo: 2000, employee: 9.75, employer: 34.15 },
      { upTo: 6000, employee: 29.75, employer: 104.15 },
    ],
  },
};

test("a wage band is the top of the range it falls in", () => {
  assert.equal(bandUpperLimit(3000, 20), 3000, "a wage on the boundary belongs to the band ending there");
  assert.equal(bandUpperLimit(3001, 20), 3020);
  assert.equal(bandUpperLimit(3019.99, 20), 3020);
  assert.equal(bandUpperLimit(0, 20), 0);
});

test("EPF is banded and rounds up to the ringgit", () => {
  // RM3,000 exactly: 11% is 330, and the employer's 13% is 390 because the
  // wage is under the threshold.
  assert.deepEqual(epfContribution(3000, profile), { employee: 330, employer: 390 });

  // RM3,001 is in the same band as RM3,020, so both contribute identically.
  assert.deepEqual(epfContribution(3001, profile), epfContribution(3020, profile));

  // 3020 × 11% = 332.20, which is paid as 333 rather than 332.
  assert.equal(epfContribution(3001, profile).employee, 333);
});

test("the employer's EPF share steps down above the threshold", () => {
  assert.equal(epfContribution(5000, profile).employer, 650, "13% at the threshold");
  // 5020 × 12% = 602.40 → 603. Lower than at RM5,000 despite the higher wage,
  // which is the step working as intended rather than an error.
  assert.equal(epfContribution(5001, profile).employer, 603);
});

test("EPF stops banding above the exact-rate cut-off", () => {
  // 25,000 is past exactAbove, so the percentage applies to the wage itself.
  assert.deepEqual(epfContribution(25000, profile), { employee: 2750, employer: 3000 });
});

test("EPF follows the senior rates from 60", () => {
  assert.deepEqual(epfContribution(4000, profile, { age: 60 }), { employee: 0, employer: 160 });
  assert.equal(epfContribution(4000, profile, { age: 59 }).employee, 440);
});

test("EPF can be switched off for an employee it does not apply to", () => {
  assert.deepEqual(epfContribution(4000, profile, { epfApplicable: false }), { employee: 0, employer: 0 });
});

test("SOCSO caps the wage it counts", () => {
  const atCeiling = socsoContribution(6000, profile);
  assert.deepEqual(socsoContribution(9000, profile), atCeiling, "a wage over the ceiling contributes as though it stopped there");
  assert.equal(atCeiling.employee, 30);
  assert.equal(atCeiling.employer, 105);
});

test("SOCSO becomes employer-only from 60", () => {
  const senior = socsoContribution(3000, profile, { age: 61 });
  assert.equal(senior.employee, 0);
  assert.equal(senior.employer, 37.5, "the employer keeps paying at the senior rate");
});

test("a pasted SOCSO table takes over from the rates", () => {
  assert.deepEqual(socsoContribution(1500, tabled), { employee: 9.75, employer: 34.15 });
  assert.deepEqual(socsoContribution(900, tabled), { employee: 4.5, employer: 15.75 });
  // Over the ceiling still lands in the last band rather than falling off it.
  assert.deepEqual(socsoContribution(20000, tabled), { employee: 29.75, employer: 104.15 });
});

test("a senior pays nothing even where a table lists a figure", () => {
  assert.equal(socsoContribution(1500, tabled, { age: 65 }).employee, 0);
  assert.equal(socsoContribution(1500, tabled, { age: 65 }).employer, 34.15);
});

test("EIS stops entirely at the maximum age", () => {
  assert.deepEqual(eisContribution(3000, profile, { age: 60 }), { employee: 0, employer: 0 });
  assert.deepEqual(eisContribution(3000, profile, { age: 59 }), { employee: 6, employer: 6 });
});

test("annual tax walks the bands rather than jumping to the top rate", () => {
  assert.equal(annualTax(5000, profile.pcb.bands), 0, "the first band is free of tax");
  // 15,000 of the second band at 1%.
  assert.equal(annualTax(20000, profile.pcb.bands), 150);
  // Plus 15,000 of the third at 3%.
  assert.equal(annualTax(35000, profile.pcb.bands), 600);
  // Only the slice above 35,000 is taxed at 6%, not the whole income.
  assert.equal(annualTax(40000, profile.pcb.bands), 900);
});

test("a modest single earner owes no PCB once relief and rebate are applied", () => {
  // RM3,000 a month projects to RM36,000, and relief takes chargeable income
  // well below the rebate threshold.
  const pcb = monthlyTaxDeduction({ grossPay: 3000, epfEmployee: 330, monthOfYear: 1 }, profile, {
    maritalStatus: "Single",
    taxResident: true,
  });
  assert.equal(pcb, 0);
});

test("PCB rises with income and is spread over the months left", () => {
  const january = monthlyTaxDeduction({ grossPay: 12000, epfEmployee: 1320, monthOfYear: 1 }, profile, {
    maritalStatus: "Single",
    taxResident: true,
  });
  assert.ok(january > 0, "a RM144,000 projected year is taxable");

  // The same annual picture, but with only one month left to collect it in,
  // so each remaining month carries more.
  const december = monthlyTaxDeduction({
    grossPay: 12000,
    epfEmployee: 1320,
    monthOfYear: 12,
    yearToDateGross: 132000,
    yearToDateEpf: 14520,
    yearToDatePcb: 0,
  }, profile, { maritalStatus: "Single", taxResident: true });
  assert.ok(december > january, "an unpaid year collected in one month exceeds an even spread");
});

test("PCB already remitted is credited rather than charged twice", () => {
  const context = { maritalStatus: "Single", taxResident: true };
  const gross = { grossPay: 12000, epfEmployee: 1320, monthOfYear: 6, yearToDateGross: 60000, yearToDateEpf: 6600 };
  const withoutCredit = monthlyTaxDeduction({ ...gross, yearToDatePcb: 0 }, profile, context);
  const withCredit = monthlyTaxDeduction({ ...gross, yearToDatePcb: 5000 }, profile, context);
  assert.ok(withCredit < withoutCredit);
});

test("reliefs reduce PCB, and a supported spouse and children reduce it further", () => {
  const base = { grossPay: 9000, epfEmployee: 990, monthOfYear: 1 };
  const single = monthlyTaxDeduction(base, profile, { maritalStatus: "Single", taxResident: true });
  const married = monthlyTaxDeduction(base, profile, { maritalStatus: "Married", spouseWorking: false, taxResident: true });
  const family = monthlyTaxDeduction(base, profile, { maritalStatus: "Married", spouseWorking: false, childRelief: 3, taxResident: true });

  assert.ok(married < single, "spouse relief is claimable when the spouse has no income");
  assert.ok(family < married, "each child reduces chargeable income further");
});

test("a working spouse earns no spouse relief", () => {
  const base = { grossPay: 9000, epfEmployee: 990, monthOfYear: 1 };
  const working = monthlyTaxDeduction(base, profile, { maritalStatus: "Married", spouseWorking: true, taxResident: true });
  const single = monthlyTaxDeduction(base, profile, { maritalStatus: "Single", taxResident: true });
  assert.equal(working, single);
});

test("zakat comes off the tax due", () => {
  const base = { grossPay: 12000, epfEmployee: 1320, monthOfYear: 1 };
  const withZakat = monthlyTaxDeduction({ ...base, zakat: 2000 }, profile, { maritalStatus: "Single", taxResident: true });
  const without = monthlyTaxDeduction(base, profile, { maritalStatus: "Single", taxResident: true });
  assert.ok(withZakat < without);
});

test("a non-resident is taxed flat, with no projection or relief", () => {
  const pcb = monthlyTaxDeduction({ grossPay: 3000, epfEmployee: 330, monthOfYear: 1 }, profile, { taxResident: false });
  assert.equal(pcb, 900, "30% of the payment, where a resident on the same wage would owe nothing");
});

test("a payroll line adds up: gross less deductions is net", () => {
  const result = computePayroll(
    { basicSalary: 5000, allowances: 500, period: "2026-03" },
    profile,
    { age: 35, citizen: true, taxResident: true, maritalStatus: "Single" },
  );

  assert.equal(result.grossPay, 5500);
  assert.equal(
    result.totalDeductions,
    Number((result.epfEmployee + result.socsoEmployee + result.eisEmployee + result.pcb + result.otherDeductions).toFixed(2)),
  );
  assert.equal(result.netPay, Number((result.grossPay - result.totalDeductions).toFixed(2)));
  assert.ok(result.epfEmployer > result.epfEmployee, "the employer's 12% exceeds the employee's 11% at this wage");
});

test("overtime and bonus are part of the gross the contributions are taken on", () => {
  const withoutBonus = computePayroll({ basicSalary: 4000, period: "2026-03" }, profile, { age: 30 });
  const withBonus = computePayroll({ basicSalary: 4000, bonus: 2000, period: "2026-03" }, profile, { age: 30 });
  assert.equal(withBonus.grossPay, 6000);
  assert.ok(withBonus.epfEmployee > withoutBonus.epfEmployee);
});

test("missing facts are warned about rather than silently assumed", () => {
  const unknownAge = computePayroll({ basicSalary: 4000, period: "2026-03" }, profile, {});
  assert.ok(unknownAge.warnings.some((item) => item.includes("Date of birth")));

  const foreign = computePayroll({ basicSalary: 4000, period: "2026-03" }, profile, { age: 30, citizen: false });
  assert.ok(foreign.warnings.some((item) => item.includes("Non-citizen")));

  const bonus = computePayroll({ basicSalary: 4000, bonus: 5000, period: "2026-03" }, profile, { age: 30 });
  assert.ok(bonus.warnings.some((item) => item.includes("Bonus")));
});

test("age is taken at the end of the payroll month", () => {
  assert.equal(ageAtPeriod("1966-03-15", "2026-03"), 60, "a birthday within the month counts");
  assert.equal(ageAtPeriod("1966-04-01", "2026-03"), 59);
  assert.equal(ageAtPeriod("1990-01-01", "2026-01"), 36);
  assert.equal(ageAtPeriod("", "2026-01"), null);
  assert.equal(ageAtPeriod("1990-01-01", ""), null);
});

test("a profile saved in the old flat shape still works", () => {
  // What the settings screen used to store: four loose percentages that
  // nothing calculated with.
  const upgraded = toStatutoryProfile({
    id: "my-default",
    name: "Malaysia",
    effectiveFrom: "2025-01-01",
    epfEmployeeRate: 11,
    epfEmployerRate: 12,
    eisEmployeeRate: 0.2,
    eisEmployerRate: 0.2,
  });

  assert.equal(upgraded.epf.employeeRate, 11);
  assert.equal(upgraded.epf.employerRateAbove, 12, "the old single employer rate becomes the above-threshold one");
  assert.equal(upgraded.epf.employerRateBelow, SEEDED_PROFILE.epf.employerRateBelow, "the step it never knew about comes from the seed");
  assert.equal(upgraded.eis.employeeRate, 0.2);
  assert.deepEqual(upgraded.pcb.bands, SEEDED_PROFILE.pcb.bands);
  // And it computes, which the flat shape never could.
  assert.deepEqual(epfContribution(3000, upgraded), { employee: 330, employer: 390 });
});

test("a partial or damaged profile cannot put a NaN into a contribution", () => {
  const broken = toStatutoryProfile({ name: "Broken", epf: { employeeRate: "abc", wageBandStep: 0 }, socso: { wageCeiling: null } });
  const result = epfContribution(3000, broken);
  assert.ok(Number.isFinite(result.employee) && Number.isFinite(result.employer));
  assert.equal(broken.epf.employeeRate, SEEDED_PROFILE.epf.employeeRate);
  assert.equal(broken.epf.wageBandStep, SEEDED_PROFILE.epf.wageBandStep, "a zero step would divide by nothing");
  assert.ok(Number.isFinite(socsoContribution(3000, broken).employer));
});

test("an empty profile falls back to the seed rather than to zero", () => {
  const empty = toStatutoryProfile(null);
  assert.deepEqual(epfContribution(3000, empty), epfContribution(3000, SEEDED_PROFILE));
});

test("a pasted table survives the round trip and sorts itself", () => {
  const withTable = toStatutoryProfile({
    ...SEEDED_PROFILE,
    socso: { ...SEEDED_PROFILE.socso, table: [{ upTo: 2000, employee: 9.75, employer: 34.15 }, { upTo: 1000, employee: 4.5, employer: 15.75 }] },
  });
  assert.equal(withTable.socso.table?.[0].upTo, 1000, "rows are ordered so the first covering band wins");
  assert.deepEqual(socsoContribution(900, withTable), { employee: 4.5, employer: 15.75 });
});

test("a period uses the rates that applied to it, not today's", () => {
  const profiles = [
    { id: "old", effectiveFrom: "2024-01-01" },
    { id: "current", effectiveFrom: "2026-01-01" },
    { id: "future", effectiveFrom: "2027-01-01" },
  ];
  assert.equal(profileForPeriod(profiles, "2025-06")?.id, "old");
  assert.equal(profileForPeriod(profiles, "2026-06")?.id, "current");
  assert.equal(profileForPeriod(profiles, "2027-06")?.id, "future");
  // Re-opening a closed period must not silently re-rate it at today's numbers.
  assert.equal(profileForPeriod(profiles, "2024-12")?.id, "old");
});

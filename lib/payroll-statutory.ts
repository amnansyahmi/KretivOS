/**
 * Malaysian statutory payroll deductions: EPF, SOCSO, EIS and PCB.
 *
 * Until now every one of these four numbers was typed in by hand, once per
 * person per month, and the only thing standing between a slip of the finger
 * and an underpayment to KWSP or LHDN was somebody noticing. For a company
 * without a payroll clerk that is the single largest source of quiet error in
 * the whole system.
 *
 * The engine is code; the rates are not. Every threshold, band and relief comes
 * in on a `StatutoryProfile`, which HR versions by effective date in Settings.
 * That split is deliberate and load-bearing:
 *
 *   - Statutory rates in Malaysia move. EPF's employee share has been changed by
 *     ministerial order more than once in recent memory, the SOCSO and EIS wage
 *     ceiling has been raised twice, and tax bands shift with the Budget. Rates
 *     compiled into a release would be wrong the month they changed and could
 *     only be fixed by a deploy.
 *   - A profile carries `effectiveFrom`, so re-opening an old period recomputes
 *     against the rates that actually applied to it rather than today's.
 *   - Most importantly, nothing here should be mistaken for authority. This
 *     module reproduces the published *mechanics* faithfully; whether the
 *     numbers fed into it match the current official schedules is a question
 *     only the person who read those schedules can answer. `SEEDED_PROFILE`
 *     below is a starting point to be checked, not a source of truth, and the
 *     payroll screen keeps asking for a verification note before a period can
 *     be closed.
 *
 * Pure, and free of database and framework imports, so every rule below can be
 * asserted directly in `payroll-statutory.test.ts`.
 */

/** One row of an official contribution table: wages up to `upTo` pay these amounts. */
export type ContributionBand = {
  /** Inclusive upper limit of the wage band. */
  upTo: number;
  employee: number;
  employer: number;
};

export type EPFRules = {
  employeeRate: number;
  /** Employers pay a higher share on lower wages; the split happens at `employerRateThreshold`. */
  employerRateBelow: number;
  employerRateAbove: number;
  employerRateThreshold: number;
  /**
   * The Third Schedule works in wage bands rather than on the exact wage, so a
   * contribution is computed on the top of the band the wage falls in.
   */
  wageBandStep: number;
  /** Above this wage the schedule stops banding and the rate is applied exactly. */
  exactAbove: number;
  /** Contributions are rounded up to the next whole ringgit, never down. */
  seniorAge: number;
  seniorEmployeeRate: number;
  seniorEmployerRate: number;
};

export type ContributionRules = {
  employeeRate: number;
  employerRate: number;
  /** Wages above the ceiling contribute as though they were at the ceiling. */
  wageCeiling: number;
  bandStep: number;
  /** From this age the employee stops contributing and only the employer pays. */
  seniorAge: number;
  seniorEmployeeRate: number;
  seniorEmployerRate: number;
  /** Nobody contributes from this age. Null means no upper limit. */
  maximumAge: number | null;
  /**
   * The official published table. When present it is authoritative and the
   * rates above are ignored — a pasted-in schedule always beats an
   * approximation of one.
   */
  table?: ContributionBand[];
};

export type PCBBand = {
  /** Inclusive upper limit of the chargeable income band; null means unbounded. */
  upTo: number | null;
  /** Marginal rate applied to income within this band, as a percentage. */
  rate: number;
};

export type PCBRules = {
  bands: PCBBand[];
  individualRelief: number;
  /** Claimable only when the spouse has no income of their own. */
  spouseRelief: number;
  childRelief: number;
  /** EPF is deductible against tax, but only up to this much a year. */
  epfReliefCap: number;
  /** SOCSO and EIS share one annual cap. */
  socsoReliefCap: number;
  /** Chargeable income at or below this gets `rebateAmount` off the tax due. */
  rebateThreshold: number;
  rebateAmount: number;
  /** Non-residents are taxed at a flat rate with no bands, reliefs or rebate. */
  nonResidentRate: number;
};

export type StatutoryProfile = {
  id: string;
  name: string;
  /** ISO date. The applicable profile for a period is the latest one not after it. */
  effectiveFrom: string;
  notes?: string;
  epf: EPFRules;
  socso: ContributionRules;
  eis: ContributionRules;
  pcb: PCBRules;
};

export type EmployeeStatutoryContext = {
  /** Age in completed years at the end of the payroll period. */
  age?: number | null;
  /** Non-citizens have their own EPF arrangements; flagged so callers can require a manual figure. */
  citizen?: boolean;
  taxResident?: boolean;
  maritalStatus?: "Single" | "Married" | string;
  /** Spouse relief is only claimable when the spouse has no income. */
  spouseWorking?: boolean;
  childRelief?: number;
  epfApplicable?: boolean;
  socsoApplicable?: boolean;
  eisApplicable?: boolean;
};

export type Contribution = { employee: number; employer: number };

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Two decimal places, and never a negative contribution. */
const money = (value: number) => Math.max(0, Math.round(value * 100) / 100);

/** The published tables settle at five sen, so computed values follow them there. */
const toFiveSen = (value: number) => Math.max(0, Math.round(value * 20) / 20);

/** Contributions are rounded up to the next whole ringgit, never down. */
const upToRinggit = (value: number) => Math.max(0, Math.ceil(Math.round(value * 100) / 100));

/**
 * The top of the wage band a wage falls in.
 *
 * A band is "exceeding X but not exceeding Y", so a wage sitting exactly on a
 * boundary belongs to the band ending there rather than opening the next one.
 */
export function bandUpperLimit(wage: number, step: number) {
  if (step <= 0) return Math.max(0, wage);
  return Math.max(0, Math.ceil(Math.round((wage / step) * 1e6) / 1e6) * step);
}

/** The first band whose limit covers the wage, or the last one for anything above the table. */
function findBand(table: ContributionBand[], wage: number) {
  return table.find((band) => wage <= band.upTo) ?? table[table.length - 1];
}

/**
 * EPF, following the Third Schedule's shape.
 *
 * Two things make this more than `wage × rate`. Contributions are computed on
 * the top of a wage band rather than the wage itself, and they round *up* to a
 * whole ringgit — so RM3,010 and RM3,020 contribute the same, and a rate that
 * lands on 331.10 is paid as 332. Above `exactAbove` the schedule gives up on
 * banding and the percentage applies directly.
 *
 * The employer's share steps down once wages pass `employerRateThreshold`,
 * which is why the two employer rates are separate fields rather than one.
 */
export function epfContribution(wage: number, profile: StatutoryProfile, context: EmployeeStatutoryContext = {}): Contribution {
  const rules = profile.epf;
  const wages = Math.max(0, num(wage));
  if (context.epfApplicable === false || wages <= 0) return { employee: 0, employer: 0 };

  const senior = typeof context.age === "number" && context.age >= rules.seniorAge;
  const employeeRate = senior ? rules.seniorEmployeeRate : rules.employeeRate;
  const employerRate = senior
    ? rules.seniorEmployerRate
    : wages <= rules.employerRateThreshold ? rules.employerRateBelow : rules.employerRateAbove;

  // Above the banded range the schedule is a plain percentage, still rounded up.
  const base = wages > rules.exactAbove ? wages : bandUpperLimit(wages, rules.wageBandStep);

  return {
    employee: upToRinggit(base * employeeRate / 100),
    employer: upToRinggit(base * employerRate / 100),
  };
}

/**
 * SOCSO and EIS share one shape, so they share one function.
 *
 * Both are banded, both stop counting wages above a ceiling, and both change
 * character with age — SOCSO drops to an employer-only category, EIS stops
 * entirely. A pasted-in official table wins over the rates; the rate path
 * exists so a fresh install computes *something* defensible rather than zero.
 */
export function bandedContribution(wage: number, rules: ContributionRules, context: EmployeeStatutoryContext = {}, applicable = true): Contribution {
  const wages = Math.max(0, num(wage));
  if (!applicable || wages <= 0) return { employee: 0, employer: 0 };

  const age = typeof context.age === "number" ? context.age : null;
  if (age !== null && rules.maximumAge !== null && age >= rules.maximumAge) return { employee: 0, employer: 0 };

  // Wages over the ceiling contribute as though they stopped at it.
  const capped = Math.min(wages, rules.wageCeiling);

  if (rules.table?.length) {
    const band = findBand(rules.table, capped);
    if (!band) return { employee: 0, employer: 0 };
    const senior = age !== null && age >= rules.seniorAge;
    // A senior pays nothing; the employer's own share is unchanged by the
    // table, which lists the ordinary category.
    return { employee: senior ? 0 : money(band.employee), employer: money(band.employer) };
  }

  const senior = age !== null && age >= rules.seniorAge;
  const employeeRate = senior ? rules.seniorEmployeeRate : rules.employeeRate;
  const employerRate = senior ? rules.seniorEmployerRate : rules.employerRate;
  const base = bandUpperLimit(capped, rules.bandStep);

  return {
    employee: toFiveSen(base * employeeRate / 100),
    employer: toFiveSen(base * employerRate / 100),
  };
}

export function socsoContribution(wage: number, profile: StatutoryProfile, context: EmployeeStatutoryContext = {}) {
  return bandedContribution(wage, profile.socso, context, context.socsoApplicable !== false);
}

export function eisContribution(wage: number, profile: StatutoryProfile, context: EmployeeStatutoryContext = {}) {
  return bandedContribution(wage, profile.eis, context, context.eisApplicable !== false);
}

/**
 * Annual tax on a chargeable income, from the progressive bands.
 *
 * Written as an explicit walk up the bands rather than the "M, R, B" shorthand
 * the MTD tables use. The shorthand is a lookup that hides where the number
 * came from; this way a wrong answer can be traced to the band that produced
 * it, and the band list stays plain enough for HR to check against a published
 * table line by line.
 */
export function annualTax(chargeableIncome: number, bands: PCBBand[]) {
  let remaining = Math.max(0, num(chargeableIncome));
  let previousLimit = 0;
  let tax = 0;

  for (const band of bands) {
    if (remaining <= 0) break;
    const limit = band.upTo === null ? Infinity : band.upTo;
    const slice = Math.min(remaining, limit - previousLimit);
    if (slice > 0) {
      tax += slice * band.rate / 100;
      remaining -= slice;
    }
    previousLimit = limit;
  }

  return Math.round(tax * 100) / 100;
}

export type PCBInput = {
  /** This month's gross remuneration. */
  grossPay: number;
  /** This month's employee EPF, which is deductible. */
  epfEmployee?: number;
  /** This month's employee SOCSO and EIS, which share their own smaller cap. */
  socsoEmployee?: number;
  eisEmployee?: number;
  /** Gross already paid earlier in the same calendar year, before deductions. */
  yearToDateGross?: number;
  /** Employee EPF already deducted earlier in the year. */
  yearToDateEpf?: number;
  yearToDateSocso?: number;
  /** PCB already remitted earlier in the year. */
  yearToDatePcb?: number;
  /** Zakat paid through payroll, which reduces tax ringgit for ringgit. */
  zakat?: number;
  /** 1–12. Decides how many more months the year's income is spread over. */
  monthOfYear: number;
};

/**
 * PCB (MTD) for a month of normal remuneration.
 *
 * The published formula projects the year: it takes what has been paid so far,
 * assumes the remaining months look like this one, works out the tax on that
 * whole year, subtracts what has already been remitted, and spreads the rest
 * over the months left. That projection is why a mid-year raise moves PCB by
 * more than the raise itself — the months already paid are being re-based.
 *
 * Bonuses and other one-off "additional remuneration" have their own treatment
 * in the official method, which this does not attempt: they arrive here inside
 * `grossPay` and are therefore projected as if they recurred monthly, which
 * over-deducts in the month a bonus is paid. That is the safe direction to be
 * wrong in — it is refunded on assessment rather than owed — but it is a real
 * difference from a payroll bureau's figure, and the reason this number stays
 * an estimate that HR overrides when it matters.
 */
export function monthlyTaxDeduction(input: PCBInput, profile: StatutoryProfile, context: EmployeeStatutoryContext = {}) {
  const rules = profile.pcb;
  const gross = Math.max(0, num(input.grossPay));
  const month = Math.min(12, Math.max(1, Math.round(num(input.monthOfYear) || 1)));
  const remainingMonths = 12 - month;

  // A non-resident is taxed flat on each payment, with no projection, no
  // relief and no rebate — none of the machinery below applies.
  if (context.taxResident === false) return money(gross * rules.nonResidentRate / 100);

  const epfThisMonth = Math.max(0, num(input.epfEmployee));
  const socsoThisMonth = Math.max(0, num(input.socsoEmployee)) + Math.max(0, num(input.eisEmployee));

  // The year as projected: what has been paid, this month, and this month
  // repeated for whatever is left of the year.
  const projectedGross = Math.max(0, num(input.yearToDateGross)) + gross + gross * remainingMonths;
  const projectedEpf = Math.max(0, num(input.yearToDateEpf)) + epfThisMonth + epfThisMonth * remainingMonths;
  const projectedSocso = Math.max(0, num(input.yearToDateSocso)) + socsoThisMonth + socsoThisMonth * remainingMonths;

  const married = String(context.maritalStatus || "") === "Married";
  const claimsSpouseRelief = married && context.spouseWorking === false;
  const children = Math.max(0, Math.floor(num(context.childRelief)));

  const reliefs = rules.individualRelief
    + (claimsSpouseRelief ? rules.spouseRelief : 0)
    + children * rules.childRelief
    + Math.min(projectedEpf, rules.epfReliefCap)
    + Math.min(projectedSocso, rules.socsoReliefCap);

  const chargeable = Math.max(0, projectedGross - reliefs);

  let tax = annualTax(chargeable, rules.bands);
  // The rebate is per taxpayer, so a couple assessed together earns it twice.
  if (chargeable > 0 && chargeable <= rules.rebateThreshold) {
    tax -= rules.rebateAmount * (claimsSpouseRelief ? 2 : 1);
  }
  tax -= Math.max(0, num(input.zakat));

  const outstanding = Math.max(0, tax) - Math.max(0, num(input.yearToDatePcb));
  if (outstanding <= 0) return 0;

  // Spread over this month and the ones still to come.
  return money(outstanding / (remainingMonths + 1));
}

export type PayrollComputationInput = {
  basicSalary?: number;
  allowances?: number;
  overtime?: number;
  bonus?: number;
  otherDeductions?: number;
  /** "YYYY-MM". Decides how much of the year PCB projects over. */
  period?: string;
  yearToDateGross?: number;
  yearToDateEpf?: number;
  yearToDateSocso?: number;
  yearToDatePcb?: number;
  zakat?: number;
};

export type ComputedPayroll = {
  grossPay: number;
  epfEmployee: number;
  epfEmployer: number;
  socsoEmployee: number;
  socsoEmployer: number;
  eisEmployee: number;
  eisEmployer: number;
  pcb: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  /** Anything the caller should look at before trusting the figures. */
  warnings: string[];
};

/**
 * One payroll line, computed end to end.
 *
 * Everything is taken on gross — basic, allowances, overtime and bonus
 * together. The official definitions of "wages" for EPF and for SOCSO are not
 * identical and both carve out particular payments, so a company paying
 * anything unusual should expect to override rather than assume this covers it.
 * The warnings are how that expectation is raised rather than left implied.
 */
export function computePayroll(
  input: PayrollComputationInput,
  profile: StatutoryProfile,
  context: EmployeeStatutoryContext = {},
): ComputedPayroll {
  const basicSalary = Math.max(0, num(input.basicSalary));
  const allowances = Math.max(0, num(input.allowances));
  const overtime = Math.max(0, num(input.overtime));
  const bonus = Math.max(0, num(input.bonus));
  const otherDeductions = Math.max(0, num(input.otherDeductions));
  const grossPay = money(basicSalary + allowances + overtime + bonus);

  const epf = epfContribution(grossPay, profile, context);
  const socso = socsoContribution(grossPay, profile, context);
  const eis = eisContribution(grossPay, profile, context);

  const monthOfYear = Number(String(input.period || "").slice(5, 7)) || new Date().getMonth() + 1;
  const pcb = monthlyTaxDeduction({
    grossPay,
    epfEmployee: epf.employee,
    socsoEmployee: socso.employee,
    eisEmployee: eis.employee,
    yearToDateGross: input.yearToDateGross,
    yearToDateEpf: input.yearToDateEpf,
    yearToDateSocso: input.yearToDateSocso,
    yearToDatePcb: input.yearToDatePcb,
    zakat: input.zakat,
    monthOfYear,
  }, profile, context);

  const warnings: string[] = [];
  if (context.citizen === false) warnings.push("Non-citizen: EPF and SOCSO arrangements differ for foreign employees. Confirm the contributions before closing.");
  if (typeof context.age !== "number") warnings.push("Date of birth is not recorded, so age-based EPF, SOCSO and EIS rules could not be applied.");
  if (bonus > 0) warnings.push("Bonus is included in gross, so PCB is projected as though it recurred monthly. Verify the month a bonus is paid.");
  if (context.taxResident === false) warnings.push("Non-resident: PCB is a flat rate on each payment with no relief.");

  const totalDeductions = money(epf.employee + socso.employee + eis.employee + pcb + otherDeductions);

  return {
    grossPay,
    epfEmployee: epf.employee,
    epfEmployer: epf.employer,
    socsoEmployee: socso.employee,
    socsoEmployer: socso.employer,
    eisEmployee: eis.employee,
    eisEmployer: eis.employer,
    pcb,
    otherDeductions,
    totalDeductions,
    netPay: money(grossPay - totalDeductions),
    warnings,
  };
}

/** Completed years between a date of birth and the end of a "YYYY-MM" period. */
export function ageAtPeriod(dateOfBirth: string, period: string): number | null {
  const birth = String(dateOfBirth || "").slice(0, 10);
  const month = String(period || "").slice(0, 7);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !/^\d{4}-\d{2}$/.test(month)) return null;

  const [birthYear, birthMonth, birthDay] = birth.split("-").map(Number);
  const [year, monthNumber] = month.split("-").map(Number);
  // Last day of the payroll month, so somebody turning 60 mid-month is 60 for it.
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  let age = year - birthYear;
  if (monthNumber < birthMonth || (monthNumber === birthMonth && lastDay < birthDay)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** The profile in force for a "YYYY-MM" period: the latest one starting on or before it. */
export function profileForPeriod<T extends { effectiveFrom: string }>(profiles: T[], period: string): T | null {
  const end = `${String(period || "").slice(0, 7)}-31`;
  const applicable = profiles
    .filter((profile) => String(profile.effectiveFrom || "").slice(0, 10) <= end)
    .sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));
  return applicable[0] ?? profiles[0] ?? null;
}

/**
 * A starting point, not an authority.
 *
 * These are the figures a Malaysian SME would most likely have been using at
 * the time this was written, and they are seeded so a fresh install computes
 * something recognisable instead of zeros. Every one of them is editable in
 * Settings, and the payroll screen will not let a period close without somebody
 * recording that they checked. Treat a mismatch with the official schedules as
 * this constant being stale, which it eventually will be.
 *
 * The SOCSO and EIS `table` fields are deliberately left empty: the published
 * schedules are banded in a way the percentages below only approximate, and an
 * approximation that looks like a table would be trusted more than it deserves.
 * Paste the official rows in and they take over.
 */
export const SEEDED_PROFILE: StatutoryProfile = {
  id: "my-default",
  name: "Malaysia · verify against official schedules",
  effectiveFrom: "2026-01-01",
  notes: "Seeded defaults. Check EPF's Third Schedule, the PERKESO contribution tables and LHDN's current tax bands before closing a period.",
  epf: {
    employeeRate: 11,
    employerRateBelow: 13,
    employerRateAbove: 12,
    employerRateThreshold: 5000,
    wageBandStep: 20,
    exactAbove: 20000,
    seniorAge: 60,
    seniorEmployeeRate: 0,
    seniorEmployerRate: 4,
  },
  socso: {
    employeeRate: 0.5,
    employerRate: 1.75,
    wageCeiling: 6000,
    bandStep: 100,
    seniorAge: 60,
    seniorEmployeeRate: 0,
    seniorEmployerRate: 1.25,
    maximumAge: null,
  },
  eis: {
    employeeRate: 0.2,
    employerRate: 0.2,
    wageCeiling: 6000,
    bandStep: 100,
    seniorAge: 60,
    seniorEmployeeRate: 0,
    seniorEmployerRate: 0,
    maximumAge: 60,
  },
  pcb: {
    bands: [
      { upTo: 5000, rate: 0 },
      { upTo: 20000, rate: 1 },
      { upTo: 35000, rate: 3 },
      { upTo: 50000, rate: 6 },
      { upTo: 70000, rate: 11 },
      { upTo: 100000, rate: 19 },
      { upTo: 400000, rate: 25 },
      { upTo: 600000, rate: 26 },
      { upTo: 2000000, rate: 28 },
      { upTo: null, rate: 30 },
    ],
    individualRelief: 9000,
    spouseRelief: 4000,
    childRelief: 2000,
    epfReliefCap: 4000,
    socsoReliefCap: 350,
    rebateThreshold: 35000,
    rebateAmount: 400,
    nonResidentRate: 30,
  },
};

/**
 * Leave entitlement under the Employment Act 1955.
 *
 * Everyone had a flat 14 days of annual and 14 of sick leave, typed onto their
 * record when they were created and never revisited. Two things are wrong with
 * that. The Act sets minimums that *rise with length of service* — so somebody
 * past their second year was silently short, and nothing recalculated on the
 * anniversary that changed it. And maternity and paternity leave did not exist
 * as concepts at all: they were taken as annual leave, or as unpaid leave, or
 * not recorded.
 *
 * The tiers are configuration rather than constants. They are statutory
 * minimums, they have been amended before, and a company may contract above
 * them — which most do. What the code owns is the *rule*: entitlement is a
 * function of service, and it changes on the day service crosses a threshold.
 *
 * The Act is the floor, not the ceiling. Where an employee's own recorded
 * entitlement is more generous than the tier, theirs is used — a contract
 * promising 20 days is not overridden by a schedule that says 16.
 *
 * Pure, and asserted directly in `leave-entitlement.test.ts`.
 */

export type LeaveTier = {
  /** Applies once completed years of service reach this. */
  fromYears: number;
  days: number;
};

export type LeaveKind = "annual" | "sick" | "maternity" | "paternity" | "unpaid" | "other";

export type LeaveTypeRule = {
  name: string;
  kind: LeaveKind;
  /** Service-banded entitlement. Ignored when `fixedDays` is set. */
  tiers?: LeaveTier[];
  /** A single figure that does not vary with service. */
  fixedDays?: number;
  /** Taken as one unbroken block, so weekends and holidays count inside it. */
  consecutiveDays?: boolean;
  /** Deducted from a balance, or simply recorded. */
  deductsBalance: boolean;
  paid: boolean;
  note?: string;
};

/**
 * The statutory minimums, as a starting point to be checked and raised.
 *
 * Annual and sick leave both step with service. Sick leave here is the
 * non-hospitalised entitlement; the Act provides a longer aggregate where
 * hospitalisation is involved, which is recorded against the same type rather
 * than modelled as a separate one.
 */
export const DEFAULT_LEAVE_RULES: LeaveTypeRule[] = [
  {
    name: "Annual Leave",
    kind: "annual",
    tiers: [{ fromYears: 0, days: 8 }, { fromYears: 2, days: 12 }, { fromYears: 5, days: 16 }],
    deductsBalance: true,
    paid: true,
    note: "Employment Act minimum. Raise the tiers if your contracts are more generous.",
  },
  {
    name: "Medical Leave",
    kind: "sick",
    tiers: [{ fromYears: 0, days: 14 }, { fromYears: 2, days: 18 }, { fromYears: 5, days: 22 }],
    deductsBalance: true,
    paid: true,
    note: "Non-hospitalised entitlement. A longer aggregate applies where hospitalisation is involved.",
  },
  {
    name: "Maternity Leave",
    kind: "maternity",
    fixedDays: 98,
    consecutiveDays: true,
    deductsBalance: false,
    paid: true,
    note: "Taken as consecutive days, so rest days and public holidays fall inside the period.",
  },
  {
    name: "Paternity Leave",
    kind: "paternity",
    fixedDays: 7,
    consecutiveDays: true,
    deductsBalance: false,
    paid: true,
    note: "Taken as consecutive days.",
  },
  { name: "Emergency Leave", kind: "other", deductsBalance: true, paid: true },
  { name: "Replacement Leave", kind: "other", deductsBalance: true, paid: true },
  { name: "Unpaid Leave", kind: "unpaid", deductsBalance: false, paid: false, note: "Deducted from salary rather than from a balance." },
];

const clean = (value: unknown) => String(value ?? "").trim();

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Completed years of service at a date.
 *
 * Counted to the *start* of the leave rather than to today, so a request made
 * in advance is judged on the entitlement that will apply when it is taken —
 * and a request made just before an anniversary does not borrow against the
 * higher tier.
 */
export function yearsOfService(startDate: string, asOf: string): number {
  const start = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(startDate));
  const at = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(asOf));
  if (!start || !at) return 0;

  const [, startYear, startMonth, startDay] = start.map(Number);
  const [, year, month, day] = at.map(Number);

  let years = year - startYear;
  if (month < startMonth || (month === startMonth && day < startDay)) years -= 1;
  return Math.max(0, years);
}

/** The tier in force at a given length of service: the highest one reached. */
export function tierFor(tiers: LeaveTier[], years: number): number {
  return [...tiers]
    .filter((tier) => years >= num(tier.fromYears))
    .sort((a, b) => num(b.fromYears) - num(a.fromYears))[0]?.days ?? 0;
}

export function findLeaveRule(rules: LeaveTypeRule[], typeName: string): LeaveTypeRule | null {
  const wanted = clean(typeName).toLowerCase();
  return rules.find((rule) => clean(rule.name).toLowerCase() === wanted) ?? null;
}

export type EntitlementResult = {
  /** Days for the year, before proration and carry-forward. */
  days: number;
  /** Where the figure came from, so a disputed balance can be explained. */
  source: "statutory" | "contract" | "fixed" | "none";
  rule: LeaveTypeRule | null;
  years: number;
};

/**
 * How many days of a leave type somebody is entitled to.
 *
 * `recordedDays` is whatever is on the employee record. It wins when it is more
 * generous, because that is a contractual promise; it never reduces the
 * statutory floor, because a record set to 8 cannot take away the 16 the Act
 * gives somebody in their sixth year.
 */
export function entitlementFor({
  rules,
  typeName,
  startDate,
  asOf,
  recordedDays,
}: {
  rules: LeaveTypeRule[];
  typeName: string;
  startDate: string;
  asOf: string;
  recordedDays?: number;
}): EntitlementResult {
  const rule = findLeaveRule(rules, typeName);
  const years = yearsOfService(startDate, asOf);

  if (!rule) return { days: Math.max(0, num(recordedDays)), source: recordedDays ? "contract" : "none", rule: null, years };
  if (typeof rule.fixedDays === "number") return { days: rule.fixedDays, source: "fixed", rule, years };
  if (!rule.deductsBalance) return { days: 0, source: "none", rule, years };

  const statutory = rule.tiers?.length ? tierFor(rule.tiers, years) : 0;
  const recorded = Math.max(0, num(recordedDays));

  return recorded > statutory
    ? { days: recorded, source: "contract", rule, years }
    : { days: statutory, source: "statutory", rule, years };
}

/**
 * Reads stored rules, filling anything absent from the statutory defaults.
 *
 * A leave type the company invented and the defaults know nothing about is kept
 * as an ordinary balance-deducting type rather than dropped — losing a
 * configured type on load would delete leave people had already booked against.
 */
export function toLeaveRules(stored: unknown): LeaveTypeRule[] {
  if (!Array.isArray(stored) || !stored.length) return DEFAULT_LEAVE_RULES;

  const byName = new Map(DEFAULT_LEAVE_RULES.map((rule) => [rule.name.toLowerCase(), rule]));
  return stored.map((item: any) => {
    const name = clean(item?.name) || clean(item);
    const fallback = byName.get(name.toLowerCase());
    const tiers = Array.isArray(item?.tiers) && item.tiers.length
      ? item.tiers.map((tier: any) => ({ fromYears: Math.max(0, num(tier?.fromYears)), days: Math.max(0, num(tier?.days)) }))
        .sort((a: LeaveTier, b: LeaveTier) => a.fromYears - b.fromYears)
      : fallback?.tiers;

    return {
      name,
      kind: (clean(item?.kind) || fallback?.kind || "other") as LeaveKind,
      tiers,
      fixedDays: typeof item?.fixedDays === "number" ? Math.max(0, item.fixedDays) : fallback?.fixedDays,
      consecutiveDays: typeof item?.consecutiveDays === "boolean" ? item.consecutiveDays : fallback?.consecutiveDays,
      deductsBalance: typeof item?.deductsBalance === "boolean" ? item.deductsBalance : fallback?.deductsBalance ?? true,
      paid: typeof item?.paid === "boolean" ? item.paid : fallback?.paid ?? true,
      note: clean(item?.note) || fallback?.note,
    };
  }).filter((rule) => rule.name);
}

/** The names, for the pickers that only need a list. */
export function leaveTypeNames(rules: LeaveTypeRule[]) {
  return rules.map((rule) => rule.name);
}

/**
 * Whether a leave type is counted in working days or in calendar days.
 *
 * Maternity and paternity leave are granted as consecutive days, so a weekend
 * inside the period is part of it. Counting those in working days would hand
 * out several extra weeks.
 */
export function countsCalendarDays(rules: LeaveTypeRule[], typeName: string) {
  return Boolean(findLeaveRule(rules, typeName)?.consecutiveDays);
}

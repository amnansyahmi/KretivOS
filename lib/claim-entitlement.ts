/**
 * What a claim is allowed to be, and how much of it is left.
 *
 * A claim used to be a category, an amount, a date and a sentence. That is
 * enough to reimburse a taxi fare and not enough for a benefit: nothing knew
 * that outpatient medical is capped at a figure a year, nothing tracked how
 * much of that figure was gone, nothing recorded who the treatment was for, and
 * the clinic, the bill number and the date on the bill all went into the same
 * free-text box as "what was it for".
 *
 * Two kinds of claim, and the difference is the whole reason this exists:
 *
 *   A **benefit** is an allowance the company grants — outpatient medical,
 *   dental, optical, a family insurance subsidy. It is capped per year, the
 *   balance matters, and it can often be claimed for a spouse or a child.
 *
 *   An **expense** is money spent doing the job — a client lunch, a taxi, a
 *   software licence. There is no annual cap because there is no allowance;
 *   the question is whether it was legitimate, not whether it fits in a budget
 *   the employee owns.
 *
 * Capping an expense would refuse a legitimate reimbursement in a busy month.
 * Not capping a benefit lets an allowance be drawn twice over. So the two are
 * kept apart rather than given one set of rules.
 *
 * The caps are configuration, not constants. They are a company's own policy,
 * they change at renewal, and the figures below are a starting point to be
 * checked rather than a standard — unlike leave, nothing in the Employment Act
 * sets them.
 *
 * Pure, and asserted in `claim-entitlement.test.ts`.
 */

export type ClaimKind = "benefit" | "expense";

export type ClaimTypeRule = {
  name: string;
  kind: ClaimKind;
  /** Cap per employee per year. Absent or zero means uncapped. */
  annualCap?: number;
  /** Whether the claim may be for somebody other than the employee. */
  allowsDependants?: boolean;
  /** Whether the bill's own number has to be recorded. */
  requiresReceiptNumber?: boolean;
  note?: string;
};

/** Who a benefit is being claimed for. */
export const CLAIMANT_RELATIONS = ["Self", "Spouse", "Child", "Parent"] as const;
export type ClaimantRelation = typeof CLAIMANT_RELATIONS[number];

/**
 * A starting set for a Malaysian SME, to be checked against the company's own
 * policy and insurance schedule.
 */
export const DEFAULT_CLAIM_RULES: ClaimTypeRule[] = [
  {
    name: "Outpatient Medical",
    kind: "benefit",
    annualCap: 1000,
    allowsDependants: true,
    requiresReceiptNumber: true,
    note: "Clinic consultations and medication. Check the figure against your policy.",
  },
  {
    name: "Family Insurance Subsidy",
    kind: "benefit",
    annualCap: 700,
    allowsDependants: true,
    requiresReceiptNumber: true,
  },
  { name: "Dental", kind: "benefit", annualCap: 500, allowsDependants: true, requiresReceiptNumber: true },
  { name: "Optical", kind: "benefit", annualCap: 400, allowsDependants: true, requiresReceiptNumber: true },
  { name: "Travel", kind: "expense" },
  { name: "Meals", kind: "expense" },
  { name: "Software", kind: "expense" },
  { name: "Equipment", kind: "expense" },
  { name: "Client expense", kind: "expense" },
  { name: "General", kind: "expense" },
];

const clean = (value: unknown) => String(value ?? "").trim();

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Rounded to the sen, so a float artefact never shows up as a balance. */
const money = (value: number) => Number(value.toFixed(2));

export function findClaimRule(rules: ClaimTypeRule[], typeName: string): ClaimTypeRule | null {
  const wanted = clean(typeName).toLowerCase();
  return rules.find((rule) => clean(rule.name).toLowerCase() === wanted) ?? null;
}

export function claimTypeNames(rules: ClaimTypeRule[]) {
  return rules.map((rule) => rule.name);
}

/**
 * Reads stored rules, filling anything absent from the defaults.
 *
 * A type the company invented is kept as an uncapped expense rather than
 * dropped — losing one on load would orphan every claim already filed
 * against it.
 */
export function toClaimRules(stored: unknown): ClaimTypeRule[] {
  if (!Array.isArray(stored) || !stored.length) return DEFAULT_CLAIM_RULES;

  const byName = new Map(DEFAULT_CLAIM_RULES.map((rule) => [rule.name.toLowerCase(), rule]));
  return stored.map((item: any) => {
    const name = clean(item?.name) || clean(item);
    const fallback = byName.get(name.toLowerCase());
    const kind: ClaimKind = item?.kind === "benefit" || item?.kind === "expense" ? item.kind : fallback?.kind ?? "expense";

    return {
      name,
      kind,
      annualCap: typeof item?.annualCap === "number" ? Math.max(0, item.annualCap) : fallback?.annualCap,
      allowsDependants: typeof item?.allowsDependants === "boolean" ? item.allowsDependants : fallback?.allowsDependants ?? false,
      requiresReceiptNumber: typeof item?.requiresReceiptNumber === "boolean" ? item.requiresReceiptNumber : fallback?.requiresReceiptNumber ?? false,
      note: clean(item?.note) || fallback?.note,
    };
  }).filter((rule) => rule.name);
}

export type ClaimBalance = {
  name: string;
  kind: ClaimKind;
  /** The annual cap, or 0 where there is none. */
  entitlement: number;
  /** Approved and paid. */
  claimed: number;
  /** Submitted and not yet decided. */
  pending: number;
  /** What is left after both. Always 0 for an uncapped type. */
  remaining: number;
  capped: boolean;
};

/**
 * How much of an allowance is left this year.
 *
 * Pending claims count against it alongside approved ones, for the same reason
 * they do for leave: a balance that ignores what has already been asked for
 * invites asking twice for money that only exists once.
 *
 * A rejected claim releases what it held. A claim's year is the date on the
 * bill, not the date it was submitted — a December receipt filed in January
 * belongs to December's allowance, and doing it the other way lets somebody sit
 * on receipts to roll an allowance forward.
 */
export function claimBalance(
  rules: ClaimTypeRule[],
  typeName: string,
  claims: any[],
  year: number,
): ClaimBalance {
  const rule = findClaimRule(rules, typeName);
  const entitlement = Math.max(0, num(rule?.annualCap));

  const inYear = (Array.isArray(claims) ? claims : []).filter((claim) => {
    if (clean(claim?.category).toLowerCase() !== clean(typeName).toLowerCase()) return false;
    const dated = clean(claim?.receiptDate) || clean(claim?.claimDate);
    return dated.startsWith(String(year));
  });

  const sum = (statuses: string[]) => money(inYear
    .filter((claim) => statuses.includes(clean(claim?.status)))
    .reduce((total, claim) => total + Math.max(0, num(claim?.amount)), 0));

  const claimed = sum(["Approved", "Paid"]);
  const pending = sum(["Pending"]);

  return {
    name: rule?.name ?? clean(typeName),
    kind: rule?.kind ?? "expense",
    entitlement,
    claimed,
    pending,
    remaining: entitlement ? Math.max(0, money(entitlement - claimed - pending)) : 0,
    capped: entitlement > 0,
  };
}

/** Every capped type, for the balance list on the claims screen. */
export function claimBalances(rules: ClaimTypeRule[], claims: any[], year: number): ClaimBalance[] {
  return rules.filter((rule) => num(rule.annualCap) > 0).map((rule) => claimBalance(rules, rule.name, claims, year));
}

export type ClaimDraft = {
  category?: string;
  amount?: unknown;
  claimDate?: string;
  receiptDate?: string;
  receiptNumber?: string;
  incurredAt?: string;
  claimingFor?: string;
  claimingForName?: string;
  description?: string;
  receiptAssetId?: string;
};

export type ClaimProblem = { field: string; message: string };

/**
 * What is wrong with a claim, in the order somebody would fix it.
 *
 * `balance` is the remaining entitlement *excluding this claim*, so editing a
 * pending claim does not fail against its own held amount. Passing null skips
 * the entitlement check, which is what an uncapped expense wants.
 *
 * Over-claiming is a problem rather than a warning: a claim that cannot be paid
 * in full should be corrected before it is submitted, not approved and then cut
 * by finance, which is how somebody ends up chasing a difference nobody
 * explained.
 */
export function validateClaim(
  draft: ClaimDraft,
  rule: ClaimTypeRule | null,
  balance: ClaimBalance | null,
  today: string,
): ClaimProblem[] {
  const problems: ClaimProblem[] = [];
  const amount = num(draft?.amount);
  const receiptDate = clean(draft?.receiptDate);

  if (!clean(draft?.category)) problems.push({ field: "category", message: "Choose what this claim is for." });
  if (amount <= 0) problems.push({ field: "amount", message: "Enter an amount." });
  if (!receiptDate) problems.push({ field: "receiptDate", message: "Enter the date on the bill." });
  else if (receiptDate > clean(today)) problems.push({ field: "receiptDate", message: "The bill cannot be dated in the future." });

  if (!clean(draft?.incurredAt)) problems.push({ field: "incurredAt", message: "Say where it was incurred." });
  if (rule?.requiresReceiptNumber && !clean(draft?.receiptNumber)) {
    problems.push({ field: "receiptNumber", message: "Enter the bill or receipt number." });
  }

  // A dependant has to be named. "Child" on its own does not identify anybody,
  // and the approver is checking a specific person against a policy.
  const relation = clean(draft?.claimingFor);
  if (rule?.allowsDependants && !relation) problems.push({ field: "claimingFor", message: "Say who this is for." });
  if (relation && relation !== "Self" && !clean(draft?.claimingForName)) {
    problems.push({ field: "claimingForName", message: `Name the ${relation.toLowerCase()} this is for.` });
  }
  if (relation && relation !== "Self" && rule && !rule.allowsDependants) {
    problems.push({ field: "claimingFor", message: `${rule.name} can only be claimed for yourself.` });
  }

  if (!clean(draft?.receiptAssetId)) problems.push({ field: "attachment", message: "Receipt required" });

  if (balance?.capped && amount > 0 && amount > balance.remaining) {
    problems.push({
      field: "amount",
      message: `Only RM ${balance.remaining.toFixed(2)} of your RM ${balance.entitlement.toFixed(2)} ${balance.name} entitlement is left this year.`,
    });
  }

  return problems;
}

export function claimProblemFor(problems: ClaimProblem[], field: string) {
  return problems.find((problem) => problem.field === field)?.message ?? "";
}

/** How a claim's subject reads on a list: "Self", or "Spouse · Nur Anis". */
export function describeClaimant(claim: { claimingFor?: string; claimingForName?: string }) {
  const relation = clean(claim?.claimingFor) || "Self";
  const name = clean(claim?.claimingForName);
  return relation === "Self" || !name ? relation : `${relation} · ${name}`;
}

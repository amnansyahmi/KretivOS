/**
 * Staff onboarding, as work the new joiner does rather than a list HR ticks.
 *
 * The checklist was six boxes, all of them ticked by HR on somebody else's
 * behalf. "Personal and contact details" was marked done after chasing the
 * person over WhatsApp and typing their NRIC in by hand; "Company policies
 * reviewed" was marked done because it seemed likely. Neither tick was evidence
 * of anything, and the second one is the sort of thing an employer eventually
 * needs to be able to show.
 *
 * Two ideas fix that, both borrowed from the customer onboarding in
 * `onboarding-progress.ts`:
 *
 *   A step is satisfied by the thing it describes existing. A details step is
 *   complete when the details are actually on file, computed every time it is
 *   read. It cannot be ticked while a field is blank, and it cannot go stale if
 *   somebody later clears one — which a stored boolean would.
 *
 *   A step knows whose job it is. The joiner owns the ones only they can answer
 *   and HR owns the rest, so "waiting on us" and "waiting on them" stop looking
 *   identical on the same progress bar.
 *
 * A policy step is the exception that stays stored: reading something leaves no
 * trace in the data, so the acknowledgement — who, and when — is the record.
 *
 * Pure, and free of database imports, so every rule is asserted directly in
 * `staff-onboarding.test.ts`.
 */

export type OnboardingStepKind = "task" | "profile" | "policy";
export type OnboardingOwner = "employee" | "hr";

export type OnboardingStep = {
  id: string;
  label: string;
  done: boolean;
  kind: OnboardingStepKind;
  owner: OnboardingOwner;
  /** Short line telling the owner what this actually asks of them. */
  hint?: string;
  /** Profile steps: the employee fields that must be filled in. */
  requires?: string[];
  /** Policy steps: the HR document to be read. */
  documentId?: string;
  completedAt?: string;
  completedBy?: string;
};

export type ResolvedOnboardingStep = OnboardingStep & {
  /** Human labels for whatever is still blank; empty on a satisfied step. */
  missing: string[];
  /** True when the data says so, rather than because somebody said so. */
  satisfied: boolean;
};

/**
 * The employee fields a profile step can ask for.
 *
 * Labelled here rather than in the component because the same words are used
 * to tell somebody what is missing and to name the box they type it into, and
 * two sets of wording for one field is how a form starts lying about itself.
 */
export const ONBOARDING_FIELD_LABELS: Record<string, string> = {
  phone: "Phone number",
  emergencyContact: "Emergency contact",
  location: "Home address or base location",
  dateOfBirth: "Date of birth",
  identificationNumber: "NRIC or passport number",
  incomeTaxNumber: "Income tax number",
  epfNumber: "EPF number",
  socsoNumber: "SOCSO number",
  maritalStatus: "Marital status",
  bankName: "Bank",
  bankAccountNumber: "Bank account number",
};

export const PERSONAL_FIELDS = ["phone", "emergencyContact", "location"];

/**
 * What payroll cannot run without.
 *
 * Deliberately not everything payroll would like. An income tax number does not
 * exist until LHDN issues one, and a first job is exactly when somebody has no
 * EPF number yet — requiring either would leave a new joiner permanently short
 * of a step they have no way to complete. Those are asked for on the form and
 * left optional; these four are the ones that genuinely block a payslip.
 */
export const STATUTORY_FIELDS = ["dateOfBirth", "identificationNumber", "bankName", "bankAccountNumber"];

/** The fields an employee may fill in about themselves. */
export const SELF_EDITABLE_FIELDS = [
  "phone", "emergencyContact", "location", "notes",
  "dateOfBirth", "identificationNumber", "incomeTaxNumber", "epfNumber", "socsoNumber",
  "nationality", "maritalStatus", "spouseWorking", "childRelief",
  "bankName", "bankAccountNumber",
];

const clean = (value: unknown) => String(value ?? "").trim();

/**
 * The checklist a new joiner starts with.
 *
 * Ids are stable strings rather than generated per person, so a step can be
 * matched, changed or reasoned about across the whole team instead of only
 * within one employee's array.
 */
export function defaultStaffOnboarding(): OnboardingStep[] {
  return [
    { id: "details-personal", label: "Personal and contact details", done: false, kind: "profile", owner: "employee", requires: PERSONAL_FIELDS, hint: "Fill in how to reach you, and who to call in an emergency." },
    { id: "details-statutory", label: "Statutory and payment details", done: false, kind: "profile", owner: "employee", requires: STATUTORY_FIELDS, hint: "Your NRIC, date of birth and bank account. Payroll cannot pay you or work out EPF and PCB without these." },
    { id: "policy-employment", label: "Employment terms acknowledged", done: false, kind: "policy", owner: "employee", hint: "Read your employment terms and confirm you have understood them." },
    { id: "policy-handbook", label: "Company policies reviewed", done: false, kind: "policy", owner: "employee", hint: "Read the company handbook and policies, then confirm." },
    { id: "access-tools", label: "KretivOS and work tools access", done: false, kind: "task", owner: "hr", hint: "HR sets up accounts and access." },
    { id: "role-expectations", label: "Role expectations and goals", done: false, kind: "task", owner: "hr", hint: "Your manager walks you through what the role is measured on." },
    { id: "week-one", label: "First-week check-in", done: false, kind: "task", owner: "hr", hint: "A conversation at the end of week one." },
  ];
}

/**
 * Older checklists, matched by label.
 *
 * Everyone already on file has six generated-id tick boxes. Matching on the
 * label upgrades them in place, so an existing team gets the self-service
 * behaviour too rather than only people hired after this shipped.
 */
const LEGACY_BY_LABEL: Record<string, Partial<OnboardingStep>> = Object.fromEntries(
  defaultStaffOnboarding().map((step) => [step.label.toLowerCase(), { kind: step.kind, owner: step.owner, requires: step.requires, hint: step.hint }]),
);

/** Reads a stored step, whatever shape it was saved in. */
export function normaliseOnboardingStep(stored: unknown, index = 0): OnboardingStep {
  const source = (stored && typeof stored === "object" ? stored : {}) as Record<string, any>;
  const label = clean(source.label) || `Step ${index + 1}`;
  const legacy = LEGACY_BY_LABEL[label.toLowerCase()] ?? {};
  const kind: OnboardingStepKind = ["task", "profile", "policy"].includes(clean(source.kind))
    ? clean(source.kind) as OnboardingStepKind
    : (legacy.kind ?? "task");
  const owner: OnboardingOwner = ["employee", "hr"].includes(clean(source.owner))
    ? clean(source.owner) as OnboardingOwner
    : (legacy.owner ?? "hr");

  return {
    id: clean(source.id) || `step-${index + 1}`,
    label,
    done: Boolean(source.done),
    kind,
    owner,
    hint: clean(source.hint) || legacy.hint || "",
    requires: Array.isArray(source.requires) && source.requires.length
      ? source.requires.map(clean).filter(Boolean)
      : legacy.requires,
    documentId: clean(source.documentId) || undefined,
    completedAt: clean(source.completedAt) || undefined,
    completedBy: clean(source.completedBy) || undefined,
  };
}

export function normaliseOnboarding(stored: unknown): OnboardingStep[] {
  const list = Array.isArray(stored) ? stored : [];
  return list.length ? list.map(normaliseOnboardingStep) : defaultStaffOnboarding();
}

/** Which of a step's required fields are still blank, in the words used to ask for them. */
export function profileGaps(employee: Record<string, any>, requires: string[] = []) {
  return requires
    .filter((field) => !clean(employee?.[field]))
    .map((field) => ONBOARDING_FIELD_LABELS[field] ?? field);
}

/**
 * A checklist read against the employee it belongs to.
 *
 * Profile steps take their answer from the data every time, so a stored `done`
 * on one is ignored rather than trusted — it is the residue of the old
 * tick-box behaviour, and honouring it would let a checklist claim details
 * that were never supplied.
 */
export function resolveOnboarding(stored: unknown, employee: Record<string, any>): ResolvedOnboardingStep[] {
  return normaliseOnboarding(stored).map((step) => {
    if (step.kind !== "profile") return { ...step, missing: [], satisfied: step.done };
    const missing = profileGaps(employee, step.requires);
    const satisfied = missing.length === 0;
    return { ...step, done: satisfied, satisfied, missing };
  });
}

export type OnboardingSummary = {
  total: number;
  done: number;
  percent: number;
  /** Outstanding steps split by who has to act, so a stalled joiner is visible. */
  waitingOnEmployee: number;
  waitingOnHR: number;
  complete: boolean;
};

export function onboardingSummary(steps: ResolvedOnboardingStep[]): OnboardingSummary {
  const total = steps.length;
  const done = steps.filter((step) => step.done).length;
  const outstanding = steps.filter((step) => !step.done);
  return {
    total,
    done,
    percent: total ? Math.round(done / total * 100) : 0,
    waitingOnEmployee: outstanding.filter((step) => step.owner === "employee").length,
    waitingOnHR: outstanding.filter((step) => step.owner === "hr").length,
    complete: total > 0 && done === total,
  };
}

/**
 * Whether a session may mark a step done.
 *
 * A profile step is never completable by hand — it is answered by the data, and
 * a button that appeared to override that would be lying about what it did.
 */
export function canCompleteStep(step: OnboardingStep, { isOwnRecord, isManager }: { isOwnRecord: boolean; isManager: boolean }) {
  if (step.kind === "profile") return false;
  if (isManager) return true;
  return isOwnRecord && step.owner === "employee";
}

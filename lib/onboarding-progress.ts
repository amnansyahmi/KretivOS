/**
 * Onboarding progress derived from the records themselves.
 *
 * The checklist was five manual checkboxes. Ticking one changed nothing except
 * the tick, so a client could be marked fully onboarded with no brand, no
 * agreement and no project — and, worse, a client who genuinely had all three
 * still showed an empty checklist until somebody remembered to tick it.
 *
 * A step is now satisfied by the thing it describes existing. The operator's
 * job becomes doing the work, not reporting it. A manual tick is still honoured
 * as an override, because there will always be a step whose evidence lives
 * somewhere this system cannot see.
 */

export type OnboardingInputs = {
  customer?: { name?: string; email?: string; phone?: string; industry?: string; contactName?: string } | null;
  contacts: { customerId: string }[];
  brands: { customerId: string; status?: string }[];
  documents: { customerId: string; type?: string; status?: string }[];
  projects: { customerId: string; status?: string; progress?: number }[];
};

export type OnboardingStepState = {
  id: string;
  label: string;
  /** True when the underlying records say so. */
  satisfied: boolean;
  /** True when someone ticked it by hand despite the records. */
  overridden: boolean;
  done: boolean;
  /** What is missing, in the words of the thing to go and do. */
  hint: string;
  /** Which workspace section completes it. */
  action?: { label: string; tab: string };
};

const AGREEMENT_TYPES = ["Quotation", "Sales Order", "Invoice", "Proforma Invoice"];
const AGREED_STATUSES = ["Approved", "Sent", "Paid", "Partially paid", "Overdue"];

/**
 * Matches a step to a rule by its label rather than its id, because ids are
 * generated per onboarding record while the labels come from the blueprint.
 */
function evaluate(label: string, inputs: OnboardingInputs): { satisfied: boolean; hint: string; action?: { label: string; tab: string } } {
  const key = label.toLowerCase();
  const { customer, contacts, brands, documents, projects } = inputs;

  if (key.includes("customer profile")) {
    // A name alone is what "create the customer" already gave you; the profile
    // is complete when there is a way to reach them and a sector to work in.
    const reachable = Boolean(customer?.email || customer?.phone) || contacts.length > 0;
    const described = Boolean(customer?.industry);
    return {
      satisfied: Boolean(customer?.name) && reachable && described,
      hint: !customer?.name ? "No customer record yet."
        : !reachable ? "Add an email, a phone number or a contact person."
        : !described ? "Set the industry so briefs and reports have context."
        : "Profile complete.",
      action: { label: "Open customer", tab: "customers" },
    };
  }

  if (key.includes("agreement") || key.includes("commercial")) {
    const agreed = documents.filter((d) =>
      AGREEMENT_TYPES.includes(String(d.type)) && AGREED_STATUSES.includes(String(d.status)));
    return {
      satisfied: agreed.length > 0,
      hint: agreed.length ? `${agreed.length} agreed document${agreed.length === 1 ? "" : "s"}.`
        : "Raise a quotation and move it past Draft.",
      action: { label: "Raise a quotation", tab: "quotation" },
    };
  }

  if (key.includes("brand")) {
    const live = brands.filter((b) => String(b.status ?? "Active") !== "Archived");
    return {
      satisfied: live.length > 0,
      hint: live.length ? `${live.length} brand record${live.length === 1 ? "" : "s"}.` : "No Brand DNA recorded yet.",
      action: { label: "Add Brand DNA", tab: "brands" },
    };
  }

  if (key.includes("delivery") || key.includes("project")) {
    return {
      satisfied: projects.length > 0,
      hint: projects.length ? `${projects.length} project${projects.length === 1 ? "" : "s"} created.`
        : "No project exists for this client yet.",
      action: { label: "Create a project", tab: "projects" },
    };
  }

  if (key.includes("launch")) {
    // Launch is the work actually starting, not merely being planned.
    const started = projects.filter((p) => String(p.status) !== "Planning" || Number(p.progress ?? 0) > 0);
    return {
      satisfied: started.length > 0,
      hint: started.length ? "Delivery has started." : "Move a project out of Planning to launch.",
      action: { label: "Open projects", tab: "projects" },
    };
  }

  // An unrecognised step from a custom blueprint stays manual.
  return { satisfied: false, hint: "Tick when this is done." };
}

export function onboardingProgress(
  steps: { id: string; label: string; done?: boolean }[],
  inputs: OnboardingInputs,
): OnboardingStepState[] {
  return steps.map((step) => {
    const { satisfied, hint, action } = evaluate(step.label, inputs);
    const overridden = Boolean(step.done) && !satisfied;
    return {
      id: step.id,
      label: step.label,
      satisfied,
      overridden,
      done: satisfied || Boolean(step.done),
      hint,
      action,
    };
  });
}

/** The status the records imply, so it cannot disagree with the checklist. */
export function onboardingStatus(states: OnboardingStepState[]): "Not started" | "In progress" | "Completed" {
  if (!states.length) return "Not started";
  if (states.every((s) => s.done)) return "Completed";
  return states.some((s) => s.done) ? "In progress" : "Not started";
}

/** For the progress bar and the "3 of 5" line. */
export function onboardingCompletion(states: OnboardingStepState[]) {
  const done = states.filter((s) => s.done).length;
  return { done, total: states.length, percent: states.length ? Math.round((done / states.length) * 100) : 0 };
}

/** Filters a collection down to one customer, so the caller does it once. */
export function inputsForCustomer(customerId: string, data: {
  customers: any[]; contacts: any[]; brands: any[]; documents: any[]; projects: any[];
}): OnboardingInputs {
  const mine = <T extends { customerId?: string }>(rows: T[]) => rows.filter((row) => row.customerId === customerId);
  return {
    customer: data.customers.find((row) => row.id === customerId) ?? null,
    contacts: mine(data.contacts),
    brands: mine(data.brands),
    documents: mine(data.documents),
    projects: mine(data.projects),
  };
}

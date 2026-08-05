/**
 * What one person's HR day actually looks like.
 *
 * My HR had become a place that showed things: a header, some counts, a
 * profile, an onboarding card. None of it answered the two questions anybody
 * opens it with — is there anything I need to do, and where do I go to do the
 * thing I came for.
 *
 * So the screen is built from these two functions. `todayStatus` is the first
 * one, because "have I clocked in" is checked more often than everything else
 * combined. `outstandingActions` is the second, and it deliberately returns a
 * list rather than a count: "3 things need your attention" is a number to go
 * hunting behind, while "your bank account is missing, payroll cannot pay you"
 * is a thing to go and fix.
 *
 * Pure, and asserted directly in `my-hr-summary.test.ts`.
 */

import { entitlementFor, type LeaveTypeRule } from "./leave-entitlement.ts";

const clean = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export type TodayState = "holiday" | "leave" | "clocked_out" | "clocked_in" | "not_clocked_in";

export type TodayStatus = {
  state: TodayState;
  headline: string;
  detail: string;
  /** What the button on this card should offer, if anything. */
  action: "clock_in" | "clock_out" | null;
};

/**
 * Where today stands.
 *
 * A public holiday and approved leave both outrank the clock, because on those
 * days "not clocked in" is not a thing anybody needs prompting about — it is
 * the arrangement.
 */
export function todayStatus({
  date,
  attendance = [],
  leave = [],
  holidayName = "",
}: {
  date: string;
  attendance?: any[];
  leave?: any[];
  holidayName?: string;
}): TodayStatus {
  if (clean(holidayName)) {
    return { state: "holiday", headline: clean(holidayName), detail: "Public holiday · no need to clock in.", action: null };
  }

  const onLeave = leave.find((item) =>
    item.status === "Approved"
    && clean(item.startDate) <= date
    && clean(item.endDate || item.startDate) >= date);
  if (onLeave) {
    return { state: "leave", headline: `On ${clean(onLeave.type).toLowerCase() || "leave"}`, detail: "Approved leave. Enjoy it.", action: null };
  }

  const record = attendance.find((item) => clean(item.date) === date);
  if (record?.checkOut) {
    return {
      state: "clocked_out",
      headline: `Done for the day`,
      detail: `${clean(record.checkIn) || "—"} to ${clean(record.checkOut)}${record.durationMinutes ? ` · ${Math.round(num(record.durationMinutes) / 60 * 10) / 10}h` : ""}`,
      action: null,
    };
  }
  if (record?.checkIn) {
    return { state: "clocked_in", headline: `Clocked in at ${clean(record.checkIn)}`, detail: "Clock out when you finish.", action: "clock_out" };
  }
  return { state: "not_clocked_in", headline: "Not clocked in yet", detail: "Clock in when you start.", action: "clock_in" };
}

export type ActionUrgency = "blocking" | "waiting" | "info";

export type OutstandingAction = {
  id: string;
  label: string;
  hint: string;
  urgency: ActionUrgency;
  /** Which tab resolves it, so the card can be a link rather than a note. */
  tab: string;
};

/** The fields payroll cannot issue a payslip without. */
const PAYROLL_CRITICAL: [string, string][] = [
  ["bankAccountNumber", "bank account"],
  ["identificationNumber", "NRIC or passport number"],
  ["dateOfBirth", "date of birth"],
];

/**
 * Everything genuinely waiting on this person, most blocking first.
 *
 * Ordered by whether it stops something: a missing bank account stops a
 * payslip, an unfinished onboarding step stops nothing but is owed, and a
 * pending request is just information — nobody needs to act, they need to know
 * it has not been forgotten.
 */
export function outstandingActions({
  employee,
  leave = [],
  claims = [],
  timesheets = [],
  weekStart = "",
  today = "",
}: {
  employee?: any;
  leave?: any[];
  claims?: any[];
  timesheets?: any[];
  weekStart?: string;
  today?: string;
}): OutstandingAction[] {
  const actions: OutstandingAction[] = [];

  const missing = PAYROLL_CRITICAL.filter(([field]) => !clean(employee?.[field])).map(([, label]) => label);
  if (employee && missing.length) {
    actions.push({
      id: "payroll-details",
      label: `Add your ${missing.join(", ")}`,
      hint: "Payroll cannot pay you or work out your EPF without these.",
      urgency: "blocking",
      tab: "profile",
    });
  }

  const onboarding = (employee?.onboarding ?? []).filter((step: any) => step.owner === "employee" && !step.done);
  if (onboarding.length) {
    actions.push({
      id: "onboarding",
      label: `Finish ${onboarding.length} onboarding step${onboarding.length === 1 ? "" : "s"}`,
      hint: onboarding.map((step: any) => step.label).slice(0, 2).join(" · "),
      urgency: "blocking",
      tab: "self",
    });
  }

  // Only counted once the week is under way — nobody owes a timesheet on Monday
  // morning, and prompting for one is how a useful nudge becomes noise.
  if (weekStart && today && today > weekStart) {
    const logged = timesheets.filter((entry) => clean(entry.date) >= weekStart && clean(entry.date) <= today);
    if (!logged.length) {
      actions.push({
        id: "timesheet",
        label: "Log this week's tasks",
        hint: "Nothing recorded since Monday.",
        urgency: "waiting",
        tab: "timesheet",
      });
    }
  }

  const rejectedLeave = leave.filter((item) => item.status === "Rejected");
  if (rejectedLeave.length) {
    actions.push({
      id: "leave-rejected",
      label: `${rejectedLeave.length} leave request${rejectedLeave.length === 1 ? "" : "s"} rejected`,
      hint: clean(rejectedLeave[0].approverNote) || "Open it to see why, edit and resubmit.",
      urgency: "waiting",
      tab: "leave",
    });
  }

  const pendingLeave = leave.filter((item) => item.status === "Pending").length;
  const pendingClaims = claims.filter((item) => item.status === "Pending").length;
  if (pendingLeave || pendingClaims) {
    const parts = [
      pendingLeave ? `${pendingLeave} leave request${pendingLeave === 1 ? "" : "s"}` : "",
      pendingClaims ? `${pendingClaims} claim${pendingClaims === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    actions.push({
      id: "pending",
      label: `${parts.join(" and ")} awaiting approval`,
      hint: "Nothing to do — this is with your manager.",
      urgency: "info",
      tab: pendingLeave ? "leave" : "claims",
    });
  }

  const unpaidClaims = claims.filter((item) => item.status === "Approved" && item.financeStatus !== "Paid").length;
  if (unpaidClaims) {
    actions.push({
      id: "claims-unpaid",
      label: `${unpaidClaims} approved claim${unpaidClaims === 1 ? "" : "s"} not yet paid`,
      hint: "Approved and queued for the next payment run.",
      urgency: "info",
      tab: "claims",
    });
  }

  return actions;
}

/** Minutes logged between two dates inclusive. */
export function loggedBetween(timesheets: any[], from: string, to: string) {
  return timesheets
    .filter((entry) => clean(entry.date) >= from && clean(entry.date) <= to)
    .reduce((sum, entry) => sum + Math.max(0, num(entry.durationMinutes)), 0);
}

/** The Monday of the week a date falls in, as "YYYY-MM-DD". */
export function weekStartFor(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(date));
  if (!match) return "";
  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const weekday = parsed.getUTCDay();
  parsed.setUTCDate(parsed.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return parsed.toISOString().slice(0, 10);
}

/**
 * What is left of each entitlement this year.
 *
 * Pending requests are counted against the balance alongside approved ones. A
 * balance that ignores what you have already asked for invites asking twice for
 * days that only exist once.
 */
export function myLeaveBalances(rules: LeaveTypeRule[], employee: any, requests: any[], year: number) {
  return rules.filter((rule) => rule.deductsBalance).map((rule) => {
    const override = Number(employee?.leaveEntitlements?.[rule.name] || 0);
    const recorded = override > 0 ? override
      : rule.kind === "annual" ? Number(employee?.annualLeaveBalance || 0)
        : rule.kind === "sick" ? Number(employee?.medicalLeaveBalance || 0)
          : undefined;

    const { days: entitlement } = entitlementFor({
      rules, typeName: rule.name,
      startDate: String(employee?.startDate || ""),
      asOf: `${year}-12-31`,
      recordedDays: recorded,
    });

    const committed = requests
      .filter((item) => item.type === rule.name && String(item.startDate || "").startsWith(String(year)) && ["Pending", "Approved"].includes(item.status))
      .reduce((sum, item) => sum + Number(item.days || 0), 0);
    const taken = requests
      .filter((item) => item.type === rule.name && String(item.startDate || "").startsWith(String(year)) && item.status === "Approved")
      .reduce((sum, item) => sum + Number(item.days || 0), 0);

    return { name: rule.name, entitlement, taken, pending: committed - taken, remaining: Math.max(0, entitlement - committed) };
  });
}

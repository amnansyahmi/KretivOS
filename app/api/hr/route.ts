import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { createPinCredential, HRAuthError, publicSession, requireHRSession, roleFromMetadata, type HRSession } from "@/lib/hr-auth";
import { mutateWorkspaceState, WorkspaceConflictError } from "@/lib/workspace-state";
import { postPayrollAccrual, postPayrollPayment, payrollAlreadyPosted, toPayrollRecord } from "@/lib/payroll-posting";
import { ageAtPeriod, computePayroll, profileForPeriod, SEEDED_PROFILE, toStatutoryProfile } from "@/lib/payroll-statutory";
import {
  canCompleteStep, defaultStaffOnboarding, normaliseOnboarding, onboardingSummary,
  resolveOnboarding, SELF_EDITABLE_FIELDS,
} from "@/lib/staff-onboarding";
import { overtimeForPeriod, toOvertimeRules } from "@/lib/overtime";
import { DEFAULT_REST_DAYS, datesBetween, workingDates } from "@/lib/work-calendar";
import {
  countsCalendarDays, DEFAULT_LEAVE_RULES, entitlementFor, findLeaveRule, toLeaveRules,
} from "@/lib/leave-entitlement";
import { neonWorkspaceStore } from "@/lib/workspace-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const SCOPE = "hr-operations-v1";

const clean = (value: unknown) => String(value ?? "").trim();
const optional = (value: unknown) => clean(value) || null;
const number = (value: unknown) => Number(value || 0);
const bool = (value: unknown) => Boolean(value);
const array = (value: unknown) => Array.isArray(value) ? value : [];
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

const starterNames = [
  "Amirul Hafiz",
  "Nurfadilah (Ila)",
  "Muhammad Afiq",
  "Amnan",
  "Ajam (Multazam)",
];

const defaultOnboarding = defaultStaffOnboarding;

const defaultOperations = {
  leaveRequests: [] as any[],
  attendance: [] as any[],
  attendanceCorrections: [] as any[],
  goals: [] as any[],
  learning: [] as any[],
  documents: [] as any[],
  claims: [] as any[],
  payroll: [] as any[],
  lifecycle: [] as any[],
  announcements: [] as any[],
  events: [] as any[],
  shifts: [] as any[],
  paymentVouchers: [] as any[],
  settings: {
    departments: ["Leadership", "Marketing", "Creative", "Technology", "Finance", "Operations"],
    leaveTypes: DEFAULT_LEAVE_RULES,
    workModes: ["Office", "Remote", "Hybrid", "Client Site"],
    /*
     * `state` drives the rest days and which state holidays are offered.
     * Kretivco is in Subang Jaya, so Selangor and a Saturday-Sunday weekend.
     */
    attendance: {
      timezone: "Asia/Kuala_Lumpur", shiftStart: "09:00", shiftEnd: "18:00", graceMinutes: 15, overtimeAfterMinutes: 540,
      state: "Selangor", restDays: DEFAULT_REST_DAYS,
      overtime: { daysPerMonth: 26, hoursPerDay: 8, normalMultiplier: 1.5, restDayMultiplier: 2, publicHolidayMultiplier: 3 },
    },
    leavePolicy: { annualAccrual: "annual", carryForwardDays: 5, carryForwardExpiryMonth: 3, prorateNewJoiner: true },
    publicHolidays: [] as { date: string; name: string }[],
    statutoryProfiles: [SEEDED_PROFILE],
    /*
     * The employer block printed at the head of every EA statement. The E
     * number is LHDN's own reference for the employer and is not the company
     * registration number, so it cannot be copied from the organisation record
     * and is left blank until somebody enters it.
     */
    employer: {
      name: "Kretivco Mediaworks",
      employerNumber: "",
      registrationNumber: "SA0463354-A",
      address: "No.15A, Jalan USJ1/19, 47600 Subang Jaya, Selangor",
    },
  },
};

/**
 * The fields payroll computes from, kept in one place.
 *
 * Create and the admin branch of update both rebuild an employee's metadata
 * from scratch, so a field added to one and forgotten in the other silently
 * clears itself on the next edit — which for a date of birth means the
 * contributions quietly stop applying the age rules.
 */
function payrollProfileMetadata(data: Record<string, any>) {
  return {
    dateOfBirth: clean(data.dateOfBirth),
    nationality: clean(data.nationality) || "Malaysian",
    taxResident: data.taxResident !== false,
    maritalStatus: clean(data.maritalStatus) || "Single",
    spouseWorking: bool(data.spouseWorking),
    childRelief: Math.max(0, Math.floor(number(data.childRelief))),
    epfApplicable: data.epfApplicable !== false,
    socsoApplicable: data.socsoApplicable !== false,
    eisApplicable: data.eisApplicable !== false,
    employeeNumber: clean(data.employeeNumber),
    bankName: clean(data.bankName),
    bankAccountNumber: clean(data.bankAccountNumber),
  };
}

/**
 * Compensation, and the trail of how it got there.
 *
 * A salary field that is simply overwritten answers "what do they earn" and
 * nothing else — not what they earned in March, not when the raise happened,
 * not who approved it. Those are the questions actually asked, usually months
 * later and usually in a disagreement, so each change appends rather than
 * replaces. Only a real change is recorded; re-saving the form is not a raise.
 */
function compensationMetadata(data: Record<string, any>, previous: Record<string, any>, userId: string) {
  const basicSalary = Math.max(0, number(data.basicSalary));
  const allowances = Math.max(0, number(data.allowances));
  const effectiveFrom = clean(data.salaryEffectiveFrom);
  const changed = basicSalary !== number(previous.basicSalary)
    || allowances !== number(previous.allowances)
    || effectiveFrom !== clean(previous.salaryEffectiveFrom);

  const history = array(previous.salaryHistory);
  return {
    basicSalary,
    allowances,
    salaryEffectiveFrom: effectiveFrom,
    salaryHistory: changed
      ? [{ basicSalary, allowances, effectiveFrom, changedAt: new Date().toISOString(), changedBy: userId, note: clean(data.salaryNote) }, ...history].slice(0, 50)
      : history,
    leaveEntitlements: Object.fromEntries(
      Object.entries(object(data.leaveEntitlements))
        .map(([name, days]) => [clean(name), Math.max(0, number(days))])
        .filter(([name, days]) => name && Number(days) > 0),
    ),
  };
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "team.member";
}

function mapEmployee(row: any) {
  const metadata = object(row.metadata);
  const placeholderEmail = bool(metadata.emailPlaceholder);
  const employee = {
    id: row.id,
    name: row.display_name,
    email: placeholderEmail ? "" : row.email,
    internalEmail: row.email,
    status: row.status,
    title: clean(metadata.title),
    department: clean(metadata.department) || "Leadership",
    employmentType: clean(metadata.employmentType) || "Core Team",
    workMode: clean(metadata.workMode) || "Hybrid",
    location: clean(metadata.location),
    startDate: clean(metadata.startDate),
    phone: clean(metadata.phone),
    emergencyContact: clean(metadata.emergencyContact),
    annualLeaveBalance: number(metadata.annualLeaveBalance || 14),
    medicalLeaveBalance: number(metadata.medicalLeaveBalance || 14),
    carryForwardLeaveBalance: number(metadata.carryForwardLeaveBalance),
    skills: array(metadata.skills).map(clean).filter(Boolean),
    notes: clean(metadata.notes),
    role: roleFromMetadata(metadata),
    authConfigured: Boolean(clean(object(metadata.auth).pinHash)),
    managerId: clean(metadata.managerId),
    probationEndDate: clean(metadata.probationEndDate),
    confirmationDate: clean(metadata.confirmationDate),
    endDate: clean(metadata.endDate),
    /*
     * Statutory identity, required on the annual EA statement. Held per person
     * rather than derived, because a foreign hire has a passport number where a
     * citizen has an NRIC, and neither is inferable from anything else on file.
     */
    identificationNumber: clean(metadata.identificationNumber),
    incomeTaxNumber: clean(metadata.incomeTaxNumber),
    epfNumber: clean(metadata.epfNumber),
    socsoNumber: clean(metadata.socsoNumber),
    /*
     * What the statutory engine needs to work the deductions out rather than
     * have them typed in. Date of birth is not decoration: EPF, SOCSO and EIS
     * all change at 60, so without it the contributions are computed as though
     * nobody ever ages. Marital status, a working spouse and the child count
     * are the PCB reliefs; citizenship and residency change the rules
     * altogether rather than the rate.
     */
    dateOfBirth: clean(metadata.dateOfBirth),
    nationality: clean(metadata.nationality) || "Malaysian",
    taxResident: metadata.taxResident !== false,
    maritalStatus: clean(metadata.maritalStatus) || "Single",
    spouseWorking: bool(metadata.spouseWorking),
    childRelief: number(metadata.childRelief),
    epfApplicable: metadata.epfApplicable !== false,
    socsoApplicable: metadata.socsoApplicable !== false,
    eisApplicable: metadata.eisApplicable !== false,
    /*
     * Payment details. Without an account number payroll cannot leave the
     * building except by somebody retyping it into the bank, which is exactly
     * the manual step the rest of this is removing.
     */
    employeeNumber: clean(metadata.employeeNumber),
    bankName: clean(metadata.bankName),
    bankAccountNumber: clean(metadata.bankAccountNumber),
    /*
     * Current pay, held on the person rather than only on each month's payroll.
     * Payroll lines are a record of what was paid; this is what they are
     * supposed to be paid, which is the thing a raise changes and the thing
     * overtime is priced from before any payroll line for the month exists.
     */
    basicSalary: number(metadata.basicSalary),
    allowances: number(metadata.allowances),
    salaryEffectiveFrom: clean(metadata.salaryEffectiveFrom),
    salaryHistory: array(metadata.salaryHistory),
    /*
     * Per-type entitlement overrides. `annualLeaveBalance` and
     * `medicalLeaveBalance` predate this and are still honoured, so nobody's
     * agreed entitlement disappears when the map is empty.
     */
    leaveEntitlements: object(metadata.leaveEntitlements),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  /*
   * Resolved against the employee it belongs to, on every read. A details step
   * answers to what is actually on file rather than to a stored tick, so a
   * checklist cannot claim an NRIC or a bank account that was never supplied —
   * and it un-completes itself if one is later cleared, which a boolean could
   * not.
   */
  const onboarding = resolveOnboarding(metadata.onboarding, employee);
  return { ...employee, onboarding, onboardingSummary: onboardingSummary(onboarding) };
}

/**
 * Blanks the fields that exist only so payroll can be computed and paid.
 *
 * A manager needs the directory to run probation reviews and approve leave;
 * none of that needs a colleague's NRIC, date of birth, marital status or bank
 * account. Those were readable before only because nothing sensitive enough
 * to matter was in the payload — adding an account number changes that, so the
 * cut is made now rather than after it is somebody's problem.
 *
 * Only the shape leaves; the values stay on the server. Manager edits write
 * back a fixed set of fields, so a redacted record cannot save its own blanks
 * over the real ones.
 */
function withoutPersonalFinanceData(employee: ReturnType<typeof mapEmployee>) {
  return {
    ...employee,
    identificationNumber: "", incomeTaxNumber: "", epfNumber: "", socsoNumber: "",
    dateOfBirth: "", maritalStatus: "", spouseWorking: false, childRelief: 0,
    bankName: "", bankAccountNumber: "",
    // What somebody earns is the most sensitive field on the record and the
    // least necessary for approving their leave.
    basicSalary: 0, allowances: 0, salaryEffectiveFrom: "", salaryHistory: [],
    redacted: true,
  };
}

function directoryEmployee(employee: ReturnType<typeof mapEmployee>) {
  return {
    id: employee.id,
    name: employee.name,
    title: employee.title,
    department: employee.department,
    managerId: employee.managerId,
    status: employee.status,
    workMode: employee.workMode,
  };
}

async function seedEmployees() {
  const sql = getDatabase();
  for (const name of starterNames) {
    const email = `${slug(name)}@team.kretivco.local`;
    await sql`
      insert into users (id, organization_id, email, display_name, status, metadata)
      values (
        ${randomUUID()}, ${ORGANIZATION_ID}, ${email}, ${name}, 'active',
        ${JSON.stringify({
          emailPlaceholder: true,
          title: "Kretivco Team",
          department: "Leadership",
          employmentType: "Core Team",
          workMode: "Hybrid",
          annualLeaveBalance: 14,
          medicalLeaveBalance: 14,
          skills: [],
          onboarding: defaultOnboarding(),
        })}::jsonb
      )
      on conflict (organization_id, email) do nothing
    `;
  }
}

const operationsStore = neonWorkspaceStore<Record<string, any>>(SCOPE);

/** Fills in defaults the stored blob may predate, without writing them back. */
function withDefaults(data: Record<string, any>): Record<string, any> {
  const next = { ...defaultOperations, ...object(data) };
  next.settings = { ...defaultOperations.settings, ...object(next.settings) };
  return next;
}

/** Read-only load, for the snapshot the GET/POST responses return. */
async function loadOperations() {
  const snapshot = (await operationsStore.load()) ?? (await operationsStore.create({ ...defaultOperations }));
  return { data: withDefaults(snapshot.data), version: snapshot.version };
}

async function audit(action: string, entityType: string, entityId: string | null, afterData?: unknown, userId?: string) {
  try {
    const sql = getDatabase();
    await sql`
      insert into audit_logs (organization_id, user_id, action, entity_type, entity_id, after_data, metadata)
      values (
        ${ORGANIZATION_ID}, ${userId || null}, ${action}, ${entityType}, ${entityId},
        ${afterData ? JSON.stringify(afterData) : null}::jsonb,
        ${JSON.stringify({ source: "hr-api", authenticated: Boolean(userId), containsSensitiveData: true })}::jsonb
      )
    `;
  } catch {}
}

async function notify(title: string, body: string, entityType: string, entityId: string, userId?: string) {
  try {
    const sql = getDatabase();
    if (userId === "*") {
      await sql`
        insert into notifications (organization_id, user_id, title, body, type, status, entity_type, entity_id)
        select ${ORGANIZATION_ID}, id, ${title}, ${body}, 'hr', 'Unread', ${entityType}, ${entityId}
        from users where organization_id = ${ORGANIZATION_ID} and status = 'active'
      `;
      return;
    }
    await sql`
      insert into notifications (organization_id, user_id, title, body, type, status, entity_type, entity_id)
      values (${ORGANIZATION_ID}, ${userId || null}, ${title}, ${body}, 'hr', 'Unread', ${entityType}, ${entityId})
    `;
  } catch {}
}

/**
 * Sends closed and paid payroll to the ledger.
 *
 * Staff cost is the largest expense a small agency has and none of it used to
 * reach the accounts, so the profit and loss understated costs by the entire
 * wage bill and EPF, SOCSO, EIS and PCB liabilities did not exist at all.
 *
 * Never throws: closing payroll must not fail because accounting is unavailable
 * or the period is closed. The payroll stays unposted and retryable, and the
 * reason comes back to the caller.
 */
async function recordPayrollOnLedger(pending: { record: any; action: string } | null, userId: string) {
  if (!pending) return null;

  const record = toPayrollRecord(pending.record);
  if (!record.id) return null;

  const stage = pending.action === "close" ? "payroll" : "payroll_payment";
  if (await payrollAlreadyPosted(record.id, stage)) return null;

  let employeeName = "Team member";
  try {
    const rows = await getDatabase()`
      select display_name from users where id = ${record.employeeId} and organization_id = ${ORGANIZATION_ID} limit 1
    `;
    if (rows[0]?.display_name) employeeName = String(rows[0].display_name);
  } catch {
    // The name is only a memo; an unreadable one must not stop the posting.
  }

  const outcome = pending.action === "close"
    ? await postPayrollAccrual(record, employeeName, { createdBy: userId })
    : await postPayrollPayment(record, employeeName, { createdBy: userId });

  if (outcome.status === "posted") return { posted: true, entryId: outcome.entryId };
  if (outcome.status === "failed") return { posted: false, error: outcome.reason };
  return null;
}

/**
 * Queues the write-side effects of a state mutation.
 *
 * A mutation passed to `mutateWorkspaceState` can be executed more than once
 * when another request commits first, so it must not notify or audit directly —
 * a retried leave request would otherwise send two notifications and write two
 * audit entries. Effects are collected here and flushed once, after the state
 * has actually committed. A mutation that throws flushes nothing, which also
 * fixes the older bug where validation failing *after* `notify()` left a stray
 * notification for a request that was rejected.
 */
function deferredEffects() {
  let audits: Parameters<typeof audit>[] = [];
  let notifications: Parameters<typeof notify>[] = [];

  return {
    audit: (...args: Parameters<typeof audit>) => { audits.push(args); },
    notify: (...args: Parameters<typeof notify>) => { notifications.push(args); },
    /** Called at the start of every attempt so a discarded attempt leaves nothing behind. */
    reset() { audits = []; notifications = []; },
    async flush() {
      for (const args of audits) await audit(...args);
      for (const args of notifications) await notify(...args);
    },
  };
}

function scopedSnapshot(value: Record<string, any>, session: HRSession) {
  const own = (items: any[]) => items.filter((item) => item.employeeId === session.userId);
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const publicAnnouncements = array(value.announcements).filter((item: any) => item.status === "Published" && (!clean(item.publishAt) || clean(item.publishAt).slice(0, 10) <= currentDate) && (!clean(item.expiresAt) || clean(item.expiresAt).slice(0, 10) >= currentDate));
  const publicEvents = array(value.events).filter((item: any) => item.status === "Scheduled");
  if (session.role === "hr_admin") return { ...value, session: publicSession(session) };
  if (session.role === "finance") return {
    ...value,
    /*
     * Finance keeps pay and payment details for everyone — running payroll is
     * the job — and nothing else. The personal half of the record, statutory
     * identity aside, is not theirs to read.
     */
    employees: array(value.employees).map((item: any) => item.id === session.userId ? item : ({
      id: item.id, name: item.name, title: item.title, department: item.department, status: item.status, workMode: item.workMode,
      employeeNumber: item.employeeNumber, basicSalary: item.basicSalary, allowances: item.allowances,
      bankName: item.bankName, bankAccountNumber: item.bankAccountNumber,
      identificationNumber: item.identificationNumber, incomeTaxNumber: item.incomeTaxNumber,
      epfNumber: item.epfNumber, socsoNumber: item.socsoNumber, dateOfBirth: item.dateOfBirth,
    })),
    leaveRequests: own(array(value.leaveRequests)),
    attendance: own(array(value.attendance)),
    goals: own(array(value.goals)),
    learning: own(array(value.learning)),
    documents: array(value.documents).filter((item: any) => !item.employeeId || item.employeeId === session.userId),
    lifecycle: own(array(value.lifecycle)),
    attendanceCorrections: own(array(value.attendanceCorrections)),
    announcements: publicAnnouncements,
    events: publicEvents,
    shifts: own(array(value.shifts)),
    session: publicSession(session),
  };
  if (session.role === "manager") return {
    ...value,
    employees: array(value.employees).map((item: any) => item.id === session.userId ? item : withoutPersonalFinanceData(item)),
    payroll: own(array(value.payroll)),
    paymentVouchers: [],
    documents: array(value.documents).filter((item: any) => !item.employeeId || item.employeeId === session.userId),
    session: publicSession(session),
  };
  return {
    ...value,
    employees: array(value.employees).filter((item: any) => item.id === session.userId),
    leaveRequests: own(array(value.leaveRequests)),
    attendance: own(array(value.attendance)),
    attendanceCorrections: own(array(value.attendanceCorrections)),
    goals: own(array(value.goals)),
    learning: own(array(value.learning)),
    documents: array(value.documents).filter((item: any) => !item.employeeId || item.employeeId === session.userId),
    claims: own(array(value.claims)),
    payroll: own(array(value.payroll)),
    paymentVouchers: [],
    shifts: own(array(value.shifts)),
    lifecycle: own(array(value.lifecycle)),
    announcements: publicAnnouncements,
    events: publicEvents,
    settings: {
      ...object(value.settings),
      statutoryProfiles: [],
    },
    session: publicSession(session),
  };
}

async function snapshot(session: HRSession) {
  await seedEmployees();
  const sql = getDatabase();
  const [employeeRows, operations] = await Promise.all([
    sql`select * from users where organization_id = ${ORGANIZATION_ID} order by status asc, display_name asc`,
    loadOperations(),
  ]);
  const employees = employeeRows.map(mapEmployee);
  return scopedSnapshot({
    ...operations.data,
    employees,
    directory: employees.map(directoryEmployee),
    version: operations.version,
    syncedAt: new Date().toISOString(),
  }, session);
}

/**
 * The working dates a leave request actually spans.
 *
 * Both the rest days and the public holidays now come from settings. The old
 * version hardcoded Saturday and Sunday, which counted leave against the wrong
 * days for anyone in Johor, Kedah, Kelantan or Terengganu — and it built dates
 * with `new Date("YYYY-MM-DDT00:00:00")`, which is parsed in whatever zone the
 * server happens to run in and then read back as UTC, so a request could gain
 * or lose its first day depending on where it was deployed.
 *
 * A near-identical `businessDays` sat beside it with the same two bugs and no
 * callers at all, and has gone.
 */
function leaveDates(state: Record<string, any>, start: string, end: string) {
  const attendance = object(object(state.settings).attendance);
  const restDays = array(attendance.restDays).map(number).filter((day) => day >= 0 && day <= 6);
  const holidays = array(object(state.settings).publicHolidays).map((item: any) => clean(item.date)).filter(Boolean);
  return workingDates(start, end, {
    restDays: restDays.length ? restDays : DEFAULT_REST_DAYS,
    holidays,
  });
}

/**
 * How many days a leave request costs.
 *
 * Most types are counted in working days, so rest days and public holidays fall
 * out. Maternity and paternity leave are granted as consecutive days, so a
 * weekend inside the period is part of it — counting those in working days
 * would hand out several extra weeks.
 */
function leaveDayCount(state: Record<string, any>, type: string, start: string, end: string, halfDay: boolean) {
  if (halfDay) return 0.5;
  const rules = toLeaveRules(object(state.settings).leaveTypes);
  return countsCalendarDays(rules, type)
    ? datesBetween(start, end).length
    : leaveDates(state, start, end).length;
}

/**
 * Checks a request against the balance, and reports what it leaves behind.
 *
 * Entitlement comes from length of service rather than a number typed onto the
 * employee record when they joined. The record still wins where it is more
 * generous, since that is a contractual promise, but it can no longer hold
 * somebody below the statutory floor their service has earned them.
 *
 * This was two near-identical copies, on create and on update, which is how the
 * update path came to be missing nothing yet and would have drifted the moment
 * either changed.
 */
async function checkLeaveBalance(
  state: Record<string, any>,
  sql: any,
  { employeeId, type, days, startDate, excludeId = "" }: { employeeId: string; type: string; days: number; startDate: string; excludeId?: string },
) {
  const rules = toLeaveRules(object(state.settings).leaveTypes);
  const rule = findLeaveRule(rules, type);
  // Unpaid leave draws on nothing, and maternity and paternity are granted
  // rather than accrued, so none of them has a balance to be short of.
  if (!rule?.deductsBalance) return null;

  const employeeRows = await sql`select * from users where id = ${employeeId} and organization_id = ${ORGANIZATION_ID} limit 1`;
  if (!employeeRows.length) throw new Error("Employee was not found.");
  const employee = mapEmployee(employeeRows[0]);

  const policy = { ...defaultOperations.settings.leavePolicy, ...object(object(state.settings).leavePolicy) };
  const year = Number(clean(startDate).slice(0, 4));
  const requestMonth = Number(clean(startDate).slice(5, 7));
  const override = number(object(employee.leaveEntitlements)[type]);
  const recorded = override > 0 ? override
    : rule.kind === "annual" ? employee.annualLeaveBalance
      : rule.kind === "sick" ? employee.medicalLeaveBalance
        : undefined;

  const base = entitlementFor({ rules, typeName: type, startDate: employee.startDate, asOf: startDate, recordedDays: recorded });
  let entitlement = base.days;

  if (rule.kind === "annual" && policy.prorateNewJoiner && employee.startDate?.startsWith(String(year))) {
    const joinMonth = Number(employee.startDate.slice(5, 7));
    entitlement = Math.floor(entitlement * Math.max(0, 13 - joinMonth) / 12 * 2) / 2;
  }
  if (rule.kind === "annual" && policy.annualAccrual === "monthly") entitlement = Math.floor(entitlement * requestMonth / 12 * 2) / 2;
  if (rule.kind === "annual" && requestMonth <= number(policy.carryForwardExpiryMonth || 3)) {
    entitlement += Math.min(employee.carryForwardLeaveBalance, number(policy.carryForwardDays));
  }

  const committed = array(state.leaveRequests)
    .filter((item: any) => item.id !== excludeId
      && item.employeeId === employeeId
      && item.type === type
      && clean(item.startDate).startsWith(String(year))
      && ["Pending", "Approved"].includes(item.status))
    .reduce((sum: number, item: any) => sum + number(item.days), 0);

  const available = Math.max(0, entitlement - committed);
  if (days > available) throw new Error(`${type} balance is insufficient. Available: ${available} day(s).`);

  return {
    entitlementAtRequest: entitlement,
    balanceAfterRequest: Math.max(0, available - days),
    // Kept so a disputed balance can be explained without re-deriving it.
    entitlementSource: base.source,
    yearsOfServiceAtRequest: base.years,
  };
}

function requireRole(session: HRSession, roles: HRSession["role"][]) {
  if (!roles.includes(session.role)) throw new HRAuthError("You do not have permission for this HRMS action.", 403);
}

function owns(record: any, session: HRSession) {
  return clean(record?.employeeId) === session.userId;
}

function timeMinutes(value: unknown) {
  const match = clean(value).match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function payrollRecord(data: Record<string, any>, current: Record<string, any> = {}) {
  const basicSalary = Math.max(0, number(data.basicSalary ?? current.basicSalary));
  const allowances = Math.max(0, number(data.allowances ?? current.allowances));
  const overtime = Math.max(0, number(data.overtime ?? current.overtime));
  const bonus = Math.max(0, number(data.bonus ?? current.bonus));
  const grossPay = basicSalary + allowances + overtime + bonus;
  const epfEmployee = Math.max(0, number(data.epfEmployee ?? current.epfEmployee));
  const socsoEmployee = Math.max(0, number(data.socsoEmployee ?? current.socsoEmployee));
  const eisEmployee = Math.max(0, number(data.eisEmployee ?? current.eisEmployee));
  const pcb = Math.max(0, number(data.pcb ?? current.pcb));
  const otherDeductions = Math.max(0, number(data.otherDeductions ?? current.otherDeductions));
  const totalDeductions = epfEmployee + socsoEmployee + eisEmployee + pcb + otherDeductions;
  return {
    ...current, ...data,
    employeeId: clean(data.employeeId || current.employeeId), period: clean(data.period || current.period),
    basicSalary, allowances, overtime, bonus, grossPay,
    epfEmployee, socsoEmployee, eisEmployee, pcb, otherDeductions, totalDeductions,
    epfEmployer: Math.max(0, number(data.epfEmployer ?? current.epfEmployer)),
    socsoEmployer: Math.max(0, number(data.socsoEmployer ?? current.socsoEmployer)),
    eisEmployer: Math.max(0, number(data.eisEmployer ?? current.eisEmployer)),
    netPay: Math.max(0, grossPay - totalDeductions),
    statutoryProfileId: clean(data.statutoryProfileId || current.statutoryProfileId || "my-default"),
    verificationNote: clean(data.verificationNote || current.verificationNote),
    statutoryMode: clean(data.statutoryMode || current.statutoryMode) === "manual" ? "manual" : "auto",
    // Unlike statutory, this defaults to manual. Every payroll line written
    // before overtime could be read from attendance holds a figure somebody
    // typed, and switching those to computed on the next edit would silently
    // restate pay that has already been agreed.
    overtimeMode: clean(data.overtimeMode || current.overtimeMode) === "auto" ? "auto" : "manual",
  };
}

/**
 * Prices the overtime already sitting in attendance.
 *
 * Clock-out has been recording overtime minutes all along and payroll has been
 * asking somebody to type a ringgit figure, so the evidence and the payment
 * were never connected. An hour is not worth the same on every day — the
 * Employment Act pays more on a rest day and more again on a public holiday —
 * so the calendar in Settings decides the multiple, which is the same calendar
 * that decides which days leave is counted against.
 */
function withComputedOvertime(record: any, state: Record<string, any>) {
  if (clean(record.overtimeMode) !== "auto") return record;
  if (!record.employeeId || !record.period) return record;

  const attendanceSettings = object(object(state.settings).attendance);
  const restDays = array(attendanceSettings.restDays).map(number).filter((day) => day >= 0 && day <= 6);
  const holidays = new Set(array(object(state.settings).publicHolidays).map((item: any) => clean(item.date)).filter(Boolean));

  const summary = overtimeForPeriod(
    array(state.attendance),
    { employeeId: record.employeeId, period: record.period, monthlyWage: number(record.basicSalary) },
    toOvertimeRules(object(attendanceSettings.overtime)),
    { restDays: restDays.length ? restDays : DEFAULT_REST_DAYS, holidays },
  );

  return { ...record, overtime: summary.amount, overtimeBreakdown: summary };
}

/**
 * What the year has already paid this person, for PCB's projection.
 *
 * Only closed and paid periods count, the same rule the EA statement uses: a
 * draft is a working figure that can still change, and PCB credited against a
 * month that was never remitted would under-deduct for the rest of the year.
 */
function payrollYearToDate(list: any[], employeeId: string, period: string, excludeId: string) {
  const year = clean(period).slice(0, 4);
  const prior = list.filter((item: any) =>
    item.employeeId === employeeId
    && item.id !== excludeId
    && clean(item.period).startsWith(year)
    && clean(item.period) < clean(period)
    && ["Closed", "Paid"].includes(clean(item.status)));

  const total = (key: string) => prior.reduce((sum: number, item: any) => sum + number(item[key]), 0);
  return {
    yearToDateGross: total("grossPay"),
    yearToDateEpf: total("epfEmployee"),
    yearToDateSocso: total("socsoEmployee") + total("eisEmployee"),
    yearToDatePcb: total("pcb"),
  };
}

/**
 * A payroll line, computed in the order the amounts depend on each other.
 *
 * Overtime first, because it is part of gross and every statutory figure is
 * taken on gross — pricing it afterwards would compute EPF and PCB against a
 * salary that was about to change. The totals are re-derived in between so a
 * manually-entered statutory line still adds up once overtime moves.
 */
async function withComputedPayroll(record: any, state: Record<string, any>, sql: any) {
  const priced = withComputedOvertime(record, state);
  const rebased = { ...priced, ...payrollRecord(priced, priced) };
  return withComputedStatutory(rebased, state, sql);
}

/**
 * Fills in the statutory half of a payroll line.
 *
 * Manual mode is left completely alone — somebody who has a figure from their
 * accountant or is handling a case this engine does not cover must be able to
 * key it in and have it stay keyed in.
 *
 * The employee lookup is a plain read, which matters: this runs inside a
 * mutation that re-runs whole on a write conflict, so everything it does has to
 * be safe to repeat.
 */
async function withComputedStatutory(record: any, state: Record<string, any>, sql: any) {
  if (clean(record.statutoryMode) === "manual") return { ...record, statutoryWarnings: [] };
  if (!record.employeeId || !record.period) return { ...record, statutoryWarnings: [] };

  const stored = array(state.settings?.statutoryProfiles).map(toStatutoryProfile);
  const profile = profileForPeriod(stored.length ? stored : [SEEDED_PROFILE], record.period) ?? SEEDED_PROFILE;

  const rows = await sql`select * from users where id = ${record.employeeId} and organization_id = ${ORGANIZATION_ID} limit 1`;
  if (!rows.length) return { ...record, statutoryWarnings: ["Employee record was not found, so the deductions were left as entered."] };
  const employee = mapEmployee(rows[0]);

  const computed = computePayroll({
    basicSalary: record.basicSalary,
    allowances: record.allowances,
    overtime: record.overtime,
    bonus: record.bonus,
    otherDeductions: record.otherDeductions,
    period: record.period,
    ...payrollYearToDate(array(state.payroll), record.employeeId, record.period, clean(record.id)),
  }, profile, {
    age: ageAtPeriod(employee.dateOfBirth, record.period),
    citizen: employee.nationality !== "Foreign",
    taxResident: employee.taxResident,
    maritalStatus: employee.maritalStatus,
    spouseWorking: employee.spouseWorking,
    childRelief: employee.childRelief,
    epfApplicable: employee.epfApplicable,
    socsoApplicable: employee.socsoApplicable,
    eisApplicable: employee.eisApplicable,
  });

  return {
    ...record,
    grossPay: computed.grossPay,
    epfEmployee: computed.epfEmployee, epfEmployer: computed.epfEmployer,
    socsoEmployee: computed.socsoEmployee, socsoEmployer: computed.socsoEmployer,
    eisEmployee: computed.eisEmployee, eisEmployer: computed.eisEmployer,
    pcb: computed.pcb,
    totalDeductions: computed.totalDeductions,
    netPay: computed.netPay,
    statutoryMode: "auto",
    statutoryProfileId: profile.id,
    statutoryComputedAt: new Date().toISOString(),
    statutoryWarnings: computed.warnings,
  };
}

export async function GET() {
  try {
    const session = await requireHRSession();
    return NextResponse.json(await snapshot(session), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof HRAuthError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load HR data." }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireHRSession();
    const body = object(await request.json());
    const operation = clean(body.operation);
    const resource = clean(body.resource);
    const id = clean(body.id);
    const data = object(body.data);
    const action = clean(body.action);
    const sql = getDatabase();

    if (resource === "employees") {
      if (operation === "set_access") {
        requireRole(session, ["hr_admin"]);
        const rows = await sql`select * from users where id = ${id} and organization_id = ${ORGANIZATION_ID} limit 1`;
        if (!rows.length) throw new Error("Employee was not found.");
        const role = ["hr_admin", "manager", "employee", "finance"].includes(clean(data.role)) ? clean(data.role) : "employee";
        const credential = createPinCredential(clean(data.pin));
        const metadata = object(rows[0].metadata);
        const auth = { ...object(metadata.auth), ...credential, role, configuredAt: object(metadata.auth).configuredAt || new Date().toISOString(), resetAt: new Date().toISOString() };
        const email = clean(data.email) || rows[0].email;
        await sql`update users set email = ${email}, metadata = ${JSON.stringify({ ...metadata, emailPlaceholder: false, auth })}::jsonb where id = ${id} and organization_id = ${ORGANIZATION_ID}`;
        await audit("hr.employee.access_configured", "employee", id, { role, email }, session.userId);
        return NextResponse.json(await snapshot(session));
      }

      /*
       * Completing one onboarding step, as its own operation.
       *
       * It cannot go through `update`: an employee is not allowed to write the
       * whole record, and routing an acknowledgement through a general edit
       * would mean deciding on every save whether a checklist arriving from the
       * browser was a legitimate change or a stale copy overwriting somebody
       * else's tick. This takes a step id and a flag, and the server owns the
       * rest.
       */
      if (operation === "onboarding") {
        const rows = await sql`select * from users where id = ${id} and organization_id = ${ORGANIZATION_ID} limit 1`;
        if (!rows.length) throw new Error("Employee was not found.");
        const metadata = object(rows[0].metadata);
        const steps = normaliseOnboarding(metadata.onboarding);
        const step = steps.find((item) => item.id === clean(data.stepId));
        if (!step) throw new Error("Onboarding step was not found.");

        const allowed = canCompleteStep(step, {
          isOwnRecord: id === session.userId,
          isManager: ["hr_admin", "manager"].includes(session.role),
        });
        if (!allowed) {
          throw new HRAuthError(step.kind === "profile"
            ? "This step completes itself once the details are on file."
            : "You cannot complete this onboarding step.", 403);
        }

        const done = data.done !== false;
        const next = steps.map((item) => item.id === step.id ? {
          ...item,
          done,
          completedAt: done ? new Date().toISOString() : undefined,
          completedBy: done ? session.userId : undefined,
        } : item);

        await sql`update users set metadata = ${JSON.stringify({ ...metadata, onboarding: next })}::jsonb where id = ${id} and organization_id = ${ORGANIZATION_ID}`;
        // Policy acknowledgements are the reason this is audited: the tick is
        // the only record that somebody read what they were asked to read.
        await audit(step.kind === "policy" ? "hr.employee.policy_acknowledged" : "hr.employee.onboarding_step", "employee", id, { stepId: step.id, label: step.label, done }, session.userId);
        return NextResponse.json(await snapshot(session));
      }

      if (operation === "create") {
        requireRole(session, ["hr_admin"]);
        const employeeId = clean(data.id) || randomUUID();
        const name = clean(data.name);
        if (!name) throw new Error("Employee name is required.");
        const suppliedEmail = clean(data.email);
        const email = suppliedEmail || `${slug(name)}.${employeeId.slice(0, 5)}@team.kretivco.local`;
        const role = ["hr_admin", "manager", "employee", "finance"].includes(clean(data.role)) ? clean(data.role) : "employee";
        const metadata = {
          emailPlaceholder: !suppliedEmail, title: clean(data.title), department: clean(data.department) || "Leadership",
          employmentType: clean(data.employmentType) || "Core Team", workMode: clean(data.workMode) || "Hybrid",
          location: clean(data.location), startDate: clean(data.startDate), phone: clean(data.phone), emergencyContact: clean(data.emergencyContact),
          identificationNumber: clean(data.identificationNumber), incomeTaxNumber: clean(data.incomeTaxNumber),
          epfNumber: clean(data.epfNumber), socsoNumber: clean(data.socsoNumber), endDate: clean(data.endDate),
          ...payrollProfileMetadata(data),
          ...compensationMetadata(data, {}, session.userId),
          annualLeaveBalance: number(data.annualLeaveBalance || 14), medicalLeaveBalance: number(data.medicalLeaveBalance || 14),
          carryForwardLeaveBalance: number(data.carryForwardLeaveBalance),
          skills: array(data.skills).map(clean).filter(Boolean), notes: clean(data.notes), managerId: clean(data.managerId),
          probationEndDate: clean(data.probationEndDate), confirmationDate: clean(data.confirmationDate),
          onboarding: normaliseOnboarding(data.onboarding), auth: { role },
        };
        const rows = await sql`insert into users (id, organization_id, email, display_name, status, metadata) values (${employeeId}, ${ORGANIZATION_ID}, ${email}, ${name}, ${clean(data.status) || "active"}, ${JSON.stringify(metadata)}::jsonb) returning *`;
        await audit("hr.employee.created", "employee", employeeId, mapEmployee(rows[0]), session.userId);
        await notify("New team member added", `${name} has been added to the HRMS employee directory.`, "employee", employeeId);
      } else if (operation === "update") {
        const selfEdit = id === session.userId && session.role === "employee";
        const managerEdit = session.role === "manager" && id !== session.userId;
        if (!selfEdit && !managerEdit) requireRole(session, ["hr_admin"]);
        const existing = await sql`select * from users where id = ${id} and organization_id = ${ORGANIZATION_ID}`;
        if (!existing.length) throw new Error("Employee was not found.");
        const current = mapEmployee(existing[0]);
        const previousMetadata = object(existing[0].metadata);
        const currentAuth = object(previousMetadata.auth);
        const requestedRole = ["hr_admin", "manager", "employee", "finance"].includes(clean(data.role)) ? clean(data.role) : roleFromMetadata(previousMetadata);
        /*
         * A joiner can now fill in their own record, which is the point of
         * asking them to. The allowed set is facts about themselves — how to
         * reach them, their NRIC and date of birth, their bank account, their
         * reliefs. It stops short of the determinations: tax residency and
         * whether EPF, SOCSO and EIS apply are HR's judgement, not a field the
         * person affected by them should be able to change.
         *
         * A bank account is in reach of the person paid into it, which is the
         * arrangement every payroll system lands on. `hr.employee.self_updated`
         * records who changed what, so a redirected salary leaves a trail.
         */
        const metadata = selfEdit ? {
          ...previousMetadata,
          ...Object.fromEntries(SELF_EDITABLE_FIELDS
            .filter((field) => field in data)
            .map((field) => [field, field === "spouseWorking" ? bool(data[field])
              : field === "childRelief" ? Math.max(0, Math.floor(number(data[field])))
                : clean(data[field])])),
        } : managerEdit ? {
          ...previousMetadata,
          onboarding: normaliseOnboarding(array(data.onboarding).length ? data.onboarding : current.onboarding),
          probationEndDate: clean(data.probationEndDate ?? current.probationEndDate),
          confirmationDate: clean(data.confirmationDate ?? current.confirmationDate),
        } : {
          ...previousMetadata, emailPlaceholder: clean(data.email) ? false : bool(previousMetadata.emailPlaceholder),
          title: clean(data.title), department: clean(data.department), employmentType: clean(data.employmentType), workMode: clean(data.workMode),
          location: clean(data.location), startDate: clean(data.startDate), phone: clean(data.phone), emergencyContact: clean(data.emergencyContact),
          identificationNumber: clean(data.identificationNumber), incomeTaxNumber: clean(data.incomeTaxNumber),
          epfNumber: clean(data.epfNumber), socsoNumber: clean(data.socsoNumber), endDate: clean(data.endDate),
          ...payrollProfileMetadata(data),
          ...compensationMetadata(data, previousMetadata, session.userId),
          annualLeaveBalance: number(data.annualLeaveBalance), medicalLeaveBalance: number(data.medicalLeaveBalance),
          carryForwardLeaveBalance: number(data.carryForwardLeaveBalance),
          skills: array(data.skills).map(clean).filter(Boolean), notes: clean(data.notes), managerId: clean(data.managerId),
          probationEndDate: clean(data.probationEndDate), confirmationDate: clean(data.confirmationDate),
          onboarding: normaliseOnboarding(array(data.onboarding).length ? data.onboarding : current.onboarding),
          auth: { ...currentAuth, role: requestedRole },
        };
        const limitedEdit = selfEdit || managerEdit;
        const name = limitedEdit ? current.name : clean(data.name) || current.name;
        const email = limitedEdit ? existing[0].email : clean(data.email) || existing[0].email;
        const status = limitedEdit ? current.status : clean(data.status) || current.status;
        const rows = await sql`update users set display_name = ${name}, email = ${email}, status = ${status}, metadata = ${JSON.stringify(metadata)}::jsonb where id = ${id} and organization_id = ${ORGANIZATION_ID} returning *`;
        await audit(selfEdit ? "hr.employee.self_updated" : managerEdit ? "hr.employee.manager_updated" : "hr.employee.updated", "employee", id, mapEmployee(rows[0]), session.userId);
      } else if (operation === "delete") {
        requireRole(session, ["hr_admin"]);
        if (id === session.userId) throw new HRAuthError("You cannot delete your active administrator account.", 400);
        await sql`delete from users where id = ${id} and organization_id = ${ORGANIZATION_ID}`;
        await mutateWorkspaceState(operationsStore, () => ({ ...defaultOperations }), (next) => {
          for (const key of ["leaveRequests", "attendance", "attendanceCorrections", "goals", "learning", "claims", "payroll", "lifecycle", "shifts"]) next[key] = array(next[key]).filter((item: any) => item.employeeId !== id);
          next.paymentVouchers = array(next.paymentVouchers).map((item: any) => item.employeeId === id ? { ...item, employeeId: "" } : item);
          next.documents = array(next.documents).map((item: any) => item.employeeId === id ? { ...item, employeeId: "" } : item);
        });
        await audit("hr.employee.deleted", "employee", id, undefined, session.userId);
      } else throw new Error("Unsupported employee operation.");
      return NextResponse.json(await snapshot(session));
    }

    const defer = deferredEffects();
    // Posting is a side effect, and the mutation below can re-run on a write
    // conflict. What to post is recorded here and acted on after the state has
    // actually committed, the same way notifications and audits are deferred.
    let payrollToPost: { record: any; action: string } | null = null;
    // Re-run against fresh state if anyone commits first. Everything inside is
    // side-effect free: notifications and audits are queued, and the read-only
    // `select users` lookups are safe to repeat.
    await mutateWorkspaceState(operationsStore, () => ({ ...defaultOperations }), async (raw) => {
      defer.reset();
      // `state` must BE the stored object, not a copy: the branches below rebind
      // whole collections (`state.leaveRequests = [...]`) rather than mutating
      // them, so a copy would take the writes and the committed blob would not.
      const state = Object.assign(raw, withDefaults(raw));

      if (resource === "settings") {
        requireRole(session, ["hr_admin"]);
        if (operation !== "update") throw new Error("Unsupported HR settings operation.");
        const uniqueList = (value: unknown, fallback: string[]) => {
          const values = array(value).map(clean).filter(Boolean).slice(0, 50);
          return values.length ? Array.from(new Set(values)) : fallback;
        };
        const attendance = object(data.attendance);
        const leavePolicy = object(data.leavePolicy);
        state.settings = {
          ...object(state.settings),
          departments: uniqueList(data.departments, defaultOperations.settings.departments),
          leaveTypes: toLeaveRules(array(data.leaveTypes).length ? data.leaveTypes : defaultOperations.settings.leaveTypes),
          workModes: uniqueList(data.workModes, defaultOperations.settings.workModes),
          attendance: {
            timezone: clean(attendance.timezone) || "Asia/Kuala_Lumpur",
            shiftStart: /^\d{2}:\d{2}$/.test(clean(attendance.shiftStart)) ? clean(attendance.shiftStart) : "09:00",
            shiftEnd: /^\d{2}:\d{2}$/.test(clean(attendance.shiftEnd)) ? clean(attendance.shiftEnd) : "18:00",
            graceMinutes: Math.max(0, Math.min(180, number(attendance.graceMinutes))),
            overtimeAfterMinutes: Math.max(60, Math.min(1440, number(attendance.overtimeAfterMinutes || 540))),
            state: clean(attendance.state) || "Selangor",
            // An empty list would make every day a working day, so the default
            // stands in rather than being saved as "no rest days at all".
            restDays: (() => {
              const days = Array.from(new Set(array(attendance.restDays).map(number).filter((day) => day >= 0 && day <= 6)));
              return days.length ? days : DEFAULT_REST_DAYS;
            })(),
            overtime: toOvertimeRules(object(attendance.overtime)),
          },
          leavePolicy: {
            annualAccrual: ["annual", "monthly"].includes(clean(leavePolicy.annualAccrual)) ? clean(leavePolicy.annualAccrual) : "annual",
            carryForwardDays: Math.max(0, Math.min(30, number(leavePolicy.carryForwardDays))),
            carryForwardExpiryMonth: Math.max(1, Math.min(12, number(leavePolicy.carryForwardExpiryMonth || 3))),
            prorateNewJoiner: bool(leavePolicy.prorateNewJoiner),
          },
          publicHolidays: array(data.publicHolidays).map((item: any) => ({ date: clean(item.date), name: clean(item.name) })).filter((item: any) => item.date && item.name).slice(0, 100),
          /*
           * Normalised on the way in rather than trusted. `toStatutoryProfile`
           * coerces every rate against a default and upgrades the older flat
           * shape, so a partial edit cannot leave a NaN somewhere a
           * contribution is later computed from.
           */
          statutoryProfiles: array(data.statutoryProfiles)
            .map((item: any) => toStatutoryProfile({ ...object(item), id: clean(item?.id) || randomUUID() }))
            .filter((item) => item.name && item.effectiveFrom)
            .slice(0, 20),
        };
        defer.audit("hr.settings.updated", "hr_settings", ORGANIZATION_ID, state.settings, session.userId);
        return NextResponse.json(await snapshot(session));
      }

      const keyMap: Record<string, string> = {
        leave: "leaveRequests", attendance: "attendance", attendance_corrections: "attendanceCorrections",
        goals: "goals", learning: "learning", documents: "documents", claims: "claims", payroll: "payroll", lifecycle: "lifecycle",
        announcements: "announcements", events: "events", shifts: "shifts", payment_vouchers: "paymentVouchers",
      };
      const key = keyMap[resource];
      if (!key) throw new Error("Unsupported HR resource.");
      const list = array(state[key]);
      const existing = list.find((item: any) => item.id === id);
      const managers = ["hr_admin", "manager"].includes(session.role);
      const payrollUsers = ["hr_admin", "finance"].includes(session.role);

      if (operation === "create") {
        if (["documents", "attendance"].includes(resource)) requireRole(session, ["hr_admin"]);
        if (["goals", "learning", "lifecycle"].includes(resource)) requireRole(session, ["hr_admin", "manager"]);
        if (["announcements", "events"].includes(resource)) requireRole(session, ["hr_admin", "manager"]);
        if (resource === "shifts") requireRole(session, ["hr_admin", "manager"]);
        if (resource === "payment_vouchers") requireRole(session, ["hr_admin", "finance"]);
        if (resource === "payroll") requireRole(session, ["hr_admin", "finance"]);
        const recordId = clean(data.id) || randomUUID();
        const employeeId = session.role === "employee" ? session.userId : clean(data.employeeId);
        let record: any = { ...data, employeeId, id: recordId, createdBy: session.userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        if (resource === "leave") {
          const type = clean(data.type) || "Annual Leave";
          const days = leaveDayCount(state, type, clean(data.startDate), clean(data.endDate), bool(data.halfDay));
          record = { ...record, type, startDate: clean(data.startDate), endDate: clean(data.endDate), days, halfDay: bool(data.halfDay), status: "Pending", reason: clean(data.reason), handoverTo: clean(data.handoverTo), attachmentId: clean(data.attachmentId), approverNote: "" };
          if (!employeeId || !record.startDate || !record.endDate || record.days <= 0) throw new Error("Employee and valid leave dates are required.");
          if (record.endDate < record.startDate) throw new Error("Leave end date cannot be before the start date.");
          if (record.halfDay && record.startDate !== record.endDate) throw new Error("Half-day leave must use the same start and end date.");
          Object.assign(record, await checkLeaveBalance(state, sql, { employeeId, type, days: record.days, startDate: record.startDate }) ?? {});
          defer.notify("New leave request", `${record.type} request requires review.`, "hr_leave", recordId);
        } else if (resource === "claims") {
          record = { ...record, claimDate: clean(data.claimDate), category: clean(data.category) || "General", amount: Math.max(0, number(data.amount)), description: clean(data.description), receiptAssetId: clean(data.receiptAssetId), status: "Pending", financeStatus: "Unpaid", approverNote: "" };
          if (!employeeId || !record.claimDate || record.amount <= 0 || !record.description) throw new Error("Claim date, amount and description are required.");
          defer.notify("New expense claim", `${record.category} claim requires review.`, "hr_claim", recordId);
        } else if (resource === "payroll") {
          record = { ...record, ...payrollRecord(data), status: "Draft", paidAt: null };
          if (!record.employeeId || !record.period) throw new Error("Employee and payroll period are required.");
          if (list.some((item: any) => item.employeeId === record.employeeId && item.period === record.period)) throw new Error("A payroll record already exists for this employee and period.");
          record = await withComputedPayroll(record, state, sql);
          defer.notify("Payroll draft created", `Payroll for ${record.period} is being prepared.`, "hr_payroll", recordId, employeeId);
        } else if (resource === "lifecycle") {
          record = { ...record, type: clean(data.type) || "Onboarding", title: clean(data.title), dueDate: clean(data.dueDate), status: clean(data.status) || "Open", notes: clean(data.notes), tasks: array(data.tasks).map((task: any) => ({ id: clean(task.id) || randomUUID(), label: clean(task.label), done: bool(task.done) })).filter((task: any) => task.label) };
          if (!employeeId || !record.title) throw new Error("Employee and lifecycle title are required.");
          defer.notify("Employee lifecycle update", `${record.title} has been added with a due date of ${record.dueDate || "not set"}.`, "hr_lifecycle", recordId, employeeId);
        } else if (resource === "attendance_corrections") {
          record = { ...record, attendanceId: clean(data.attendanceId), date: clean(data.date), requestedCheckIn: clean(data.requestedCheckIn), requestedCheckOut: clean(data.requestedCheckOut), reason: clean(data.reason), status: "Pending", reviewerNote: "" };
          if (!employeeId || !record.date || !record.reason) throw new Error("Attendance date and correction reason are required.");
          defer.notify("Attendance correction requested", `A correction for ${record.date} requires review.`, "hr_attendance_correction", recordId);
        } else if (resource === "documents") {
          record = { ...record, title: clean(data.title), category: clean(data.category) || "Policy", reference: clean(data.reference), expiryDate: clean(data.expiryDate), status: clean(data.status) || "Active", notes: clean(data.notes) };
          if (!record.title) throw new Error("Document title is required.");
        } else if (resource === "announcements") {
          const status = ["Draft", "Published", "Archived"].includes(clean(data.status)) ? clean(data.status) : "Draft";
          record = {
            ...record,
            employeeId: "",
            title: clean(data.title),
            body: clean(data.body),
            category: clean(data.category) || "General",
            status,
            publishAt: clean(data.publishAt),
            expiresAt: clean(data.expiresAt),
            pinned: bool(data.pinned),
          };
          if (!record.title || !record.body) throw new Error("Announcement title and content are required.");
          if (record.expiresAt && record.publishAt && record.expiresAt < record.publishAt) throw new Error("Announcement expiry cannot be before its publish date.");
          if (status === "Published") defer.notify("New HR announcement", record.title, "hr_announcement", recordId, "*");
        } else if (resource === "events") {
          const status = ["Scheduled", "Cancelled"].includes(clean(data.status)) ? clean(data.status) : "Scheduled";
          record = {
            ...record,
            employeeId: "",
            title: clean(data.title),
            eventType: clean(data.eventType) || "Team event",
            startDate: clean(data.startDate),
            endDate: clean(data.endDate) || clean(data.startDate),
            location: clean(data.location),
            description: clean(data.description),
            status,
          };
          if (!record.title || !record.startDate) throw new Error("Event title and start date are required.");
          if (record.endDate < record.startDate) throw new Error("Event end date cannot be before its start date.");
          if (status === "Scheduled") defer.notify("New team calendar event", `${record.title} · ${record.startDate}`, "hr_event", recordId, "*");
        } else if (resource === "shifts") {
          const daysOfWeek = array(data.daysOfWeek).map(number).filter((day) => day >= 0 && day <= 6);
          record = { ...record, label: clean(data.label) || "Standard shift", startDate: clean(data.startDate), endDate: clean(data.endDate) || clean(data.startDate), startTime: clean(data.startTime) || clean(state.settings?.attendance?.shiftStart) || "09:00", endTime: clean(data.endTime) || clean(state.settings?.attendance?.shiftEnd) || "18:00", daysOfWeek: daysOfWeek.length ? daysOfWeek : [1, 2, 3, 4, 5], status: clean(data.status) === "Off" ? "Off" : "Scheduled", notes: clean(data.notes) };
          if (!employeeId || !record.startDate || !record.endDate || record.endDate < record.startDate) throw new Error("Employee and a valid shift date range are required.");
          if (record.status === "Scheduled" && record.endTime <= record.startTime) throw new Error("Shift end time must be after its start time.");
          defer.notify("Shift schedule updated", `${record.label} · ${record.startDate} to ${record.endDate}`, "hr_shift", recordId, employeeId);
        } else if (resource === "payment_vouchers") {
          const year = (clean(data.paymentDate) || new Date().toISOString()).slice(0, 4);
          const sequence = list.filter((item: any) => clean(item.reference).startsWith(`PV-${year}-`)).reduce((max: number, item: any) => Math.max(max, number(clean(item.reference).split("-").pop())), 0) + 1;
          record = { ...record, employeeId: clean(data.employeeId), reference: `PV-${year}-${String(sequence).padStart(4, "0")}`, payee: clean(data.payee), amount: Math.max(0, number(data.amount)), details: clean(data.details), paymentDate: clean(data.paymentDate), linkedType: ["General", "Claim", "Payroll"].includes(clean(data.linkedType)) ? clean(data.linkedType) : "General", linkedId: clean(data.linkedId), status: "Draft", approvedAt: null, paidAt: null };
          if (!record.payee || record.amount <= 0 || !record.paymentDate) throw new Error("Payee, payment date and an amount greater than zero are required.");
        }
        state[key] = [record, ...list];
        defer.audit(`hr.${resource}.created`, `hr_${resource}`, recordId, record, session.userId);
      } else if (operation === "update") {
        if (!existing) throw new Error("HR record was not found.");
        const ownerEditable = owns(existing, session) && ["leave", "claims", "attendance_corrections"].includes(resource) && ["Pending", "Rejected"].includes(existing.status);
        const progressEditable = owns(existing, session) && ["goals", "learning"].includes(resource);
        if (resource === "payroll" && !payrollUsers) throw new HRAuthError("Only HR Admin or Finance can update payroll.", 403);
        if (resource === "documents") requireRole(session, ["hr_admin"]);
        if (resource === "attendance") requireRole(session, ["hr_admin"]);
        if (resource === "lifecycle" && !managers) throw new HRAuthError("Only HR Admin or Manager can update lifecycle records.", 403);
        if (["announcements", "events"].includes(resource) && !managers) throw new HRAuthError("Only HR Admin or Manager can update the Team Hub.", 403);
        if (resource === "shifts" && !managers) throw new HRAuthError("Only HR Admin or Manager can update shifts.", 403);
        if (resource === "payment_vouchers" && !payrollUsers) throw new HRAuthError("Only HR Admin or Finance can update payment vouchers.", 403);
        if (!["payroll", "documents", "attendance", "lifecycle", "announcements", "events", "shifts", "payment_vouchers"].includes(resource) && !managers && !ownerEditable && !progressEditable) throw new HRAuthError("You cannot update this HR record.", 403);
        const now = new Date().toISOString();
        let updated: any;
        if (resource === "payroll") updated = await withComputedPayroll({ ...payrollRecord(data, existing), id, status: existing.status, paidAt: existing.paidAt, updatedAt: now }, state, sql);
        else if (resource === "leave") {
          const type = clean(data.type) || existing.type;
          const days = leaveDayCount(state, type, clean(data.startDate), clean(data.endDate), bool(data.halfDay));
          if (!clean(data.startDate) || !clean(data.endDate) || clean(data.endDate) < clean(data.startDate) || days <= 0) throw new Error("Valid leave dates are required.");
          if (bool(data.halfDay) && clean(data.startDate) !== clean(data.endDate)) throw new Error("Half-day leave must use the same start and end date.");
          updated = { ...existing, type, startDate: clean(data.startDate), endDate: clean(data.endDate), days, halfDay: bool(data.halfDay), reason: clean(data.reason), handoverTo: clean(data.handoverTo), attachmentId: clean(data.attachmentId), id, updatedAt: now };
        } else if (resource === "claims") updated = { ...existing, claimDate: clean(data.claimDate), category: clean(data.category) || existing.category, amount: Math.max(0, number(data.amount)), description: clean(data.description), receiptAssetId: clean(data.receiptAssetId), id, updatedAt: now };
        else if (resource === "attendance_corrections") updated = { ...existing, attendanceId: clean(data.attendanceId), date: clean(data.date), requestedCheckIn: clean(data.requestedCheckIn), requestedCheckOut: clean(data.requestedCheckOut), reason: clean(data.reason), id, updatedAt: now };
        else if (resource === "lifecycle") updated = { ...existing, type: clean(data.type) || existing.type, title: clean(data.title), dueDate: clean(data.dueDate), status: clean(data.status) || existing.status, notes: clean(data.notes), tasks: array(data.tasks).map((task: any) => ({ id: clean(task.id) || randomUUID(), label: clean(task.label), done: bool(task.done) })).filter((task: any) => task.label), id, updatedAt: now };
        else if (resource === "documents") updated = { ...existing, title: clean(data.title), category: clean(data.category) || existing.category, employeeId: clean(data.employeeId), reference: clean(data.reference), expiryDate: clean(data.expiryDate), status: clean(data.status) || existing.status, notes: clean(data.notes), assetId: clean(data.assetId), id, updatedAt: now };
        else if (resource === "announcements") {
          const status = ["Draft", "Published", "Archived"].includes(clean(data.status)) ? clean(data.status) : existing.status;
          updated = { ...existing, title: clean(data.title), body: clean(data.body), category: clean(data.category) || "General", status, publishAt: clean(data.publishAt), expiresAt: clean(data.expiresAt), pinned: bool(data.pinned), id, employeeId: "", updatedAt: now };
          if (!updated.title || !updated.body) throw new Error("Announcement title and content are required.");
          if (updated.expiresAt && updated.publishAt && updated.expiresAt < updated.publishAt) throw new Error("Announcement expiry cannot be before its publish date.");
          if (status === "Published" && existing.status !== "Published") defer.notify("New HR announcement", updated.title, "hr_announcement", id, "*");
        } else if (resource === "events") {
          const status = ["Scheduled", "Cancelled"].includes(clean(data.status)) ? clean(data.status) : existing.status;
          updated = { ...existing, title: clean(data.title), eventType: clean(data.eventType) || "Team event", startDate: clean(data.startDate), endDate: clean(data.endDate) || clean(data.startDate), location: clean(data.location), description: clean(data.description), status, id, employeeId: "", updatedAt: now };
          if (!updated.title || !updated.startDate) throw new Error("Event title and start date are required.");
          if (updated.endDate < updated.startDate) throw new Error("Event end date cannot be before its start date.");
          if (status === "Scheduled" && existing.status !== "Scheduled") defer.notify("New team calendar event", `${updated.title} · ${updated.startDate}`, "hr_event", id, "*");
        } else if (resource === "shifts") {
          const daysOfWeek = array(data.daysOfWeek).map(number).filter((day) => day >= 0 && day <= 6);
          updated = { ...existing, employeeId: clean(data.employeeId) || existing.employeeId, label: clean(data.label) || "Standard shift", startDate: clean(data.startDate), endDate: clean(data.endDate) || clean(data.startDate), startTime: clean(data.startTime), endTime: clean(data.endTime), daysOfWeek: daysOfWeek.length ? daysOfWeek : [1, 2, 3, 4, 5], status: clean(data.status) === "Off" ? "Off" : "Scheduled", notes: clean(data.notes), id, updatedAt: now };
          if (!updated.startDate || updated.endDate < updated.startDate || (updated.status === "Scheduled" && updated.endTime <= updated.startTime)) throw new Error("A valid shift date and time range are required.");
        } else if (resource === "payment_vouchers") {
          if (existing.status !== "Draft") throw new Error("Only draft payment vouchers can be edited.");
          updated = { ...existing, employeeId: clean(data.employeeId), payee: clean(data.payee), amount: Math.max(0, number(data.amount)), details: clean(data.details), paymentDate: clean(data.paymentDate), linkedType: ["General", "Claim", "Payroll"].includes(clean(data.linkedType)) ? clean(data.linkedType) : "General", linkedId: clean(data.linkedId), id, updatedAt: now };
          if (!updated.payee || updated.amount <= 0 || !updated.paymentDate) throw new Error("Payee, payment date and an amount greater than zero are required.");
        }
        else updated = { ...existing, ...data, id, employeeId: existing.employeeId, updatedAt: now };
        if (resource === "leave") {
          Object.assign(updated, await checkLeaveBalance(state, sql, { employeeId: existing.employeeId, type: updated.type, days: updated.days, startDate: updated.startDate, excludeId: id }) ?? {});
        }
        state[key] = list.map((item: any) => item.id === id ? updated : item);
        defer.audit(`hr.${resource}.updated`, `hr_${resource}`, id, updated, session.userId);
      } else if (operation === "delete") {
        if (!existing) throw new Error("HR record was not found.");
        const ownerDraft = owns(existing, session) && ["leave", "claims", "attendance_corrections"].includes(resource) && ["Pending", "Rejected"].includes(existing.status);
        const managerOwnedResource = session.role === "manager" && ["goals", "learning", "lifecycle", "announcements", "events", "shifts"].includes(resource);
        const financeDraft = session.role === "finance" && resource === "payment_vouchers" && existing.status === "Draft";
        if (resource === "payment_vouchers" && existing.status !== "Draft") throw new Error("Only draft payment vouchers can be deleted.");
        if (session.role !== "hr_admin" && !ownerDraft && !managerOwnedResource && !financeDraft) throw new HRAuthError("You cannot delete this HR record.", 403);
        state[key] = list.filter((item: any) => item.id !== id);
        defer.audit(`hr.${resource}.deleted`, `hr_${resource}`, id, undefined, session.userId);
      } else if (operation === "action" && resource === "leave") {
        if (!existing) throw new Error("Leave request was not found.");
        if (action === "cancel") {
          if (!owns(existing, session) && session.role !== "hr_admin") throw new HRAuthError("Only the requester or HR Admin can cancel leave.", 403);
        } else requireRole(session, ["hr_admin", "manager"]);
        if (!["approve", "reject", "cancel"].includes(action)) throw new Error("Unsupported leave action.");
        if (["approve", "reject"].includes(action) && existing.status !== "Pending") throw new Error("Only pending leave can be approved or rejected.");
        if (action === "cancel" && !["Pending", "Approved"].includes(existing.status)) throw new Error("Only pending or approved leave can be cancelled.");
        const status = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Cancelled";
        const updated = { ...existing, status, approverId: session.userId, approverNote: clean(data.approverNote), updatedAt: new Date().toISOString() };
        state.leaveRequests = list.map((item: any) => item.id === id ? updated : item);
        if (action === "approve") {
          const generated = leaveDates(state, existing.startDate, existing.endDate).map((date) => ({ id: `leave-${id}-${date}`, employeeId: existing.employeeId, date, status: "Leave", checkIn: "", checkOut: "", note: `${existing.type}${existing.halfDay ? " (half day)" : ""} · generated from approved leave`, sourceId: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
          const generatedIds = new Set(generated.map((item) => item.id));
          state.attendance = [...generated, ...array(state.attendance).filter((item: any) => !generatedIds.has(item.id))];
        } else state.attendance = array(state.attendance).filter((item: any) => item.sourceId !== id);
        defer.audit(`hr.leave.${action}d`, "hr_leave", id, updated, session.userId);
        defer.notify(`Leave ${status.toLowerCase()}`, `${existing.type} request is now ${status.toLowerCase()}.`, "hr_leave", id, existing.employeeId);
      } else if (operation === "action" && resource === "claims") {
        if (!existing) throw new Error("Claim was not found.");
        if (["approve", "reject"].includes(action)) requireRole(session, ["hr_admin", "manager"]);
        if (action === "mark_paid") requireRole(session, ["hr_admin", "finance"]);
        if (!["approve", "reject", "mark_paid"].includes(action)) throw new Error("Unsupported claim action.");
        if (["approve", "reject"].includes(action) && existing.status !== "Pending") throw new Error("Only pending claims can be approved or rejected.");
        if (action === "mark_paid" && (existing.status !== "Approved" || existing.financeStatus === "Paid")) throw new Error("Only an approved unpaid claim can be marked paid.");
        const updated = { ...existing, status: action === "approve" ? "Approved" : action === "reject" ? "Rejected" : existing.status, financeStatus: action === "mark_paid" ? "Paid" : existing.financeStatus, approverId: ["approve", "reject"].includes(action) ? session.userId : existing.approverId, paidAt: action === "mark_paid" ? new Date().toISOString() : existing.paidAt, approverNote: clean(data.approverNote || existing.approverNote), updatedAt: new Date().toISOString() };
        state.claims = list.map((item: any) => item.id === id ? updated : item);
        defer.audit(`hr.claim.${action}`, "hr_claim", id, updated, session.userId);
        defer.notify(action === "mark_paid" ? "Claim paid" : `Claim ${updated.status.toLowerCase()}`, `${existing.category} claim is now ${action === "mark_paid" ? "paid" : updated.status.toLowerCase()}.`, "hr_claim", id, existing.employeeId);
      } else if (operation === "action" && resource === "attendance") {
        /*
         * Approving the overtime on an attendance record.
         *
         * Clock-out computes minutes from the clock alone, so it cannot tell
         * the evening somebody stayed to finish their own work from the evening
         * they were asked to. Without this the timesheet would be an
         * instruction to pay rather than a record of hours.
         *
         * Reviewing does not touch the times themselves: the photo, the
         * location and the timestamps stay exactly as captured, and only
         * whether those hours are payable changes. An attendance correction is
         * still the way to change what the clock says.
         */
        requireRole(session, ["hr_admin", "manager"]);
        if (!existing) throw new Error("Attendance record was not found.");
        if (!["approve_overtime", "reject_overtime"].includes(action)) throw new Error("Unsupported attendance action.");
        if (number(existing.overtimeMinutes) <= 0) throw new Error("This record has no overtime to review.");

        const approved = action === "approve_overtime";
        const updated = {
          ...existing,
          overtimeStatus: approved ? "Approved" : "Rejected",
          overtimeReviewedBy: session.userId,
          overtimeReviewedAt: new Date().toISOString(),
          overtimeReviewNote: clean(data.reviewerNote),
          updatedAt: new Date().toISOString(),
        };
        state.attendance = list.map((item: any) => item.id === id ? updated : item);
        defer.audit(`hr.attendance.overtime_${approved ? "approved" : "rejected"}`, "hr_attendance", id, updated, session.userId);
        defer.notify(`Overtime ${approved ? "approved" : "rejected"}`, `${Math.round(number(existing.overtimeMinutes) / 60 * 10) / 10}h on ${existing.date} is now ${approved ? "approved for payment" : "rejected"}.`, "hr_attendance", id, existing.employeeId);
      } else if (operation === "action" && resource === "attendance_corrections") {
        requireRole(session, ["hr_admin", "manager"]);
        if (!existing) throw new Error("Attendance correction was not found.");
        if (!["approve", "reject"].includes(action)) throw new Error("Unsupported correction action.");
        if (existing.status !== "Pending") throw new Error("Only pending correction requests can be reviewed.");
        const updated = { ...existing, status: action === "approve" ? "Approved" : "Rejected", reviewerId: session.userId, reviewerNote: clean(data.reviewerNote), updatedAt: new Date().toISOString() };
        state.attendanceCorrections = list.map((item: any) => item.id === id ? updated : item);
        if (action === "approve") {
          state.attendance = array(state.attendance).map((item: any) => item.id === existing.attendanceId || (item.employeeId === existing.employeeId && item.date === existing.date) ? { ...item, checkIn: existing.requestedCheckIn || item.checkIn, checkOut: existing.requestedCheckOut || item.checkOut, correctionId: id, correctedBy: session.userId, correctedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item);
        }
        defer.audit(`hr.attendance_correction.${action}d`, "hr_attendance_correction", id, updated, session.userId);
        defer.notify(`Attendance correction ${updated.status.toLowerCase()}`, `Your correction request for ${existing.date} is now ${updated.status.toLowerCase()}.`, "hr_attendance_correction", id, existing.employeeId);
      } else if (operation === "action" && resource === "payroll") {
        requireRole(session, ["hr_admin", "finance"]);
        if (!existing) throw new Error("Payroll record was not found.");
        if (!["close", "reopen", "mark_paid"].includes(action)) throw new Error("Unsupported payroll action.");
        if (action === "close" && existing.status !== "Draft") throw new Error("Only draft payroll can be closed.");
        if (action === "close" && !clean(existing.verificationNote)) throw new Error("Add a statutory verification note before closing payroll.");
        if (action === "mark_paid" && existing.status !== "Closed") throw new Error("Only closed payroll can be marked paid.");
        if (action === "reopen" && !["Closed", "Paid"].includes(existing.status)) throw new Error("Only closed or paid payroll can be reopened.");
        const updated = { ...existing, status: action === "close" ? "Closed" : action === "reopen" ? "Draft" : "Paid", paidAt: action === "mark_paid" ? new Date().toISOString() : existing.paidAt, updatedAt: new Date().toISOString() };
        state.payroll = list.map((item: any) => item.id === id ? updated : item);
        payrollToPost = ["close", "mark_paid"].includes(action) ? { record: updated, action } : null;
        defer.audit(`hr.payroll.${action}`, "hr_payroll", id, updated, session.userId);
        defer.notify(action === "mark_paid" ? "Payroll marked paid" : `Payroll ${updated.status.toLowerCase()}`, `Payroll for ${existing.period} is now ${updated.status.toLowerCase()}.`, "hr_payroll", id, existing.employeeId);
      } else if (operation === "action" && resource === "payment_vouchers") {
        requireRole(session, ["hr_admin", "finance"]);
        if (!existing) throw new Error("Payment voucher was not found.");
        if (!["approve", "mark_paid", "cancel"].includes(action)) throw new Error("Unsupported payment voucher action.");
        if (action === "approve" && existing.status !== "Draft") throw new Error("Only draft vouchers can be approved.");
        if (action === "mark_paid" && existing.status !== "Approved") throw new Error("Only approved vouchers can be marked paid.");
        if (action === "cancel" && existing.status === "Paid") throw new Error("A paid voucher cannot be cancelled.");
        const status = action === "approve" ? "Approved" : action === "mark_paid" ? "Paid" : "Cancelled";
        const updated = { ...existing, status, approvedBy: action === "approve" ? session.userId : existing.approvedBy, approvedAt: action === "approve" ? new Date().toISOString() : existing.approvedAt, paidAt: action === "mark_paid" ? new Date().toISOString() : existing.paidAt, updatedAt: new Date().toISOString() };
        state.paymentVouchers = list.map((item: any) => item.id === id ? updated : item);
        defer.audit(`hr.payment_voucher.${action}`, "hr_payment_voucher", id, updated, session.userId);
      } else throw new Error("Unsupported HR operation.");
    });
    await defer.flush();
    const ledger = await recordPayrollOnLedger(payrollToPost, session.userId);

    return NextResponse.json({ ...(await snapshot(session)), ...(ledger ? { ledger } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "HR operation failed.";
    // A conflict means the write is still valid, just contended — 409 tells the
    // client to retry rather than reporting the request as malformed.
    const status = error instanceof HRAuthError ? error.status
      : error instanceof WorkspaceConflictError ? 409
        : message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

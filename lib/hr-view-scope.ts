/**
 * Narrows a snapshot to what a role would actually see.
 *
 * With sign-in switched off every visitor is handed `hr_admin`, so the API
 * returns the whole organisation and the "Viewing as" switcher only ever
 * changed which menus were drawn. Picking Employee therefore produced a
 * convincing-looking employee workspace showing everybody's payroll — the one
 * thing an employee must never see — which made the switcher worse than
 * useless for checking what you had built.
 *
 * This applies the same narrowing the server does in `scopedSnapshot`, on the
 * client, so the lens shows the truth.
 *
 * It is a *preview*, not a permission. The data has already been sent; anyone
 * who can open the workspace can read it out of the network tab regardless.
 * What makes the employee view genuinely private is `HRMS_AUTH_ENABLED`, where
 * the server narrows before sending and this function is never reached — with
 * auth on, the session's own role is the only thing consulted and the switcher
 * is hidden entirely.
 *
 * Pure, so the rules can be asserted against the server's own.
 */

export type ViewRole = "hr_admin" | "manager" | "employee" | "finance";

type Snapshot = Record<string, any>;

const array = (value: unknown) => Array.isArray(value) ? value : [];

const ISSUED_PAYSLIP_STATUSES = ["Closed", "Paid"];

/**
 * The fields that exist only so payroll can be run and paid.
 *
 * Mirrors the server's redaction: a manager reads the directory to approve
 * leave and run probation reviews, none of which needs a colleague's NRIC,
 * date of birth, salary or bank account.
 */
export function redactPersonalFinance<T extends Record<string, any>>(employee: T) {
  return {
    ...employee,
    identificationNumber: "", incomeTaxNumber: "", epfNumber: "", socsoNumber: "",
    dateOfBirth: "", maritalStatus: "", spouseWorking: false, childRelief: 0,
    bankName: "", bankAccountNumber: "",
    basicSalary: 0, allowances: 0, salaryEffectiveFrom: "", salaryHistory: [],
    redacted: true,
  };
}

/**
 * Applies a role's view to a snapshot the server sent unnarrowed.
 *
 * `hr_admin` is returned untouched, which is also the path taken whenever
 * authentication is on — the server has already decided, and narrowing a second
 * time on the client could only ever hide something it meant to send.
 */
export function scopeSnapshotForView(snapshot: Snapshot, role: ViewRole, userId: string): Snapshot {
  if (role === "hr_admin") return snapshot;

  const own = (key: string) => array(snapshot[key]).filter((item: any) => item.employeeId === userId);
  const ownOrCompanyWide = (key: string) => array(snapshot[key]).filter((item: any) => !item.employeeId || item.employeeId === userId);

  if (role === "finance") {
    return {
      ...snapshot,
      // Finance runs payroll, so it keeps everybody's pay and payment details
      // and none of the personal half of the record.
      employees: array(snapshot.employees).map((item: any) => item.id === userId ? item : ({
        id: item.id, name: item.name, title: item.title, department: item.department,
        status: item.status, workMode: item.workMode, employeeNumber: item.employeeNumber,
        basicSalary: item.basicSalary, allowances: item.allowances,
        bankName: item.bankName, bankAccountNumber: item.bankAccountNumber,
        identificationNumber: item.identificationNumber, incomeTaxNumber: item.incomeTaxNumber,
        epfNumber: item.epfNumber, socsoNumber: item.socsoNumber, dateOfBirth: item.dateOfBirth,
      })),
      leaveRequests: own("leaveRequests"),
      attendance: own("attendance"),
      attendanceCorrections: own("attendanceCorrections"),
      goals: own("goals"),
      learning: own("learning"),
      timesheets: own("timesheets"),
      documents: ownOrCompanyWide("documents"),
      lifecycle: own("lifecycle"),
      shifts: own("shifts"),
    };
  }

  if (role === "manager") {
    return {
      ...snapshot,
      employees: array(snapshot.employees).map((item: any) => item.id === userId ? item : redactPersonalFinance(item)),
      payroll: own("payroll"),
      paymentVouchers: [],
      documents: ownOrCompanyWide("documents"),
    };
  }

  return {
    ...snapshot,
    employees: array(snapshot.employees).filter((item: any) => item.id === userId),
    leaveRequests: own("leaveRequests"),
    attendance: own("attendance"),
    attendanceCorrections: own("attendanceCorrections"),
    goals: own("goals"),
    learning: own("learning"),
    timesheets: own("timesheets"),
    documents: ownOrCompanyWide("documents"),
    claims: own("claims"),
    // Issued payslips only — a draft is the workings, and the figures move.
    payroll: own("payroll").filter((item: any) => ISSUED_PAYSLIP_STATUSES.includes(String(item.status ?? "").trim())),
    paymentVouchers: [],
    shifts: own("shifts"),
    lifecycle: own("lifecycle"),
    settings: { ...(snapshot.settings ?? {}), statutoryProfiles: [] },
  };
}

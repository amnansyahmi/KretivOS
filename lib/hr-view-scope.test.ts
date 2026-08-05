import assert from "node:assert/strict";
import test from "node:test";
import { redactPersonalFinance, scopeSnapshotForView } from "./hr-view-scope.ts";

const ME = "e1";

const snapshot = {
  employees: [
    { id: "e1", name: "Amirul", basicSalary: 5000, identificationNumber: "900101-10-1111", bankAccountNumber: "1111" },
    { id: "e2", name: "Nurfadilah", basicSalary: 9000, identificationNumber: "950402-10-2222", bankAccountNumber: "2222" },
  ],
  payroll: [
    { id: "p1", employeeId: "e1", period: "2026-07", status: "Paid", netPay: 4300 },
    { id: "p2", employeeId: "e1", period: "2026-08", status: "Draft", netPay: 4400 },
    { id: "p3", employeeId: "e2", period: "2026-08", status: "Paid", netPay: 8000 },
  ],
  leaveRequests: [{ id: "l1", employeeId: "e1" }, { id: "l2", employeeId: "e2" }],
  claims: [{ id: "c1", employeeId: "e1" }, { id: "c2", employeeId: "e2" }],
  timesheets: [{ id: "t1", employeeId: "e1" }, { id: "t2", employeeId: "e2" }],
  attendance: [{ id: "a1", employeeId: "e1" }, { id: "a2", employeeId: "e2" }],
  documents: [{ id: "d1", employeeId: "" }, { id: "d2", employeeId: "e1" }, { id: "d3", employeeId: "e2" }],
  paymentVouchers: [{ id: "v1" }],
  settings: { statutoryProfiles: [{ id: "my-default" }], departments: ["Creative"] },
};

test("an admin sees the snapshot exactly as sent", () => {
  assert.equal(scopeSnapshotForView(snapshot, "hr_admin", ME), snapshot, "narrowing twice could only hide something meant to be sent");
});

test("an employee sees only their own records", () => {
  const view = scopeSnapshotForView(snapshot, "employee", ME);

  assert.deepEqual(view.employees.map((item: any) => item.id), ["e1"]);
  assert.deepEqual(view.leaveRequests.map((item: any) => item.id), ["l1"]);
  assert.deepEqual(view.claims.map((item: any) => item.id), ["c1"]);
  assert.deepEqual(view.timesheets.map((item: any) => item.id), ["t1"]);
  assert.deepEqual(view.attendance.map((item: any) => item.id), ["a1"]);
});

test("an employee's payroll is their own, and only once issued", () => {
  const view = scopeSnapshotForView(snapshot, "employee", ME);
  assert.deepEqual(view.payroll.map((item: any) => item.id), ["p1"], "not the draft, and not a colleague's");
});

test("an employee gets company documents plus their own, and no vouchers", () => {
  const view = scopeSnapshotForView(snapshot, "employee", ME);
  assert.deepEqual(view.documents.map((item: any) => item.id), ["d1", "d2"]);
  assert.deepEqual(view.paymentVouchers, []);
});

test("an employee is not shown the statutory rate tables", () => {
  const view = scopeSnapshotForView(snapshot, "employee", ME);
  assert.deepEqual(view.settings.statutoryProfiles, []);
  assert.deepEqual(view.settings.departments, ["Creative"], "the rest of settings survives");
});

test("a manager keeps the team but loses their salaries and identity numbers", () => {
  const view = scopeSnapshotForView(snapshot, "manager", ME);
  const colleague = view.employees.find((item: any) => item.id === "e2");

  assert.equal(view.employees.length, 2, "a manager still needs the directory");
  assert.equal(colleague.basicSalary, 0);
  assert.equal(colleague.identificationNumber, "");
  assert.equal(colleague.bankAccountNumber, "");
  assert.equal(colleague.redacted, true);
});

test("a manager keeps their own record intact", () => {
  const view = scopeSnapshotForView(snapshot, "manager", ME);
  const self = view.employees.find((item: any) => item.id === ME);
  assert.equal(self.basicSalary, 5000);
  assert.ok(!self.redacted);
});

test("a manager sees their own payroll and nobody else's", () => {
  const view = scopeSnapshotForView(snapshot, "manager", ME);
  assert.deepEqual(view.payroll.map((item: any) => item.id), ["p1", "p2"]);
});

test("a manager still sees the team's leave, because approving it is the job", () => {
  const view = scopeSnapshotForView(snapshot, "manager", ME);
  assert.equal(view.leaveRequests.length, 2);
});

test("finance keeps pay and payment details for everyone", () => {
  const view = scopeSnapshotForView(snapshot, "finance", ME);
  const colleague = view.employees.find((item: any) => item.id === "e2");

  assert.equal(colleague.basicSalary, 9000, "running payroll needs the salary");
  assert.equal(colleague.bankAccountNumber, "2222");
  assert.equal(view.payroll.length, 3, "and every payroll line");
});

test("finance does not get the personal half of a colleague's record", () => {
  const view = scopeSnapshotForView(snapshot, "finance", ME);
  const colleague = view.employees.find((item: any) => item.id === "e2");
  assert.equal(colleague.name, "Nurfadilah");
  assert.equal(colleague.maritalStatus, undefined);
  assert.equal(colleague.childRelief, undefined);
});

test("finance sees only their own leave and timesheets", () => {
  const view = scopeSnapshotForView(snapshot, "finance", ME);
  assert.deepEqual(view.leaveRequests.map((item: any) => item.id), ["l1"]);
  assert.deepEqual(view.timesheets.map((item: any) => item.id), ["t1"]);
});

test("redaction blanks the sensitive fields without dropping the person", () => {
  const redacted = redactPersonalFinance(snapshot.employees[1]);
  assert.equal(redacted.name, "Nurfadilah", "still identifiable");
  assert.equal(redacted.basicSalary, 0);
  assert.equal(redacted.identificationNumber, "");
});

test("a missing collection scopes to empty rather than throwing", () => {
  const view = scopeSnapshotForView({ employees: [] }, "employee", ME);
  assert.deepEqual(view.payroll, []);
  assert.deepEqual(view.timesheets, []);
});

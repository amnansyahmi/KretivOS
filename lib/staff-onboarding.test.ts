import assert from "node:assert/strict";
import test from "node:test";
import {
  canCompleteStep,
  defaultStaffOnboarding,
  normaliseOnboarding,
  onboardingSummary,
  profileGaps,
  resolveOnboarding,
  PERSONAL_FIELDS,
  STATUTORY_FIELDS,
} from "./staff-onboarding.ts";

const complete = {
  phone: "012-3456789",
  emergencyContact: "Siti · 019-8765432",
  location: "Subang Jaya",
  dateOfBirth: "1995-04-02",
  identificationNumber: "950402-10-5533",
  bankName: "Maybank",
  bankAccountNumber: "512345678901",
};

test("a new joiner starts with steps that know whose job they are", () => {
  const steps = defaultStaffOnboarding();
  assert.ok(steps.some((step) => step.owner === "employee"));
  assert.ok(steps.some((step) => step.owner === "hr"));
  assert.ok(steps.every((step) => step.id && step.label));
  assert.equal(new Set(steps.map((step) => step.id)).size, steps.length, "ids are unique within a checklist");
});

test("a details step is complete because the details are there, not because it was ticked", () => {
  const steps = resolveOnboarding(defaultStaffOnboarding(), complete);
  const statutory = steps.find((step) => step.id === "details-statutory");
  assert.equal(statutory?.done, true);
  assert.deepEqual(statutory?.missing, []);
});

test("a details step cannot be ticked while a field is blank", () => {
  // The stored step claims it is done; the data disagrees, and the data wins.
  const stored = defaultStaffOnboarding().map((step) => ({ ...step, done: true }));
  const steps = resolveOnboarding(stored, { ...complete, bankAccountNumber: "" });
  const statutory = steps.find((step) => step.id === "details-statutory");

  assert.equal(statutory?.done, false, "a stored tick does not survive a missing field");
  assert.deepEqual(statutory?.missing, ["Bank account number"]);
});

test("a step that was satisfied stops being satisfied if the field is cleared", () => {
  const before = resolveOnboarding(defaultStaffOnboarding(), complete);
  const after = resolveOnboarding(defaultStaffOnboarding(), { ...complete, phone: "" });
  assert.equal(before.find((step) => step.id === "details-personal")?.done, true);
  assert.equal(after.find((step) => step.id === "details-personal")?.done, false);
});

test("what is missing is named in the words used to ask for it", () => {
  assert.deepEqual(profileGaps({}, STATUTORY_FIELDS), [
    "Date of birth",
    "NRIC or passport number",
    "Bank",
    "Bank account number",
  ]);
  assert.deepEqual(profileGaps(complete, PERSONAL_FIELDS), []);
});

test("a policy acknowledgement is stored, because reading leaves no other trace", () => {
  const stored = defaultStaffOnboarding().map((step) =>
    step.id === "policy-handbook" ? { ...step, done: true, completedBy: "emp-1", completedAt: "2026-08-01T02:00:00.000Z" } : step);
  const steps = resolveOnboarding(stored, complete);
  const policy = steps.find((step) => step.id === "policy-handbook");

  assert.equal(policy?.done, true);
  assert.equal(policy?.completedBy, "emp-1");
  assert.equal(policy?.completedAt, "2026-08-01T02:00:00.000Z");
});

test("an older checklist is upgraded by its labels rather than left as tick boxes", () => {
  // What is on file today: generated ids, no kind, no owner.
  const legacy = [
    { id: "a1b2", label: "Personal and contact details", done: true },
    { id: "c3d4", label: "Company policies reviewed", done: false },
    { id: "e5f6", label: "First-week check-in", done: false },
  ];
  const steps = normaliseOnboarding(legacy);

  assert.equal(steps[0].kind, "profile", "matched by label");
  assert.equal(steps[0].owner, "employee");
  assert.deepEqual(steps[0].requires, PERSONAL_FIELDS);
  assert.equal(steps[1].kind, "policy");
  assert.equal(steps[2].owner, "hr", "the ones HR does stay with HR");
});

test("an upgraded legacy tick still answers to the data", () => {
  const legacy = [{ id: "a1b2", label: "Personal and contact details", done: true }];
  const steps = resolveOnboarding(legacy, { phone: "", emergencyContact: "", location: "" });
  assert.equal(steps[0].done, false, "a tick from before the details were asked for is not evidence they exist");
});

test("an unrecognised step is left alone as an ordinary task", () => {
  const steps = normaliseOnboarding([{ id: "x", label: "Collect parking pass", done: false }]);
  assert.equal(steps[0].kind, "task");
  assert.equal(steps[0].owner, "hr");
  assert.equal(steps[0].label, "Collect parking pass");
});

test("an empty checklist falls back to the default rather than to nothing", () => {
  assert.equal(normaliseOnboarding([]).length, defaultStaffOnboarding().length);
  assert.equal(normaliseOnboarding(null).length, defaultStaffOnboarding().length);
});

test("progress separates who is being waited on", () => {
  const steps = resolveOnboarding(defaultStaffOnboarding(), {});
  const summary = onboardingSummary(steps);

  assert.equal(summary.done, 0);
  assert.equal(summary.complete, false);
  assert.ok(summary.waitingOnEmployee > 0, "the joiner owes their details");
  assert.ok(summary.waitingOnHR > 0, "HR owes access and a check-in");
  assert.equal(summary.waitingOnEmployee + summary.waitingOnHR, summary.total);
});

test("a joiner who has done their part still shows HR's part outstanding", () => {
  const stored = defaultStaffOnboarding().map((step) =>
    step.kind === "policy" ? { ...step, done: true } : step);
  const summary = onboardingSummary(resolveOnboarding(stored, complete));

  assert.equal(summary.waitingOnEmployee, 0);
  assert.ok(summary.waitingOnHR > 0);
  assert.equal(summary.complete, false, "nobody is fully onboarded until HR finishes too");
});

test("everything done reads as complete", () => {
  const stored = defaultStaffOnboarding().map((step) => ({ ...step, done: true }));
  const summary = onboardingSummary(resolveOnboarding(stored, complete));
  assert.equal(summary.complete, true);
  assert.equal(summary.percent, 100);
});

test("only the right people can complete a step", () => {
  const [personal, , policy, , access] = defaultStaffOnboarding();

  assert.equal(canCompleteStep(policy, { isOwnRecord: true, isManager: false }), true, "a joiner acknowledges their own policy");
  assert.equal(canCompleteStep(policy, { isOwnRecord: false, isManager: false }), false, "but not a colleague's");
  assert.equal(canCompleteStep(access, { isOwnRecord: true, isManager: false }), false, "HR's steps are not the joiner's to close");
  assert.equal(canCompleteStep(access, { isOwnRecord: false, isManager: true }), true);
  assert.equal(canCompleteStep(personal, { isOwnRecord: true, isManager: true }), false, "a details step is answered by the data, by anyone");
});

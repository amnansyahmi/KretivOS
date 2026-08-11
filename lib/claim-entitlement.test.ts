import assert from "node:assert/strict";
import test from "node:test";
import {
  claimBalance,
  claimBalances,
  claimProblemFor,
  claimTypeNames,
  DEFAULT_CLAIM_RULES,
  describeClaimant,
  findClaimRule,
  toClaimRules,
  validateClaim,
} from "./claim-entitlement.ts";

const rules = DEFAULT_CLAIM_RULES;
const medical = findClaimRule(rules, "Outpatient Medical")!;
const travel = findClaimRule(rules, "Travel")!;

const claim = (over: Record<string, any> = {}) => ({
  category: "Outpatient Medical",
  amount: 83,
  receiptDate: "2026-08-10",
  receiptNumber: "RCC0000125968",
  incurredAt: "Klinik Mediviron Seksyen 22",
  claimingFor: "Self",
  claimingForName: "",
  receiptAssetId: "asset-1",
  ...over,
});

test("a benefit is capped and an expense is not", () => {
  assert.equal(medical.kind, "benefit");
  assert.equal(medical.annualCap, 1000);
  assert.equal(travel.kind, "expense");
  assert.equal(travel.annualCap, undefined, "a taxi fare is not drawn from an allowance");
});

test("the type is matched regardless of case", () => {
  assert.ok(findClaimRule(rules, "outpatient medical"));
  assert.ok(findClaimRule(rules, "  DENTAL  "));
  assert.equal(findClaimRule(rules, "Nonsense"), null);
  assert.ok(claimTypeNames(rules).includes("Family Insurance Subsidy"));
});

test("an allowance counts approved and pending against itself", () => {
  // A balance that ignores what has already been asked for invites asking twice
  // for money that only exists once.
  const balance = claimBalance(rules, "Outpatient Medical", [
    { category: "Outpatient Medical", amount: 200, status: "Approved", receiptDate: "2026-02-01" },
    { category: "Outpatient Medical", amount: 100, status: "Paid", receiptDate: "2026-03-01" },
    { category: "Outpatient Medical", amount: 50, status: "Pending", receiptDate: "2026-04-01" },
  ], 2026);

  assert.equal(balance.entitlement, 1000);
  assert.equal(balance.claimed, 300);
  assert.equal(balance.pending, 50);
  assert.equal(balance.remaining, 650);
});

test("a rejected claim releases what it held", () => {
  const balance = claimBalance(rules, "Dental", [
    { category: "Dental", amount: 400, status: "Rejected", receiptDate: "2026-02-01" },
  ], 2026);
  assert.equal(balance.remaining, 500, "nothing was spent");
});

test("a claim belongs to the year on the bill, not the year it was filed", () => {
  // Otherwise sitting on a December receipt until January rolls an allowance
  // forward, which is exactly what a cap exists to stop.
  const claims = [{ category: "Dental", amount: 300, status: "Approved", receiptDate: "2025-12-20", claimDate: "2026-01-05" }];
  assert.equal(claimBalance(rules, "Dental", claims, 2025).claimed, 300);
  assert.equal(claimBalance(rules, "Dental", claims, 2026).claimed, 0);
});

test("a claim with no bill date falls back to when it was filed", () => {
  const claims = [{ category: "Dental", amount: 300, status: "Approved", claimDate: "2026-01-05" }];
  assert.equal(claimBalance(rules, "Dental", claims, 2026).claimed, 300);
});

test("one type's spending does not touch another's", () => {
  const claims = [{ category: "Dental", amount: 500, status: "Approved", receiptDate: "2026-02-01" }];
  assert.equal(claimBalance(rules, "Optical", claims, 2026).remaining, 400);
});

test("an uncapped expense reports no balance rather than a zero one", () => {
  const balance = claimBalance(rules, "Travel", [
    { category: "Travel", amount: 9000, status: "Approved", receiptDate: "2026-02-01" },
  ], 2026);
  assert.equal(balance.capped, false);
  assert.equal(balance.entitlement, 0);
  assert.equal(balance.claimed, 9000, "still totalled, just not limited");
});

test("an over-drawn allowance floors at zero rather than going negative", () => {
  const balance = claimBalance(rules, "Optical", [
    { category: "Optical", amount: 600, status: "Approved", receiptDate: "2026-02-01" },
  ], 2026);
  assert.equal(balance.remaining, 0);
});

test("sen do not accumulate a floating-point tail", () => {
  const balance = claimBalance(rules, "Dental", [
    { category: "Dental", amount: 10.1, status: "Approved", receiptDate: "2026-01-01" },
    { category: "Dental", amount: 20.2, status: "Approved", receiptDate: "2026-01-02" },
  ], 2026);
  assert.equal(balance.claimed, 30.3);
  assert.equal(balance.remaining, 469.7);
});

test("only capped types appear in the balance list", () => {
  const balances = claimBalances(rules, [], 2026);
  assert.ok(balances.every((balance) => balance.capped));
  assert.ok(balances.some((balance) => balance.name === "Family Insurance Subsidy" && balance.entitlement === 700));
  assert.ok(!balances.some((balance) => balance.name === "Travel"));
});

test("a complete claim has nothing wrong with it", () => {
  assert.deepEqual(validateClaim(claim(), medical, claimBalance(rules, "Outpatient Medical", [], 2026), "2026-08-11"), []);
});

test("the fields the form asks for are all required", () => {
  const problems = validateClaim(
    { category: "", amount: 0, receiptDate: "", incurredAt: "", receiptAssetId: "" },
    medical, null, "2026-08-11",
  );
  const fields = problems.map((problem) => problem.field);
  for (const field of ["category", "amount", "receiptDate", "incurredAt", "receiptNumber", "claimingFor", "attachment"]) {
    assert.ok(fields.includes(field), `${field} was not required`);
  }
});

test("a bill cannot be dated in the future", () => {
  const problems = validateClaim(claim({ receiptDate: "2026-09-01" }), medical, null, "2026-08-11");
  assert.match(claimProblemFor(problems, "receiptDate"), /future/);
  assert.deepEqual(validateClaim(claim({ receiptDate: "2026-08-11" }), medical, null, "2026-08-11"), [], "today is fine");
});

test("a receipt number is required where the type says so, and not otherwise", () => {
  assert.match(claimProblemFor(validateClaim(claim({ receiptNumber: "" }), medical, null, "2026-08-11"), "receiptNumber"), /receipt number/);
  assert.equal(claimProblemFor(validateClaim(claim({ category: "Travel", receiptNumber: "", claimingFor: "" }), travel, null, "2026-08-11"), "receiptNumber"), "");
});

test("a dependant has to be named", () => {
  // "Child" on its own identifies nobody, and the approver is checking a
  // specific person against a policy.
  const problems = validateClaim(claim({ claimingFor: "Child", claimingForName: "" }), medical, null, "2026-08-11");
  assert.match(claimProblemFor(problems, "claimingForName"), /name the child/i);

  assert.deepEqual(validateClaim(claim({ claimingFor: "Child", claimingForName: "Aisyah" }), medical, null, "2026-08-11"), []);
});

test("claiming yourself needs no name", () => {
  assert.deepEqual(validateClaim(claim({ claimingFor: "Self", claimingForName: "" }), medical, null, "2026-08-11"), []);
});

test("a type that is not for dependants refuses one", () => {
  const problems = validateClaim(
    { ...claim({ category: "Travel", claimingFor: "Spouse", claimingForName: "Nur Anis" }) },
    travel, null, "2026-08-11",
  );
  assert.match(claimProblemFor(problems, "claimingFor"), /only be claimed for yourself/);
});

test("an expense does not have to say who it is for", () => {
  assert.deepEqual(
    validateClaim(claim({ category: "Travel", claimingFor: "", receiptNumber: "" }), travel, null, "2026-08-11"),
    [],
  );
});

test("claiming more than is left is a problem, not a warning", () => {
  // A claim that cannot be paid in full should be fixed before it is submitted,
  // not approved and then quietly cut by finance.
  const balance = claimBalance(rules, "Outpatient Medical", [
    { category: "Outpatient Medical", amount: 950, status: "Approved", receiptDate: "2026-01-01" },
  ], 2026);

  const problems = validateClaim(claim({ amount: 83 }), medical, balance, "2026-08-11");
  assert.match(claimProblemFor(problems, "amount"), /Only RM 50\.00 of your RM 1000\.00/);

  assert.deepEqual(validateClaim(claim({ amount: 50 }), medical, balance, "2026-08-11"), [], "exactly the remainder is fine");
});

test("an uncapped expense is never refused for its size", () => {
  assert.deepEqual(
    validateClaim(claim({ category: "Travel", amount: 25_000, claimingFor: "", receiptNumber: "" }), travel, claimBalance(rules, "Travel", [], 2026), "2026-08-11"),
    [],
  );
});

test("stored rules load, and a company's own type is not dropped", () => {
  const stored = toClaimRules([
    { name: "Outpatient Medical", annualCap: 1500 },
    { name: "Gym Membership", kind: "benefit", annualCap: 600 },
  ]);

  assert.equal(stored.length, 2);
  assert.equal(stored[0].annualCap, 1500, "a company raising its own cap is honoured");
  assert.equal(stored[0].kind, "benefit", "and keeps what the defaults know about it");
  assert.equal(stored[1].name, "Gym Membership");
  assert.equal(stored[1].annualCap, 600);
});

test("an unrecognised type is an uncapped expense rather than a lost one", () => {
  const stored = toClaimRules([{ name: "Relocation" }]);
  assert.equal(stored[0].kind, "expense");
  assert.equal(stored[0].annualCap, undefined);
});

test("plain strings still load, since that is how the list used to be stored", () => {
  const stored = toClaimRules(["Outpatient Medical", "Travel"]);
  assert.deepEqual(stored.map((rule) => rule.name), ["Outpatient Medical", "Travel"]);
  assert.equal(stored[0].annualCap, 1000, "picking their behaviour back up from the defaults");
});

test("an empty or damaged configuration falls back to the defaults", () => {
  assert.deepEqual(toClaimRules([]), DEFAULT_CLAIM_RULES);
  assert.deepEqual(toClaimRules(null), DEFAULT_CLAIM_RULES);
});

test("a cap can be removed by setting it to zero", () => {
  const stored = toClaimRules([{ name: "Dental", annualCap: 0 }]);
  assert.equal(claimBalance(stored, "Dental", [], 2026).capped, false);
});

test("who a claim is for reads on one line", () => {
  assert.equal(describeClaimant({ claimingFor: "Self" }), "Self");
  assert.equal(describeClaimant({}), "Self", "an old claim with no relation recorded is the employee's own");
  assert.equal(describeClaimant({ claimingFor: "Spouse", claimingForName: "Nur Anis" }), "Spouse · Nur Anis");
  assert.equal(describeClaimant({ claimingFor: "Child", claimingForName: "" }), "Child");
});

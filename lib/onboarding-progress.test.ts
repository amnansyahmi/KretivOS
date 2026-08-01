import assert from "node:assert/strict";
import test from "node:test";
import {
  inputsForCustomer, onboardingCompletion, onboardingProgress, onboardingStatus,
  type OnboardingInputs,
} from "./onboarding-progress.ts";

const STEPS = [
  { id: "s1", label: "Customer profile" },
  { id: "s2", label: "Commercial agreement" },
  { id: "s3", label: "Brand DNA and assets" },
  { id: "s4", label: "Delivery setup" },
  { id: "s5", label: "Launch checklist" },
];

const empty: OnboardingInputs = { customer: null, contacts: [], brands: [], documents: [], projects: [] };
const byId = (states: any[], id: string) => states.find((s) => s.id === id);

test("nothing is ticked when nothing has been done", () => {
  const states = onboardingProgress(STEPS, empty);
  assert.equal(states.every((s) => !s.done), true);
  assert.equal(onboardingStatus(states), "Not started");
  assert.deepEqual(onboardingCompletion(states), { done: 0, total: 5, percent: 0 });
});

test("a customer profile needs a way to reach them and a sector", () => {
  const nameOnly = onboardingProgress(STEPS, { ...empty, customer: { name: "Chef Ammar" } });
  assert.equal(byId(nameOnly, "s1").satisfied, false, "a name alone is not a profile");
  assert.match(byId(nameOnly, "s1").hint, /email, a phone number or a contact/);

  const reachable = onboardingProgress(STEPS, { ...empty, customer: { name: "Chef Ammar", email: "a@b.com" } });
  assert.equal(byId(reachable, "s1").satisfied, false, "still needs an industry");
  assert.match(byId(reachable, "s1").hint, /industry/);

  const complete = onboardingProgress(STEPS, {
    ...empty, customer: { name: "Chef Ammar", email: "a@b.com", industry: "Food and beverage" },
  });
  assert.equal(byId(complete, "s1").satisfied, true);
});

test("a contact counts as a way to reach the client", () => {
  const states = onboardingProgress(STEPS, {
    ...empty,
    customer: { name: "Chef Ammar", industry: "F&B" },
    contacts: [{ customerId: "c1" }],
  });
  assert.equal(byId(states, "s1").satisfied, true);
});

test("a draft quotation is not a commercial agreement", () => {
  const draft = onboardingProgress(STEPS, {
    ...empty, documents: [{ customerId: "c1", type: "Quotation", status: "Draft" }],
  });
  assert.equal(byId(draft, "s2").satisfied, false);
  assert.match(byId(draft, "s2").hint, /past Draft/);

  const sent = onboardingProgress(STEPS, {
    ...empty, documents: [{ customerId: "c1", type: "Quotation", status: "Approved" }],
  });
  assert.equal(byId(sent, "s2").satisfied, true);
});

test("an archived brand does not satisfy Brand DNA", () => {
  const archived = onboardingProgress(STEPS, { ...empty, brands: [{ customerId: "c1", status: "Archived" }] });
  assert.equal(byId(archived, "s3").satisfied, false);

  const live = onboardingProgress(STEPS, { ...empty, brands: [{ customerId: "c1", status: "Active" }] });
  assert.equal(byId(live, "s3").satisfied, true);
});

test("launch means delivery has actually started, not merely been planned", () => {
  const planned = onboardingProgress(STEPS, { ...empty, projects: [{ customerId: "c1", status: "Planning", progress: 0 }] });
  assert.equal(byId(planned, "s4").satisfied, true, "the project exists, so delivery is set up");
  assert.equal(byId(planned, "s5").satisfied, false, "but nothing has launched");

  const started = onboardingProgress(STEPS, { ...empty, projects: [{ customerId: "c1", status: "Planning", progress: 15 }] });
  assert.equal(byId(started, "s5").satisfied, true, "progress counts as started");

  const active = onboardingProgress(STEPS, { ...empty, projects: [{ customerId: "c1", status: "In progress", progress: 0 }] });
  assert.equal(byId(active, "s5").satisfied, true, "so does leaving Planning");
});

test("a manual tick is honoured but recorded as an override", () => {
  const states = onboardingProgress(
    [{ id: "s3", label: "Brand DNA and assets", done: true }],
    empty,
  );
  assert.equal(states[0].done, true, "the operator's tick still counts");
  assert.equal(states[0].satisfied, false, "but the records do not back it up");
  assert.equal(states[0].overridden, true);
});

test("a step the records satisfy is not marked as an override", () => {
  const states = onboardingProgress(
    [{ id: "s3", label: "Brand DNA and assets", done: true }],
    { ...empty, brands: [{ customerId: "c1" }] },
  );
  assert.equal(states[0].overridden, false);
});

test("an unrecognised custom step stays manual", () => {
  const states = onboardingProgress([{ id: "x", label: "Send the welcome hamper" }], empty);
  assert.equal(states[0].satisfied, false);
  assert.equal(states[0].action, undefined);
  assert.match(states[0].hint, /Tick when this is done/);
});

test("status follows the derived steps", () => {
  const full: OnboardingInputs = {
    customer: { name: "Chef Ammar", email: "a@b.com", industry: "F&B" },
    contacts: [{ customerId: "c1" }],
    brands: [{ customerId: "c1" }],
    documents: [{ customerId: "c1", type: "Quotation", status: "Approved" }],
    projects: [{ customerId: "c1", status: "In progress", progress: 40 }],
  };
  const states = onboardingProgress(STEPS, full);
  assert.equal(onboardingStatus(states), "Completed");
  assert.deepEqual(onboardingCompletion(states), { done: 5, total: 5, percent: 100 });
});

test("only this client's records are considered", () => {
  const inputs = inputsForCustomer("c1", {
    customers: [{ id: "c1", name: "Ours" }, { id: "c2", name: "Theirs" }],
    contacts: [{ customerId: "c2" }],
    brands: [{ customerId: "c2" }],
    documents: [{ customerId: "c2", type: "Quotation", status: "Approved" }],
    projects: [{ customerId: "c2" }],
  });
  assert.equal(inputs.customer?.name, "Ours");
  assert.equal(inputs.contacts.length, 0, "another client's contact must not count");
  assert.equal(onboardingProgress(STEPS, inputs).filter((s) => s.done).length, 0);
});

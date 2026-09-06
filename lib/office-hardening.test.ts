import assert from "node:assert/strict";
import test from "node:test";
import { isTransientOfficeError, parseOfficeSseTerminalState, retryOfficeOperation, validateOfficePlan } from "./office-hardening.ts";
import type { OfficePlan } from "./office-agents.ts";

function plan(tasks: OfficePlan["tasks"]): OfficePlan {
  return { missionType: "test", objective: "Test", summary: "Test plan", tasks };
}

test("validateOfficePlan accepts an acyclic dependency graph", () => {
  const result = validateOfficePlan(plan([
    { id: "research", agent: "research", title: "Research", instruction: "Research", dependsOn: [] },
    { id: "marketing", agent: "marketing", title: "Marketing", instruction: "Plan", dependsOn: ["research"] },
  ]));
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateOfficePlan rejects duplicate ids, missing dependencies and cycles", () => {
  const duplicate = validateOfficePlan(plan([
    { id: "same", agent: "research", title: "A", instruction: "A", dependsOn: [] },
    { id: "same", agent: "marketing", title: "B", instruction: "B", dependsOn: [] },
  ]));
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.errors.join(" "), /Duplicate task id/);

  const missing = validateOfficePlan(plan([
    { id: "marketing", agent: "marketing", title: "A", instruction: "A", dependsOn: ["missing"] },
  ]));
  assert.equal(missing.valid, false);
  assert.match(missing.errors.join(" "), /missing task/);

  const cycle = validateOfficePlan(plan([
    { id: "a", agent: "research", title: "A", instruction: "A", dependsOn: ["b"] },
    { id: "b", agent: "marketing", title: "B", instruction: "B", dependsOn: ["a"] },
  ]));
  assert.equal(cycle.valid, false);
  assert.match(cycle.errors.join(" "), /dependency cycle/);
});

test("retryOfficeOperation retries transient provider failures only", async () => {
  let calls = 0;
  const value = await retryOfficeOperation(async () => {
    calls += 1;
    if (calls === 1) throw new Error("provider_unavailable 503");
    return "ok";
  }, { attempts: 2, delayMs: 0 });
  assert.equal(value, "ok");
  assert.equal(calls, 2);

  calls = 0;
  await assert.rejects(() => retryOfficeOperation(async () => {
    calls += 1;
    throw new Error("Invalid request 400");
  }, { attempts: 3, delayMs: 0 }), /Invalid request/);
  assert.equal(calls, 1);
  assert.equal(isTransientOfficeError(new Error("rate limit 429")), true);
});

test("parseOfficeSseTerminalState detects complete, paused, error and truncated streams", () => {
  assert.equal(parseOfficeSseTerminalState('data: {"type":"mission"}\n\ndata: {"type":"done"}\n\n'), "done");
  assert.equal(parseOfficeSseTerminalState('data: {"type":"attention"}\n\ndata: {"type":"paused"}\n\n'), "paused");
  assert.equal(parseOfficeSseTerminalState('data: {"type":"done"}\n\ndata: {"type":"error"}\n\n'), "error");
  assert.equal(parseOfficeSseTerminalState('data: {"type":"agent"}\n\n'), "unknown");
});

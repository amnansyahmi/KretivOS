import assert from "node:assert/strict";
import test from "node:test";
import { compactOfficePlan, extractOfficeEvidenceUrls, isTransientOfficeError, parseOfficeSseTerminalState, retryOfficeOperation, validateOfficePlan } from "./office-hardening-core.ts";
import type { OfficePlan } from "./office-agents.ts";

function plan(tasks: OfficePlan["tasks"]): OfficePlan {
  return { missionType: "test", objective: "Test", summary: "Test plan", tasks };
}

test("validateOfficePlan accepts an acyclic dependency graph", () => {
  const result = validateOfficePlan(plan([
    { id: "research", agent: "research", title: "Research", instruction: "Research market audience and competitor evidence", dependsOn: [] },
    { id: "marketing", agent: "marketing", title: "Marketing", instruction: "Build funnel campaign channels and acquisition plan", dependsOn: ["research"] },
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

test("compactOfficePlan consolidates repeated work from the same agent", () => {
  const value = plan([
    {
      id: "market",
      agent: "research",
      title: "Research market and audience",
      instruction: "Research market audience segments and competitor evidence.",
      dependsOn: [],
    },
    {
      id: "competitors",
      agent: "research",
      title: "Competitor research",
      instruction: "Compare competitor offers, positioning and evidence sources.",
      dependsOn: [],
    },
    {
      id: "funnel",
      agent: "marketing",
      title: "Build acquisition funnel",
      instruction: "Build TOFU MOFU BOFU funnel and channel plan.",
      dependsOn: ["competitors"],
    },
  ]);

  const result = compactOfficePlan(value);
  assert.equal(result.originalCount, 3);
  assert.equal(result.finalCount, 2);
  assert.deepEqual(result.removedTaskIds, ["competitors"]);
  assert.equal(value.tasks.filter((task) => task.agent === "research").length, 1);
  assert.match(value.tasks[0].instruction, /Additional non-overlapping scope/);
  assert.deepEqual(value.tasks.find((task) => task.id === "funnel")?.dependsOn, ["market"]);
});

test("validateOfficePlan removes near-identical cross-agent plans and keeps the stronger owner", () => {
  const value = plan([
    {
      id: "generic-positioning",
      agent: "marketing",
      title: "Define market positioning and growth priorities",
      instruction: "Define market positioning value proposition growth priorities using evidence and customer needs.",
      dependsOn: [],
    },
    {
      id: "business-positioning",
      agent: "business",
      title: "Define positioning and growth priorities",
      instruction: "Define market positioning value proposition growth priorities based on evidence and customer needs.",
      dependsOn: [],
    },
    {
      id: "sales-system",
      agent: "sales",
      title: "Build sales follow-up system",
      instruction: "Build lead qualification CRM followup objection handling and closing actions.",
      dependsOn: ["business-positioning"],
    },
  ]);

  const result = validateOfficePlan(value);
  assert.equal(result.valid, true);
  assert.equal(result.redundancy.originalCount, 3);
  assert.equal(result.redundancy.finalCount, 2);
  assert.deepEqual(result.redundancy.removedTaskIds, ["business-positioning"]);
  assert.equal(value.tasks[0].id, "generic-positioning");
  assert.equal(value.tasks[0].agent, "business");
  assert.deepEqual(value.tasks.find((task) => task.id === "sales-system")?.dependsOn, ["generic-positioning"]);
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

test("extractOfficeEvidenceUrls deduplicates and trims source URLs", () => {
  const urls = extractOfficeEvidenceUrls("Sources: https://example.com/report. Also https://example.com/report and https://docs.example.org/a?b=1,");
  assert.deepEqual(urls, ["https://example.com/report", "https://docs.example.org/a?b=1"]);
});

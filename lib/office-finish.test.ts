import assert from "node:assert/strict";
import test from "node:test";
import { dedupeOfficeArtifacts } from "./office-artifact-dedupe.ts";
import { extractOfficeEvidenceRecords } from "./office-evidence.ts";
import { officeUsageRecord } from "./office-telemetry.ts";
import type { OfficePlan } from "./office-agents.ts";

test("artifact dedupe suppresses materially duplicated specialist outputs", () => {
  const plan: OfficePlan = {
    missionType: "growth",
    objective: "Recover sales",
    summary: "test",
    tasks: [
      { id: "business", agent: "business", title: "Growth priorities", instruction: "Define positioning and priorities", dependsOn: [] },
      { id: "research", agent: "research", title: "Market findings", instruction: "Research customer and market evidence", dependsOn: [] },
      { id: "marketing", agent: "marketing", title: "Growth strategy", instruction: "Build funnel and channels", dependsOn: [] },
    ],
  };
  const repeated = "Customer demand is weak in awareness. Prioritise segment A, sharpen value proposition, use social proof, test offer messaging, measure qualified leads, improve follow-up, and review weekly. ".repeat(8);
  const result = dedupeOfficeArtifacts(plan, {
    business: repeated,
    research: "Fresh market evidence with competitor observations, customer segments, source notes, and demand signals. ".repeat(8),
    marketing: repeated,
  });
  assert.equal(result.plan.tasks.length, 2);
  assert.equal(result.removed.length, 1);
});

test("evidence extraction captures external, internal and assumption records", () => {
  const records = extractOfficeEvidenceRecords(`
## What We Know
| Item | Status | Source |
|---|---|---|
| Customers | 3 active | Current ops |
| Pipeline | 0 opportunities | CRM |

- Market benchmark — Source: https://example.com/report
- Assumption: conversion improves after follow-up automation.
`);
  assert.equal(records.some((item) => item.type === "external" && item.url === "https://example.com/report"), true);
  assert.equal(records.some((item) => item.type === "internal" && /Customers/i.test(item.claim)), true);
  assert.equal(records.some((item) => item.type === "assumption"), true);
});

test("usage telemetry records real token counts and configurable estimated cost", () => {
  const oldInput = process.env.AI_OFFICE_INPUT_USD_PER_MILLION;
  const oldOutput = process.env.AI_OFFICE_OUTPUT_USD_PER_MILLION;
  process.env.AI_OFFICE_INPUT_USD_PER_MILLION = "1";
  process.env.AI_OFFICE_OUTPUT_USD_PER_MILLION = "2";
  const record = officeUsageRecord({
    content: "ok",
    model: "test-model",
    usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
    raw: {},
  }, "specialist", "research");
  assert.equal(record.totalTokens, 1500);
  assert.equal(record.estimatedCostUsd, 0.002);
  if (oldInput === undefined) delete process.env.AI_OFFICE_INPUT_USD_PER_MILLION; else process.env.AI_OFFICE_INPUT_USD_PER_MILLION = oldInput;
  if (oldOutput === undefined) delete process.env.AI_OFFICE_OUTPUT_USD_PER_MILLION; else process.env.AI_OFFICE_OUTPUT_USD_PER_MILLION = oldOutput;
});

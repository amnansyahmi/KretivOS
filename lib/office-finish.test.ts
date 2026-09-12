import assert from "node:assert/strict";
import test from "node:test";
import { dedupeOfficeArtifacts } from "./office-artifact-dedupe.ts";
import { extractOfficeEvidenceRecords } from "./office-evidence.ts";
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

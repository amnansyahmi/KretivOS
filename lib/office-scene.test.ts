import test from "node:test";
import assert from "node:assert/strict";
import { CORE_STATIONS, sceneState, scenePhase, sceneConnections, type SceneAgent } from "./office-scene.ts";

const a = (id: string, status: SceneAgent["status"]): SceneAgent => ({ id, status });
test("seven permanent distinct workstations", () => {
  assert.equal(new Set(CORE_STATIONS.map(s => s.id)).size, 7);
  assert.ok(CORE_STATIONS.every(s => s.x >= 100 && s.x <= 900 && s.y < 660));
});
test("all visual states derive from the protocol without faking queued work", () => {
  assert.equal(sceneState(a("chief", "working"), false), "thinking");
  assert.equal(sceneState(a("chief", "working"), true), "working");
  assert.equal(sceneState(a("qa", "working"), true), "reviewing");
  for (const status of ["standby", "queued", "completed"] as const) assert.equal(sceneState(a("sales", status), true), status);
  for (const status of ["blocked", "failed"] as const) assert.equal(sceneState(a("sales", status), true), "attention");
});
test("mission stages follow real events and completion is not guessed", () => {
  assert.equal(scenePhase([a("chief", "completed")], true, "In progress"), "specialists");
  assert.equal(scenePhase([a("chief", "working")], false, "In progress"), "brief");
  assert.equal(scenePhase([a("qa", "working")], true, "In progress"), "review");
  assert.equal(scenePhase([a("chief", "working")], true, "In progress"), "delivery");
  assert.equal(scenePhase([], true, "Complete"), "completed");
  assert.equal(scenePhase([], false, "Failed"), "attention");
  assert.equal(scenePhase([a("sales", "blocked")], true, "In progress"), "attention");
});
test("handoffs include live participating agents only", () => {
  const agents = [a("chief", "completed"), a("sales", "working"), a("research", "standby")];
  const tasks = [{ id: "s", agent: "sales", dependsOn: [] }];
  assert.deepEqual(sceneConnections(agents, tasks, "specialists"), [{ from: "chief", to: "sales" }]);
  assert.deepEqual(sceneConnections(agents, tasks, "attention"), []);
  assert.deepEqual(sceneConnections(agents, tasks, "completed"), []);
  assert.deepEqual(sceneConnections([a("sales", "completed"), a("qa", "working")], tasks, "review"), [{ from: "sales", to: "qa" }]);
  assert.deepEqual(sceneConnections([a("qa", "completed"), a("chief", "working")], tasks, "delivery"), [{ from: "qa", to: "chief" }]);
});

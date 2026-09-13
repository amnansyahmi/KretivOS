import test from "node:test";
import assert from "node:assert/strict";
import { agentTaskRun, updateTaskRun, taskPresentation, missionBucket, validAgentStatus } from "./office-task-state.ts";
import { sceneConnections } from "./office-scene.ts";

test("concurrent tasks on one agent retain independent status and output", () => {
  let runs = updateTaskRun({}, { taskId: "a", agent: "sales", status: "working", detail: "First task" });
  runs = updateTaskRun(runs, { taskId: "b", agent: "sales", status: "working", detail: "Second task" });
  runs = updateTaskRun(runs, { taskId: "a", agent: "sales", status: "completed", output: "First output" });
  assert.equal(runs.a.output, "First output");
  assert.equal(runs.b.status, "working");
  assert.equal(agentTaskRun(runs, "sales")?.detail, "Second task");
});
test("retry preserves previous output while changing task status", () => {
  let runs = updateTaskRun({}, { taskId: "a", agent: "sales", status: "completed", output: "Draft" });
  runs = updateTaskRun(runs, { taskId: "a", agent: "sales", status: "working" });
  assert.equal(runs.a.output, "Draft"); assert.equal(runs.a.status, "working");
});
test("when tasks share a status the agent panel follows the latest event", () => {
  let runs = updateTaskRun({}, { taskId: "a", agent: "sales", status: "completed", detail: "First" });
  runs = updateTaskRun(runs, { taskId: "b", agent: "sales", status: "completed", detail: "Second" });
  assert.equal(agentTaskRun(runs, "sales")?.detail, "Second");
  runs = updateTaskRun(runs, { taskId: "a", agent: "sales", status: "completed", detail: "First revised" });
  assert.equal(agentTaskRun(runs, "sales")?.detail, "First revised");
});
test("non-task events and invalid statuses cannot corrupt the task ledger", () => {
  const runs = {};
  assert.equal(updateTaskRun(runs, { agent: "chief", status: "working" }), runs);
  assert.equal(validAgentStatus("invented"), false);
  assert.equal(validAgentStatus("working"), true);
});
test("task readiness follows explicit dependency completion", () => {
  const task = { id: "b", agent: "sales", dependsOn: ["a"] };
  assert.equal(taskPresentation(task, {}).label, "Waiting on dependencies");
  const runs = updateTaskRun({}, { taskId: "a", agent: "research", status: "completed" });
  assert.equal(taskPresentation(task, runs).label, "Queued");
});
test("handoff paths follow the active task's actual completed dependencies", () => {
  const tasks = [
    { id: "a", agent: "research", dependsOn: [], status: "completed" as const },
    { id: "b", agent: "sales", dependsOn: ["a"], status: "working" as const },
  ];
  assert.deepEqual(sceneConnections([{ id: "research", status: "completed" }, { id: "sales", status: "working" }], tasks, "specialists"), [{ from: "research", to: "sales" }]);
});
test("mission history filters keep failed and waiting missions out of completed", () => {
  assert.equal(missionBucket("waiting_input"), "attention");
  assert.equal(missionBucket("failed"), "attention");
  assert.equal(missionBucket("running"), "active");
  assert.equal(missionBucket("completed"), "completed");
  assert.equal(missionBucket("unknown"), "other");
});

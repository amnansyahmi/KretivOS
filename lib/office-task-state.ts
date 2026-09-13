import type { SceneAgent, SceneTask } from "./office-scene.ts";

export type TaskUpdate = { taskId?: string; agent: string; status: SceneAgent["status"]; detail?: string; output?: string };
export type TaskRun = { agent: string; status: SceneAgent["status"]; detail: string; output?: string; sequence?: number };
export type TaskRuns = Record<string, TaskRun>;
const statuses = new Set(["standby", "queued", "working", "completed", "blocked", "failed"]);
export function validAgentStatus(value: unknown): value is SceneAgent["status"] { return typeof value === "string" && statuses.has(value); }
export function updateTaskRun(runs: TaskRuns, event: TaskUpdate): TaskRuns {
  if (!event.taskId || !validAgentStatus(event.status)) return runs;
  const previous = runs[event.taskId];
  const sequence = Math.max(0, ...Object.values(runs).map(run => run.sequence || 0)) + 1;
  return { ...runs, [event.taskId]: { agent: event.agent, status: event.status, detail: event.detail ?? previous?.detail ?? "", output: event.output ?? previous?.output, sequence } };
}
// One agent can own multiple tasks. A completion must not hide another running task.
export function agentTaskRun(runs: TaskRuns, agent: string): TaskRun | undefined {
  const priority = { working: 0, failed: 1, blocked: 2, queued: 3, completed: 4, standby: 5 };
  return Object.values(runs).filter(t => t.agent === agent).sort((a, b) => priority[a.status] - priority[b.status] || (b.sequence || 0) - (a.sequence || 0))[0];
}
export function taskPresentation(task: SceneTask, runs: TaskRuns) {
  const run = runs[task.id];
  const missing = task.dependsOn.filter(id => runs[id]?.status !== "completed");
  const status = run?.status || "queued";
  return { status, missing, label: status === "queued" ? (missing.length ? "Waiting on dependencies" : "Queued") : status === "blocked" ? "Needs input / blocked" : status === "failed" ? "Failed" : status === "completed" ? "Completed" : status === "working" ? "Working" : "Standby" };
}
export function missionBucket(status: string): "active" | "attention" | "completed" | "other" {
  if (["completed", "complete"].includes(status)) return "completed";
  if (["failed", "blocked", "waiting_input", "waiting_for_input", "needs_attention"].includes(status)) return "attention";
  if (["running", "planning", "queued", "reviewing", "in_progress", "synthesizing"].includes(status)) return "active";
  return "other";
}

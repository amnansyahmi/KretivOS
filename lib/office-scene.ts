/** Presentation-only state: the wire protocol and persisted statuses stay unchanged. */
export type SceneAgent = {
  id: string;
  status: "standby" | "queued" | "working" | "completed" | "blocked" | "failed";
  detail?: string;
};
export type SceneState = "standby" | "queued" | "thinking" | "working" | "reviewing" | "attention" | "completed";
export type SceneTask = { id: string; agent: string; dependsOn: string[] };
export type ScenePhase = "ready" | "brief" | "specialists" | "review" | "delivery" | "attention" | "completed";

export const CORE_STATIONS = [
  // Label anchors registered to warm-office-v2.webp, in a 1000 × 750 plane.
  { id: "chief", x: 310, y: 535, zone: "Command" },
  { id: "research", x: 339, y: 358, zone: "Strategy" },
  { id: "business", x: 483, y: 296, zone: "Strategy" },
  { id: "sales", x: 861, y: 460, zone: "Growth" },
  { id: "pricing", x: 690, y: 529, zone: "Growth" },
  { id: "marketing", x: 506, y: 462, zone: "Growth" },
  { id: "qa", x: 618, y: 365, zone: "Quality" },
] as const;

export const STATE_LABELS: Record<SceneState, string> = {
  standby: "Standby", queued: "Queued", thinking: "Thinking", working: "Working",
  reviewing: "Reviewing", attention: "Attention required", completed: "Completed",
};

export function sceneState(agent: SceneAgent, hasPlan: boolean): SceneState {
  if (agent.status === "blocked" || agent.status === "failed") return "attention";
  if (agent.status !== "working") return agent.status;
  if (agent.id === "chief" && !hasPlan) return "thinking";
  if (agent.id === "qa") return "reviewing";
  return "working";
}

export function scenePhase(agents: SceneAgent[], hasPlan: boolean, missionStatus: string): ScenePhase {
  if (missionStatus === "Complete") return "completed";
  if (missionStatus === "Failed" || missionStatus === "Waiting for input" || agents.some(a => a.status === "blocked" || a.status === "failed")) return "attention";
  if (agents.some(a => a.id === "qa" && a.status === "working")) return "review";
  if (agents.some(a => a.id === "chief" && a.status === "working")) return hasPlan ? "delivery" : "brief";
  if (agents.some(a => a.id !== "chief" && (a.status === "working" || a.status === "queued"))) return "specialists";
  return missionStatus === "In progress" ? (hasPlan ? "specialists" : "brief") : "ready";
}

/** Only illuminate live work; never animate imaginary progress on a timer. */
export function sceneConnections(agents: SceneAgent[], tasks: SceneTask[], phase: ScenePhase) {
  const edges: { from: string; to: string }[] = [];
  const visible = new Set<string>(CORE_STATIONS.map(s => s.id));
  const add = (from: string, to: string) => {
    if (from !== to && visible.has(from) && visible.has(to) && !edges.some(e => e.from === from && e.to === to)) edges.push({ from, to });
  };
  if (phase === "attention" || phase === "ready" || phase === "completed") return edges;
  for (const agent of agents.filter(a => a.status === "working" && a.id !== "chief")) {
    if (agent.id === "qa" && phase === "review") {
      agents.filter(a => a.status === "completed" && a.id !== "chief").forEach(a => add(a.id, "qa"));
    } else {
      // Agent-level events cannot distinguish multiple tasks on one agent.
      // Show the truthful coordinator handoff, not inferred task dependencies.
      if (tasks.some(t => t.agent === agent.id)) add("chief", agent.id);
    }
  }
  if (phase === "delivery") {
    if (agents.some(a => a.id === "qa" && a.status === "completed")) add("qa", "chief");
  }
  return edges;
}

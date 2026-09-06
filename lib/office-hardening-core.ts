export type OfficeSseTerminalState = "done" | "paused" | "error" | "unknown";

type PlanLike = {
  tasks: Array<{ id: string; dependsOn?: string[] }>;
};

export function validateOfficePlan(plan: PlanLike) {
  const errors: string[] = [];
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    return { valid: false, errors: ["Plan has no executable specialist tasks."] };
  }

  const ids = new Set<string>();
  for (const task of plan.tasks) {
    const id = String(task.id || "").trim();
    if (!id) errors.push("A task is missing an id.");
    else if (ids.has(id)) errors.push(`Duplicate task id: ${id}.`);
    else ids.add(id);
  }

  for (const task of plan.tasks) {
    for (const dependency of task.dependsOn || []) {
      if (dependency === task.id) errors.push(`Task ${task.id} depends on itself.`);
      else if (!ids.has(dependency)) errors.push(`Task ${task.id} depends on missing task ${dependency}.`);
    }
  }

  const byId = new Map(plan.tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const task = byId.get(id);
    for (const dependency of task?.dependsOn || []) {
      if (byId.has(dependency) && walk(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of ids) {
    if (walk(id)) {
      errors.push("Task graph contains a dependency cycle.");
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

export function isTransientOfficeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /(?:\b408\b|\b425\b|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|timeout|timed out|fetch failed|network|temporar|rate.?limit|resource.?exhaust|provider.?unavailable|gateway)/i.test(message);
}

export async function retryOfficeOperation<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; delayMs?: number; onRetry?: (retryNumber: number, error: unknown) => void | Promise<void> } = {},
) {
  const attempts = Math.max(1, Math.min(options.attempts || 1, 3));
  const delayMs = Math.max(0, options.delayMs ?? 650);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientOfficeError(error)) throw error;
      await options.onRetry?.(attempt, error);
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI Office operation failed.");
}

export function parseOfficeSseTerminalState(body: string): OfficeSseTerminalState {
  let terminal: OfficeSseTerminalState = "unknown";
  for (const frame of String(body || "").split("\n\n")) {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!data) continue;
    try {
      const event = JSON.parse(data);
      if (event?.type === "error") return "error";
      if (event?.type === "paused") terminal = "paused";
      if (event?.type === "done") terminal = "done";
    } catch {
      // Ignore non-JSON keep-alive frames.
    }
  }
  return terminal;
}

export function extractOfficeEvidenceUrls(content: string) {
  const matches = String(content || "").match(/https?:\/\/[^\s<>()\[\]{}"']+/gi) || [];
  const cleaned = matches.map((url) => url.replace(/[.,;:!?]+$/, ""));
  return [...new Set(cleaned)].slice(0, 12);
}

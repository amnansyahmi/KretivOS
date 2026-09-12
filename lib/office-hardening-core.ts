export type OfficeSseTerminalState = "done" | "paused" | "error" | "unknown";

type PlanTaskLike = {
  id: string;
  agent?: string;
  title?: string;
  instruction?: string;
  dependsOn?: string[];
};

type PlanLike = {
  missionType?: string;
  objective?: string;
  summary?: string;
  tasks: PlanTaskLike[];
};

const REDUNDANCY_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "build", "by", "client", "complete", "comprehensive",
  "create", "current", "develop", "for", "from", "in", "into", "is", "it", "mission", "new", "of", "on",
  "plan", "provide", "recommend", "recommendation", "strategy", "task", "that", "the", "this", "to", "using",
  "with", "work", "analyse", "analyze", "analysis",
]);

const AGENT_OWNERSHIP: Record<string, string[]> = {
  research: ["research", "market", "competitor", "audience", "evidence", "trend", "benchmark", "segment", "survey"],
  business: ["positioning", "business", "model", "opportunity", "priority", "priorities", "growth", "value", "proposition"],
  marketing: ["funnel", "campaign", "channel", "acquisition", "tofu", "mofu", "bofu", "retention", "awareness", "conversion"],
  content: ["content", "copy", "script", "scripts", "hook", "hooks", "caption", "calendar", "editorial", "creative"],
  pricing: ["price", "pricing", "margin", "bundle", "bundles", "package", "cost", "discount", "economics"],
  sales: ["sales", "lead", "leads", "qualification", "followup", "follow", "objection", "closing", "close", "crm", "pipeline"],
  proposal: ["proposal", "scope", "deliverable", "deliverables", "milestone", "milestones", "quotation", "commercial"],
  product: ["product", "requirement", "requirements", "prd", "roadmap", "story", "stories", "acceptance"],
  ux: ["ux", "ui", "wireframe", "wireframes", "usability", "accessibility", "screen", "screens", "flow"],
  architect: ["architecture", "architect", "integration", "integrations", "system", "boundary", "boundaries", "infrastructure"],
  frontend: ["frontend", "component", "components", "react", "nextjs", "next", "css", "browser", "responsive"],
  backend: ["backend", "api", "apis", "database", "schema", "queue", "worker", "server", "endpoint", "endpoints"],
  security: ["security", "auth", "authentication", "authorization", "secret", "secrets", "threat", "abuse", "permission", "permissions"],
};

function normalizeTaskToken(value: string) {
  return value
    .toLowerCase()
    .replace(/next\.js/g, "nextjs")
    .replace(/follow[- ]?up/g, "followup")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function taskTokens(task: PlanTaskLike) {
  const source = normalizeTaskToken(`${task.title || ""} ${task.instruction || ""}`);
  return new Set(source.split(/\s+/).filter((token) => token.length > 2 && !REDUNDANCY_STOP_WORDS.has(token)));
}

function taskSimilarity(a: PlanTaskLike, b: PlanTaskLike) {
  const left = taskTokens(a);
  const right = taskTokens(b);
  if (Math.min(left.size, right.size) < 4) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common / Math.min(left.size, right.size);
}

function ownershipScore(task: PlanTaskLike) {
  const tokens = taskTokens(task);
  return (AGENT_OWNERSHIP[String(task.agent || "")] || []).reduce((score, token) => score + (tokens.has(token) ? 1 : 0), 0);
}

function uniqueDependencies(...lists: Array<string[] | undefined>) {
  return [...new Set(lists.flatMap((list) => Array.isArray(list) ? list : []).filter(Boolean))];
}

function mergeInstructions(primary: PlanTaskLike, secondary: PlanTaskLike) {
  const a = String(primary.instruction || "").trim();
  const b = String(secondary.instruction || "").trim();
  if (!b || taskSimilarity(primary, secondary) >= 0.8) return a || b;
  if (!a) return b;
  return `${a}\n\nAdditional non-overlapping scope:\n${b}`.slice(0, 4000);
}

function resolveAlias(id: string, aliases: Map<string, string>) {
  let value = id;
  const seen = new Set<string>();
  while (aliases.has(value) && !seen.has(value)) {
    seen.add(value);
    value = aliases.get(value)!;
  }
  return value;
}

function structuralPlanErrors(tasks: PlanTaskLike[]) {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const task of tasks) {
    const id = String(task.id || "").trim();
    if (!id) errors.push("A task is missing an id.");
    else if (ids.has(id)) errors.push(`Duplicate task id: ${id}.`);
    else ids.add(id);
  }

  for (const task of tasks) {
    for (const dependency of task.dependsOn || []) {
      if (dependency === task.id) errors.push(`Task ${task.id} depends on itself.`);
      else if (!ids.has(dependency)) errors.push(`Task ${task.id} depends on missing task ${dependency}.`);
    }
  }

  if (!errors.length) {
    const byId = new Map(tasks.map((task) => [task.id, task]));
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
  }

  return errors;
}

/**
 * Compacts semantic duplicates in-place so every downstream consumer sees the same lean task graph.
 * Rules:
 * - one consolidated task per specialist agent;
 * - near-identical tasks across different agents collapse to one owner;
 * - dependencies pointing at removed tasks are rewired to the surviving task id.
 */
export function compactOfficePlan(plan: PlanLike) {
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length < 2) {
    return { originalCount: plan?.tasks?.length || 0, finalCount: plan?.tasks?.length || 0, removedTaskIds: [] as string[] };
  }

  const originalCount = plan.tasks.length;
  const aliases = new Map<string, string>();
  let tasks: PlanTaskLike[] = plan.tasks.map((task) => ({ ...task, dependsOn: [...(task.dependsOn || [])] }));

  // One consolidated assignment per agent, retaining genuinely different scope in a single task.
  const byAgent: PlanTaskLike[] = [];
  for (const task of tasks) {
    const existingIndex = task.agent ? byAgent.findIndex((item) => item.agent === task.agent) : -1;
    if (existingIndex < 0) {
      byAgent.push(task);
      continue;
    }
    const existing = byAgent[existingIndex];
    aliases.set(task.id, existing.id);
    byAgent[existingIndex] = {
      ...existing,
      instruction: mergeInstructions(existing, task),
      dependsOn: uniqueDependencies(existing.dependsOn, task.dependsOn),
    };
  }
  tasks = byAgent;

  // Across different agents, collapse only very-high-confidence semantic duplicates.
  const semantic: PlanTaskLike[] = [];
  for (const task of tasks) {
    const duplicateIndex = semantic.findIndex((item) => taskSimilarity(item, task) >= 0.84);
    if (duplicateIndex < 0) {
      semantic.push(task);
      continue;
    }

    const existing = semantic[duplicateIndex];
    const candidateOwnsScopeBetter = ownershipScore(task) > ownershipScore(existing) + 1;
    aliases.set(task.id, existing.id);
    semantic[duplicateIndex] = candidateOwnsScopeBetter
      ? {
          ...existing,
          agent: task.agent,
          title: task.title || existing.title,
          instruction: task.instruction || existing.instruction,
          dependsOn: uniqueDependencies(existing.dependsOn, task.dependsOn),
        }
      : {
          ...existing,
          dependsOn: uniqueDependencies(existing.dependsOn, task.dependsOn),
        };
  }
  tasks = semantic;

  // A cross-agent merge can change ownership and create a duplicate agent; consolidate once more.
  const finalTasks: PlanTaskLike[] = [];
  for (const task of tasks) {
    const existingIndex = task.agent ? finalTasks.findIndex((item) => item.agent === task.agent) : -1;
    if (existingIndex < 0) {
      finalTasks.push(task);
      continue;
    }
    const existing = finalTasks[existingIndex];
    aliases.set(task.id, existing.id);
    finalTasks[existingIndex] = {
      ...existing,
      instruction: mergeInstructions(existing, task),
      dependsOn: uniqueDependencies(existing.dependsOn, task.dependsOn),
    };
  }

  const survivingIds = new Set(finalTasks.map((task) => task.id));
  plan.tasks = finalTasks.map((task) => ({
    ...task,
    dependsOn: [...new Set((task.dependsOn || [])
      .map((dependency) => resolveAlias(dependency, aliases))
      .filter((dependency) => dependency !== task.id && survivingIds.has(dependency)))],
  }));

  return {
    originalCount,
    finalCount: plan.tasks.length,
    removedTaskIds: [...aliases.keys()],
  };
}

export function validateOfficePlan(plan: PlanLike) {
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    return { valid: false, errors: ["Plan has no executable specialist tasks."], redundancy: { originalCount: 0, finalCount: 0, removedTaskIds: [] as string[] } };
  }

  // Structural safety is checked before compaction so malformed dependencies can never be silently discarded.
  const originalErrors = structuralPlanErrors(plan.tasks);
  if (originalErrors.length) {
    return {
      valid: false,
      errors: originalErrors,
      redundancy: { originalCount: plan.tasks.length, finalCount: plan.tasks.length, removedTaskIds: [] as string[] },
    };
  }

  const redundancy = compactOfficePlan(plan);
  const errors = structuralPlanErrors(plan.tasks);
  return { valid: errors.length === 0, errors, redundancy };
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

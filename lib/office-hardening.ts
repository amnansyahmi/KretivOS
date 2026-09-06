import { getDatabase } from "@/lib/db";
import type { OfficePlan } from "@/lib/office-agents";

const ORGANIZATION_ID = "org-kretivco";

export type OfficeSseTerminalState = "done" | "paused" | "error" | "unknown";

export function validateOfficePlan(plan: OfficePlan) {
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

export async function recoverStaleOfficeJobs(maxAgeMinutes = 20) {
  const sql = getDatabase();
  const age = Math.max(5, Math.min(maxAgeMinutes, 180));
  const rows = await sql`
    update ai_office_jobs
       set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
           error = coalesce(error, 'Worker lease expired before a terminal mission event.'),
           run_after = now() + interval '2 minutes', locked_at = null, updated_at = now()
     where organization_id = ${ORGANIZATION_ID}
       and status = 'running'
       and locked_at < now() - (${age} * interval '1 minute')
    returning id::text, status
  `;
  return rows as Array<{ id: string; status: string }>;
}

export async function getOfficeLearningContext(workspaceId?: string | null) {
  try {
    const sql = getDatabase();
    const lessons = workspaceId
      ? await sql`
          select title, quality_score, evaluation->'lessons' as lessons
            from ai_office_missions
           where organization_id = ${ORGANIZATION_ID}
             and workspace_id = ${workspaceId}::uuid
             and status = 'completed'
             and jsonb_array_length(coalesce(evaluation->'lessons', '[]'::jsonb)) > 0
           order by completed_at desc nulls last limit 6
        `
      : await sql`
          select title, quality_score, evaluation->'lessons' as lessons
            from ai_office_missions
           where organization_id = ${ORGANIZATION_ID}
             and status = 'completed'
             and jsonb_array_length(coalesce(evaluation->'lessons', '[]'::jsonb)) > 0
           order by completed_at desc nulls last limit 4
        `;

    const agentStats = await sql`
      select r.agent_id, count(*)::int as runs,
             count(*) filter (where r.status = 'completed')::int as completed,
             round(avg(r.duration_ms)::numeric, 0)::int as avg_duration_ms
        from ai_office_agent_runs r
        join ai_office_missions m on m.id = r.mission_id
       where m.organization_id = ${ORGANIZATION_ID}
       group by r.agent_id
       having count(*) >= 2
       order by count(*) desc limit 8
    `;

    const lessonLines = (lessons as any[]).flatMap((row) => {
      const values = Array.isArray(row.lessons) ? row.lessons : [];
      return values.slice(0, 3).map((lesson: unknown) => `- ${String(lesson).slice(0, 280)}${row.quality_score ? ` [quality ${row.quality_score}]` : ""}`);
    });
    const performanceLines = (agentStats as any[]).map((row) => {
      const rate = row.runs ? Math.round((Number(row.completed) / Number(row.runs)) * 100) : 0;
      return `- ${row.agent_id}: ${rate}% completed across ${row.runs} runs${row.avg_duration_ms ? `, avg ${Math.round(Number(row.avg_duration_ms) / 1000)}s` : ""}`;
    });

    if (!lessonLines.length && !performanceLines.length) return "";
    return [
      lessonLines.length ? `AI OFFICE LEARNED LESSONS:\n${lessonLines.slice(0, 12).join("\n")}` : "",
      performanceLines.length ? `RECENT AGENT RELIABILITY:\n${performanceLines.join("\n")}` : "",
      "Use these only as operational guidance. Current mission evidence and explicit client facts take precedence.",
    ].filter(Boolean).join("\n\n").slice(0, 6500);
  } catch (error) {
    console.warn("AI Office learning context unavailable", error);
    return "";
  }
}

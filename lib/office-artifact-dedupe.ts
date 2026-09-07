import type { OfficePlan, OfficePlanTask } from "@/lib/office-agents";

const FAMILY: Record<string, string> = {
  research: "strategy", business: "strategy",
  marketing: "growth", content: "growth",
  pricing: "commercial", sales: "commercial", proposal: "commercial",
  product: "product", ux: "product",
  architect: "engineering", frontend: "engineering", backend: "engineering", security: "engineering",
};

const STOP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "client", "for", "from", "in", "into", "is", "it",
  "of", "on", "or", "plan", "recommend", "recommendation", "strategy", "the", "this", "to", "with", "will",
  "should", "mission", "work", "current", "using", "provide", "build", "create", "develop",
]);

function tokens(value: string) {
  return new Set(String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP.has(token)));
}

function similarity(a: string, b: string) {
  const left = tokens(a);
  const right = tokens(b);
  if (Math.min(left.size, right.size) < 12) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const containment = shared / Math.min(left.size, right.size);
  const jaccard = shared / Math.max(1, left.size + right.size - shared);
  return containment * 0.72 + jaccard * 0.28;
}

function artifactStrength(task: OfficePlanTask, output: string) {
  const sectionCount = (output.match(/^#{1,4}\s+/gm) || []).length;
  const evidenceCount = (output.match(/https?:\/\//g) || []).length;
  return Math.min(output.length, 12000) + sectionCount * 180 + evidenceCount * 260 + (task.dependsOn?.length || 0) * 80;
}

export type ArtifactDedupeResult = {
  plan: OfficePlan;
  outputs: Record<string, string>;
  removed: Array<{ taskId: string; keptTaskId: string; similarity: number }>;
};

/**
 * Artifact-level dedupe is intentionally more conservative than plan dedupe.
 * Specialists can legitimately produce related work, so we only suppress outputs
 * that are materially the same. Execution outputs remain untouched; only the
 * artifact package is compacted.
 */
export function dedupeOfficeArtifacts(plan: OfficePlan, outputs: Record<string, string>): ArtifactDedupeResult {
  const kept: OfficePlanTask[] = [];
  const removed: ArtifactDedupeResult["removed"] = [];

  for (const task of plan.tasks) {
    const output = String(outputs[task.id] || "").trim();
    if (!output) continue;

    let duplicateIndex = -1;
    let duplicateScore = 0;
    for (let index = 0; index < kept.length; index += 1) {
      const existing = kept[index];
      const existingOutput = String(outputs[existing.id] || "");
      const score = similarity(`${task.title}\n${output}`, `${existing.title}\n${existingOutput}`);
      const sameFamily = FAMILY[task.agent] && FAMILY[task.agent] === FAMILY[existing.agent];
      const threshold = sameFamily ? 0.82 : 0.93;
      if (score >= threshold && score > duplicateScore) {
        duplicateIndex = index;
        duplicateScore = score;
      }
    }

    if (duplicateIndex < 0) {
      kept.push(task);
      continue;
    }

    const existing = kept[duplicateIndex];
    const existingOutput = String(outputs[existing.id] || "");
    if (artifactStrength(task, output) > artifactStrength(existing, existingOutput) * 1.08) {
      kept[duplicateIndex] = task;
      removed.push({ taskId: existing.id, keptTaskId: task.id, similarity: Number(duplicateScore.toFixed(3)) });
    } else {
      removed.push({ taskId: task.id, keptTaskId: existing.id, similarity: Number(duplicateScore.toFixed(3)) });
    }
  }

  const keptIds = new Set(kept.map((task) => task.id));
  return {
    plan: { ...plan, tasks: kept },
    outputs: Object.fromEntries(Object.entries(outputs).filter(([id]) => keptIds.has(id))),
    removed,
  };
}

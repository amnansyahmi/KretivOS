import { aiNonymauzChat } from "@/lib/ai-nonymauz";
import type { OfficePlan } from "@/lib/office-agents";

function parseJson(value: string) {
  const clean = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(clean); } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    return { score: 0, strengths: [], weaknesses: ["Evaluation could not be parsed."], lessons: [] };
  }
}

/** Phase 5 quality loop: score a completed mission and persist reusable lessons. */
export async function evaluateOfficeMission(input: {
  mission: string;
  plan: OfficePlan;
  outputs: Record<string, string>;
  qa: string;
  final: string;
}) {
  const compactWork = input.plan.tasks
    .map((task) => `${task.agent}/${task.id}: ${(input.outputs[task.id] || "").slice(0, 1500)}`)
    .join("\n\n");
  const result = await aiNonymauzChat({
    messages: [{
      role: "user",
      content: `MISSION:\n${input.mission}\n\nSPECIALIST WORK:\n${compactWork}\n\nQA:\n${input.qa.slice(0, 5000)}\n\nFINAL:\n${input.final.slice(0, 7000)}`,
    }],
    systemPrompt: [
      "You are KretivOS AI Office's internal quality evaluator.",
      "Score the completed mission from 0 to 100 for usefulness, consistency, evidence discipline, specificity and executability.",
      "Do not reward verbosity. Penalise invented facts, contradictions, generic advice and missing next actions.",
      "Return ONLY JSON with this schema:",
      '{"score":85,"strengths":["..."],"weaknesses":["..."],"lessons":["future reusable lesson"],"shouldRetryAgents":["agent-id"],"confidence":"high|medium|low"}',
    ].join("\n"),
    mode: "normal",
    temperature: 0.1,
    useRag: false,
    useTools: false,
    maxTokens: 1000,
  });
  const parsed = parseJson(result.content);
  return {
    score: Math.max(0, Math.min(100, Number(parsed.score || 0))),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 6) : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.slice(0, 6) : [],
    lessons: Array.isArray(parsed.lessons) ? parsed.lessons.slice(0, 8) : [],
    shouldRetryAgents: Array.isArray(parsed.shouldRetryAgents) ? parsed.shouldRetryAgents.slice(0, 5) : [],
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium",
  };
}

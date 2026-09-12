import { NextRequest } from "next/server";
import { gatherContext } from "@/lib/ai-context";
import { getDatabase } from "@/lib/db";
import {
  OFFICE_AGENT_MAP,
  planOfficeMission,
  reviewOfficeMission,
  runOfficeAgent,
  synthesizeOfficeMission,
  type OfficeAgentId,
  type OfficePlanTask,
} from "@/lib/office-agents";
import { evaluateOfficeMission } from "@/lib/office-evaluator";
import { dedupeOfficeArtifacts } from "@/lib/office-artifact-dedupe";
import { getRelevantOfficeWorkspaceContext } from "@/lib/office-memory";
import { persistOfficeTelemetry, type OfficeUsageRecord } from "@/lib/office-telemetry";
import { dispatchAutomationEvent } from "@/lib/automation-server";
import { notifyOffice } from "@/lib/office-notifications";
import {
  enrichOfficeArtifactEvidence,
  getOfficeLearningContext,
  retryOfficeOperation,
  validateOfficePlan,
} from "@/lib/office-hardening";
import {
  addOfficeAgentRun,
  completeOfficeMission,
  createOfficeArtifacts,
  createOfficeMission,
  failOfficeMission,
  saveMissionEvaluation,
  saveOfficePlan,
  setOfficeTaskStatus,
  type OfficeBudgetMode,
} from "@/lib/office-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MissionRequest = {
  mission?: string;
  grounded?: boolean;
  maxAgents?: number;
  workspaceId?: string;
  parentMissionId?: string;
  budgetMode?: OfficeBudgetMode;
  executionMode?: "interactive" | "background";
};

function safeMission(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 12000) : "";
}

function safeUuid(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

function needsInput(output: string) {
  const match = output.match(/(?:^|\n)\s*NEEDS_INPUT\s*:\s*(.+?)(?:\n|$)/i);
  return match?.[1]?.trim().slice(0, 600) || "";
}

export async function POST(request: NextRequest) {
  let body: MissionRequest;
  try {
    body = (await request.json()) as MissionRequest;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const mission = safeMission(body.mission);
  if (!mission) return Response.json({ error: "Mission is required." }, { status: 400 });

  const workspaceId = safeUuid(body.workspaceId) || null;
  const parentMissionId = safeUuid(body.parentMissionId) || null;
  const budgetMode: OfficeBudgetMode = ["economy", "balanced", "max_quality"].includes(String(body.budgetMode))
    ? body.budgetMode as OfficeBudgetMode
    : "balanced";
  const modeAgentCap = budgetMode === "economy" ? 4 : budgetMode === "max_quality" ? 8 : 6;
  const maxAgents = Math.max(2, Math.min(Number(body.maxAgents) || modeAgentCap, modeAgentCap));
  const resilientAttempts = budgetMode === "economy" ? 1 : 2;
  const encoder = new TextEncoder();

  // Fast duplicate-submit guard. It deliberately targets only actively running,
  // near-simultaneous identical missions so intentional historical reruns remain possible.
  try {
    const sql = getDatabase();
    const duplicate = await sql`
      select id::text, status from ai_office_missions
       where organization_id = 'org-kretivco'
         and workspace_id is not distinct from ${workspaceId}::uuid
         and lower(trim(mission)) = lower(trim(${mission}))
         and status in ('planning','running')
         and created_at > now() - interval '45 seconds'
       order by created_at desc limit 1
    `;
    if (duplicate[0]) return Response.json({ error: "This mission is already running.", missionId: duplicate[0].id }, { status: 409 });
  } catch (error) {
    console.warn("AI Office duplicate-submit guard unavailable", error);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      const outputs: Record<string, string> = {};
      const failed = new Set<string>();
      const usageRecords: OfficeUsageRecord[] = [];
      const reportUsage = (record: OfficeUsageRecord) => usageRecords.push(record);
      let missionId = "";

      const persist = async (work: () => Promise<unknown>) => {
        try { await work(); } catch (error) { console.warn("AI Office persistence unavailable", error); }
      };

      try {
        await persist(async () => {
          missionId = await createOfficeMission(mission, {
            workspaceId,
            parentMissionId,
            budgetMode,
            executionMode: body.executionMode || "interactive",
          });
        });
        send({ type: "mission", missionId: missionId || null, workspaceId, budgetMode });
        send({ type: "agent", agent: "chief", status: "working", detail: "Understanding the mission, relevant client memory and best team…" });

        const [context, workspaceContext, learningContext] = await Promise.all([
          body.grounded === false
            ? Promise.resolve({ matches: [], snapshot: null, block: "" })
            : gatherContext(mission, { workspace: "AI Office" }),
          getRelevantOfficeWorkspaceContext(workspaceId, mission),
          getOfficeLearningContext(workspaceId),
        ]);
        const sources = context.matches.map((match, index) => ({
          index: index + 1,
          id: match.id,
          title: match.title,
          category: match.category,
          customerName: match.customerName,
        }));
        const contextBlock = [workspaceContext, learningContext, context.block].filter(Boolean).join("\n\n---\n\n");
        send({
          type: "context",
          grounded: Boolean(contextBlock),
          sources,
          workspaceMemory: Boolean(workspaceContext),
          learnedContext: Boolean(learningContext),
        });

        const plan = await retryOfficeOperation(
          () => planOfficeMission(mission, contextBlock, maxAgents, reportUsage),
          {
            attempts: resilientAttempts,
            onRetry: () => send({ type: "agent", agent: "chief", status: "working", detail: "Planner provider was temporarily unavailable. Retrying safely…" }),
          },
        );
        const planCheck = validateOfficePlan(plan);
        if (!planCheck.valid) throw new Error(`AI Office planner produced an unsafe task graph: ${planCheck.errors.join(" ")}`);

        send({ type: "plan", plan, redundancy: planCheck.redundancy });
        if (missionId) await persist(() => saveOfficePlan(missionId, plan, Boolean(contextBlock), sources.length));

        for (const task of plan.tasks) send({ type: "agent", agent: task.agent, taskId: task.id, status: "queued", detail: task.title });
        send({ type: "agent", agent: "chief", status: "completed", detail: `Mission plan ready · ${plan.tasks.length} focused specialist${plan.tasks.length === 1 ? "" : "s"} · ${budgetMode.replace("_", " ")} mode.` });

        const pending = new Map(plan.tasks.map((task) => [task.id, task]));
        let attention: { task: OfficePlanTask; question: string } | null = null;

        while (pending.size && !attention) {
          for (const [id, task] of [...pending]) {
            const broken = task.dependsOn.filter((dep) => failed.has(dep));
            if (!broken.length) continue;
            pending.delete(id);
            failed.add(id);
            send({ type: "agent", agent: task.agent, taskId: id, status: "blocked", detail: `Blocked by failed dependency: ${broken.join(", ")}` });
            if (missionId) await persist(() => setOfficeTaskStatus(missionId, id, "blocked"));
          }

          const ready = [...pending.values()].filter((task) => task.dependsOn.every((dep) => outputs[dep]));
          if (!ready.length) break;
          ready.forEach((task) => pending.delete(task.id));

          const results = await Promise.all(ready.map(async (task) => {
            send({ type: "agent", agent: task.agent, taskId: task.id, status: "working", detail: task.title });
            if (missionId) await persist(() => setOfficeTaskStatus(missionId, task.id, "working"));
            const started = Date.now();
            const dependencyOutputs = task.dependsOn
              .map((dependencyId) => outputs[dependencyId] ? `### ${dependencyId}\n${outputs[dependencyId]}` : "")
              .filter(Boolean)
              .join("\n\n");

            try {
              const output = await retryOfficeOperation(
                () => runOfficeAgent({
                  agentId: task.agent,
                  mission,
                  task: {
                    ...task,
                    instruction: [
                      task.instruction,
                      "If a critical factual input is genuinely required and cannot be inferred safely, write exactly one line starting with NEEDS_INPUT: followed by the question. Do not invent the missing value.",
                      "For current or externally verifiable factual claims, include a short Evidence section with source titles or URLs when the tool provides them. If evidence is unavailable, label the claim as an assumption rather than presenting it as fact.",
                    ].join("\n\n"),
                  },
                  contextBlock,
                  dependencyOutputs,
                }, reportUsage),
                {
                  attempts: resilientAttempts,
                  onRetry: () => send({ type: "agent", agent: task.agent, taskId: task.id, status: "working", detail: `${task.title} · temporary provider issue, retrying…` }),
                },
              );
              const question = needsInput(output);
              if (question) {
                send({ type: "agent", agent: task.agent, taskId: task.id, status: "blocked", detail: question, output });
                if (missionId) {
                  await persist(() => setOfficeTaskStatus(missionId, task.id, "waiting_input", output, question));
                  await persist(() => addOfficeAgentRun(missionId, task.agent, "waiting_input", question, task.id, output, Date.now() - started));
                }
                return { task, output, question };
              }

              if (!output.trim()) throw new Error("Specialist returned an empty output.");
              outputs[task.id] = output;
              send({ type: "agent", agent: task.agent, taskId: task.id, status: "completed", detail: task.title, output });
              if (missionId) {
                await persist(() => setOfficeTaskStatus(missionId, task.id, "completed", output));
                await persist(() => addOfficeAgentRun(missionId, task.agent, "completed", task.title, task.id, output, Date.now() - started));
              }
              return { task, output, question: "" };
            } catch (error) {
              console.error(`AI Office agent ${task.agent} failed`, error);
              failed.add(task.id);
              send({ type: "agent", agent: task.agent, taskId: task.id, status: "failed", detail: `${task.title} failed after safe retry.` });
              if (missionId) {
                await persist(() => setOfficeTaskStatus(missionId, task.id, "failed"));
                await persist(() => addOfficeAgentRun(missionId, task.agent, "failed", task.title, task.id, undefined, Date.now() - started));
              }
              return { task, output: "", question: "" };
            }
          }));

          const waiting = results.find((result) => result.question);
          if (waiting) attention = { task: waiting.task, question: waiting.question };
        }

        if (attention) {
          send({ type: "attention", missionId: missionId || null, taskId: attention.task.id, agent: attention.task.agent, question: attention.question, detail: "Mission paused instead of guessing a critical input." });
          if (missionId) {
            try { await dispatchAutomationEvent("ai-office.attention.required" as any, "ai_office_mission", missionId, { mission, workspaceId, taskId: attention.task.id, agent: attention.task.agent, question: attention.question }, "detected", "waiting_input"); } catch {}
            try { await notifyOffice({ title: "AI Office needs your input", body: attention.question, type: "warning", missionId }); } catch {}
          }
          send({ type: "paused", missionId: missionId || null, reason: "needs_input" });
          return;
        }

        if (pending.size) {
          const unresolved = [...pending.values()];
          for (const task of unresolved) {
            send({ type: "agent", agent: task.agent, taskId: task.id, status: "blocked", detail: "Task graph stalled because dependencies could not be resolved." });
            if (missionId) await persist(() => setOfficeTaskStatus(missionId, task.id, "blocked"));
          }
          throw new Error(`Mission task graph stalled with unresolved tasks: ${unresolved.map((task) => task.id).join(", ")}.`);
        }

        if (!Object.keys(outputs).length) throw new Error("All specialist tasks failed; AI Office will not synthesize an unsupported final answer.");

        send({ type: "agent", agent: "qa", status: "working", detail: "Checking contradictions, assumptions, evidence, redundancy and execution gaps…" });
        let qa = await retryOfficeOperation(
          () => reviewOfficeMission(mission, plan, outputs, contextBlock, reportUsage),
          {
            attempts: resilientAttempts,
            onRetry: () => send({ type: "agent", agent: "qa", status: "working", detail: "QA provider was temporarily unavailable. Retrying…" }),
          },
        );
        send({ type: "agent", agent: "qa", status: "completed", detail: "Review complete.", output: qa });

        send({ type: "agent", agent: "chief", status: "working", detail: "Synthesizing the final deliverable and executable artifacts…" });
        let final = await retryOfficeOperation(
          () => synthesizeOfficeMission({ mission, plan, outputs, qa, contextBlock }, reportUsage),
          {
            attempts: resilientAttempts,
            onRetry: () => send({ type: "agent", agent: "chief", status: "working", detail: "Chief synthesis was interrupted by a temporary provider issue. Retrying…" }),
          },
        );
        if (!final.trim()) throw new Error("Chief returned an empty final deliverable.");

        let evaluation: Record<string, any> | null = null;
        let correctiveRound: { previousScore: number; agents: string[] } | null = null;
        if (budgetMode !== "economy") {
          try {
            evaluation = await evaluateOfficeMission({ mission, plan, outputs, qa, final }, reportUsage);
            const previousScore = Number(evaluation.score || 0);
            const requested = Array.isArray(evaluation.shouldRetryAgents) ? evaluation.shouldRetryAgents.map(String) : [];
            const correctionLimit = budgetMode === "max_quality" ? 2 : 1;
            const correctionTasks = plan.tasks
              .filter((task) => requested.includes(task.agent))
              .slice(0, correctionLimit);

            if (previousScore > 0 && previousScore < 76 && correctionTasks.length) {
              const weaknesses = Array.isArray(evaluation.weaknesses) ? evaluation.weaknesses.map(String).slice(0, 5).join("; ") : "Quality evaluator found a fixable weakness.";
              const correctedAgents: string[] = [];
              send({ type: "quality_loop", status: "working", score: previousScore, agents: correctionTasks.map((task) => task.agent), detail: "Quality score triggered one bounded corrective round." });

              for (const task of correctionTasks) {
                try {
                  send({ type: "agent", agent: task.agent, taskId: task.id, status: "working", detail: `${task.title} · quality correction` });
                  const dependencyOutputs = task.dependsOn
                    .map((dependencyId) => outputs[dependencyId] ? `### ${dependencyId}\n${outputs[dependencyId]}` : "")
                    .filter(Boolean)
                    .join("\n\n");
                  const started = Date.now();
                  const corrected = await retryOfficeOperation(
                    () => runOfficeAgent({
                      agentId: task.agent,
                      mission,
                      task: {
                        ...task,
                        instruction: [
                          task.instruction,
                          `QUALITY CORRECTION ROUND. Evaluator weaknesses: ${weaknesses}`,
                          "Correct only your own specialist contribution. Remove duplication, unsupported claims and generic filler. Preserve valid evidence. Do not broaden scope.",
                        ].join("\n\n"),
                      },
                      contextBlock,
                      dependencyOutputs,
                    }, reportUsage),
                    { attempts: resilientAttempts },
                  );
                  if (corrected.trim() && !needsInput(corrected)) {
                    outputs[task.id] = corrected;
                    correctedAgents.push(task.agent);
                    send({ type: "agent", agent: task.agent, taskId: task.id, status: "completed", detail: `${task.title} · corrected`, output: corrected });
                    if (missionId) {
                      await persist(() => setOfficeTaskStatus(missionId, task.id, "completed", corrected));
                      await persist(() => addOfficeAgentRun(missionId, task.agent, "completed", "Automatic quality correction", task.id, corrected, Date.now() - started));
                    }
                  }
                } catch (error) {
                  console.warn(`AI Office corrective rerun failed for ${task.agent}`, error);
                }
              }

              if (correctedAgents.length) {
                send({ type: "agent", agent: "qa", status: "working", detail: "Rechecking corrected specialist work…" });
                qa = await retryOfficeOperation(() => reviewOfficeMission(mission, plan, outputs, contextBlock, reportUsage), { attempts: resilientAttempts });
                send({ type: "agent", agent: "qa", status: "completed", detail: "Corrective review complete.", output: qa });
                send({ type: "agent", agent: "chief", status: "working", detail: "Re-synthesizing after quality corrections…" });
                final = await retryOfficeOperation(() => synthesizeOfficeMission({ mission, plan, outputs, qa, contextBlock }, reportUsage), { attempts: resilientAttempts });
                const secondEvaluation = await evaluateOfficeMission({ mission, plan, outputs, qa, final }, reportUsage);
                correctiveRound = { previousScore, agents: correctedAgents };
                evaluation = { ...secondEvaluation, correctiveRound };
                send({ type: "quality_loop", status: "completed", previousScore, score: evaluation.score, agents: correctedAgents });
              }
            }
          } catch (error) {
            console.warn("Mission evaluation/corrective loop failed", error);
          }
        }

        send({ type: "agent", agent: "chief", status: "completed", detail: "Mission complete." });

        let artifacts: any[] = [];
        let artifactDedupe: ReturnType<typeof dedupeOfficeArtifacts> | null = null;
        if (missionId) {
          await persist(() => completeOfficeMission(missionId, qa, final));
          try {
            artifactDedupe = dedupeOfficeArtifacts(plan, outputs);
            artifacts = await createOfficeArtifacts(missionId, artifactDedupe.plan, artifactDedupe.outputs, final, qa);
            await enrichOfficeArtifactEvidence(missionId);
          } catch (error) { console.warn("Artifact generation or evidence enrichment failed", error); }
          if (evaluation) {
            try { await saveMissionEvaluation(missionId, evaluation); } catch (error) { console.warn("Mission evaluation persistence failed", error); }
          }
          try {
            await dispatchAutomationEvent("ai-office.mission.completed" as any, "ai_office_mission", missionId, {
              mission, workspaceId, objective: plan.objective, artifacts: artifacts.length,
              qualityScore: evaluation?.score || null,
            }, "detected", "completed");
          } catch (error) { console.warn("AI Office automation event failed", error); }
          try {
            await notifyOffice({ title: "AI Office mission completed", body: `${plan.objective} · ${artifacts.length} deliverable${artifacts.length === 1 ? "" : "s"} ready.`, type: "success", missionId });
          } catch {}
        }

        send({
          type: "done", missionId: missionId || null, mission, plan, outputs, qa, final, artifacts, evaluation,
          artifactDedupe: artifactDedupe ? { removed: artifactDedupe.removed } : null,
          correctiveRound,
          agents: ["chief", ...plan.tasks.map((task) => task.agent), "qa"].map((id) => OFFICE_AGENT_MAP[id as OfficeAgentId]),
        });
      } catch (error) {
        console.error("AI Office mission failed", error);
        const message = error instanceof Error ? error.message : "Unexpected mission failure.";
        if (missionId) await persist(() => failOfficeMission(missionId, message));
        send({ type: "error", missionId: missionId || null, error: message });
      } finally {
        if (missionId && usageRecords.length) {
          try { await persistOfficeTelemetry(missionId, usageRecords); } catch (error) { console.warn("AI Office usage telemetry unavailable", error); }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

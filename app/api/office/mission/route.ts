import { NextRequest } from "next/server";
import { gatherContext } from "@/lib/ai-context";
import {
  OFFICE_AGENT_MAP,
  planOfficeMission,
  reviewOfficeMission,
  runOfficeAgent,
  synthesizeOfficeMission,
  type OfficeAgentId,
  type OfficePlanTask,
} from "@/lib/office-agents";
import {
  addOfficeAgentRun,
  completeOfficeMission,
  createOfficeMission,
  failOfficeMission,
  saveOfficePlan,
  setOfficeTaskStatus,
} from "@/lib/office-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MissionRequest = {
  mission?: string;
  grounded?: boolean;
  maxAgents?: number;
};

function safeMission(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 12000) : "";
}

function needsInput(output: string) {
  const match = output.match(/(?:^|\n)\s*NEEDS_INPUT\s*:\s*(.+?)(?:\n|$)/i);
  return match?.[1]?.trim() || "";
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

  const maxAgents = Math.max(2, Math.min(Number(body.maxAgents) || 6, 8));
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      const outputs: Record<string, string> = {};
      const failed = new Set<string>();
      let missionId = "";

      const persist = async (work: () => Promise<unknown>) => {
        try { await work(); } catch (error) { console.warn("AI Office persistence unavailable", error); }
      };

      try {
        await persist(async () => { missionId = await createOfficeMission(mission); });
        send({ type: "mission", missionId: missionId || null });
        send({ type: "agent", agent: "chief", status: "working", detail: "Understanding the mission and assembling the team…" });

        const context = body.grounded === false
          ? { matches: [], snapshot: null, block: "" }
          : await gatherContext(mission, { workspace: "AI Office" });
        const sources = context.matches.map((match, index) => ({
          index: index + 1,
          id: match.id,
          title: match.title,
          category: match.category,
          customerName: match.customerName,
        }));
        send({ type: "context", grounded: Boolean(context.block), sources });

        const plan = await planOfficeMission(mission, context.block, maxAgents);
        send({ type: "plan", plan });
        if (missionId) await persist(() => saveOfficePlan(missionId, plan, Boolean(context.block), sources.length));

        for (const task of plan.tasks) {
          send({ type: "agent", agent: task.agent, taskId: task.id, status: "queued", detail: task.title });
        }
        send({ type: "agent", agent: "chief", status: "completed", detail: "Mission plan ready. Independent workstreams will run in parallel." });

        const pending = new Map(plan.tasks.map((task) => [task.id, task]));
        let attention: { task: OfficePlanTask; question: string } | null = null;

        while (pending.size && !attention) {
          // Any task whose dependency failed can never safely run.
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
              const output = await runOfficeAgent({
                agentId: task.agent,
                mission,
                task: {
                  ...task,
                  instruction: `${task.instruction}\n\nIf a critical factual input is genuinely required and cannot be inferred safely, write exactly one line starting with NEEDS_INPUT: followed by the question. Do not invent the missing value.`,
                },
                contextBlock: context.block,
                dependencyOutputs,
              });
              const question = needsInput(output);
              if (question) {
                send({ type: "agent", agent: task.agent, taskId: task.id, status: "blocked", detail: question, output });
                if (missionId) {
                  await persist(() => setOfficeTaskStatus(missionId, task.id, "waiting_input", output, question));
                  await persist(() => addOfficeAgentRun(missionId, task.agent, "waiting_input", question, task.id, output, Date.now() - started));
                }
                return { task, output, question };
              }

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
              send({ type: "agent", agent: task.agent, taskId: task.id, status: "failed", detail: `${task.title} failed.` });
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
          send({
            type: "attention",
            missionId: missionId || null,
            taskId: attention.task.id,
            agent: attention.task.agent,
            question: attention.question,
            detail: "Mission paused instead of guessing a critical input.",
          });
          send({ type: "paused", missionId: missionId || null, reason: "needs_input" });
          return;
        }

        send({ type: "agent", agent: "qa", status: "working", detail: "Checking contradictions, assumptions and missing evidence…" });
        const qa = await reviewOfficeMission(mission, plan, outputs, context.block);
        send({ type: "agent", agent: "qa", status: "completed", detail: "Review complete.", output: qa });

        send({ type: "agent", agent: "chief", status: "working", detail: "Synthesizing the final deliverable…" });
        const final = await synthesizeOfficeMission({ mission, plan, outputs, qa, contextBlock: context.block });
        send({ type: "agent", agent: "chief", status: "completed", detail: "Mission complete." });
        if (missionId) await persist(() => completeOfficeMission(missionId, qa, final));
        send({
          type: "done",
          missionId: missionId || null,
          mission,
          plan,
          outputs,
          qa,
          final,
          agents: ["chief", ...plan.tasks.map((task) => task.agent), "qa"].map((id) => OFFICE_AGENT_MAP[id as OfficeAgentId]),
        });
      } catch (error) {
        console.error("AI Office mission failed", error);
        const message = error instanceof Error ? error.message : "Unexpected mission failure.";
        if (missionId) await persist(() => failOfficeMission(missionId, message));
        send({ type: "error", missionId: missionId || null, error: message });
      } finally {
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

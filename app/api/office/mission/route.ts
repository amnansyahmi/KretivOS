import { NextRequest } from "next/server";
import { gatherContext } from "@/lib/ai-context";
import {
  OFFICE_AGENT_MAP,
  planOfficeMission,
  reviewOfficeMission,
  runOfficeAgent,
  synthesizeOfficeMission,
  type OfficeAgentId,
} from "@/lib/office-agents";

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

      try {
        send({ type: "agent", agent: "chief", status: "working", detail: "Understanding the mission and assembling the team…" });

        const context = body.grounded === false
          ? { matches: [], snapshot: null, block: "" }
          : await gatherContext(mission, { workspace: "AI Office" });

        send({
          type: "context",
          grounded: Boolean(context.block),
          sources: context.matches.map((match, index) => ({
            index: index + 1,
            id: match.id,
            title: match.title,
            category: match.category,
            customerName: match.customerName,
          })),
        });

        const plan = await planOfficeMission(mission, context.block, maxAgents);
        send({ type: "plan", plan });

        for (const task of plan.tasks) {
          send({ type: "agent", agent: task.agent, taskId: task.id, status: "queued", detail: task.title });
        }
        send({ type: "agent", agent: "chief", status: "completed", detail: "Mission plan ready." });

        for (const task of plan.tasks) {
          const unmet = task.dependsOn.filter((dependencyId) => !outputs[dependencyId]);
          if (unmet.length) {
            send({
              type: "agent",
              agent: task.agent,
              taskId: task.id,
              status: "blocked",
              detail: `Waiting for: ${unmet.join(", ")}`,
            });
            continue;
          }

          send({ type: "agent", agent: task.agent, taskId: task.id, status: "working", detail: task.title });
          const dependencyOutputs = task.dependsOn
            .map((dependencyId) => outputs[dependencyId] ? `### ${dependencyId}\n${outputs[dependencyId]}` : "")
            .filter(Boolean)
            .join("\n\n");

          try {
            outputs[task.id] = await runOfficeAgent({
              agentId: task.agent,
              mission,
              task,
              contextBlock: context.block,
              dependencyOutputs,
            });
            send({
              type: "agent",
              agent: task.agent,
              taskId: task.id,
              status: "completed",
              detail: task.title,
              output: outputs[task.id],
            });
          } catch (error) {
            console.error(`AI Office agent ${task.agent} failed`, error);
            outputs[task.id] = "Agent execution failed. The Chief should treat this workstream as unavailable.";
            send({
              type: "agent",
              agent: task.agent,
              taskId: task.id,
              status: "failed",
              detail: `${task.title} failed.`,
            });
          }
        }

        send({ type: "agent", agent: "qa", status: "working", detail: "Checking contradictions, assumptions and missing evidence…" });
        const qa = await reviewOfficeMission(mission, plan, outputs, context.block);
        send({ type: "agent", agent: "qa", status: "completed", detail: "Review complete.", output: qa });

        send({ type: "agent", agent: "chief", status: "working", detail: "Synthesizing the final deliverable…" });
        const final = await synthesizeOfficeMission({ mission, plan, outputs, qa, contextBlock: context.block });
        send({ type: "agent", agent: "chief", status: "completed", detail: "Mission complete." });
        send({
          type: "done",
          mission,
          plan,
          outputs,
          qa,
          final,
          agents: ["chief", ...plan.tasks.map((task) => task.agent), "qa"].map((id) => OFFICE_AGENT_MAP[id as OfficeAgentId]),
        });
      } catch (error) {
        console.error("AI Office mission failed", error);
        send({ type: "error", error: error instanceof Error ? error.message : "Unexpected mission failure." });
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

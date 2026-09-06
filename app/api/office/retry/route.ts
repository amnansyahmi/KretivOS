import { runOfficeAgent, type OfficeAgentId } from "@/lib/office-agents";
import { getDatabase } from "@/lib/db";
import { retryOfficeOperation } from "@/lib/office-hardening";
import {
  addOfficeAgentRun,
  getOfficeMission,
  getOfficeWorkspaceContext,
  setOfficeTaskHumanFeedback,
  setOfficeTaskStatus,
} from "@/lib/office-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let missionId = "";
  let taskKey = "";
  let agentId = "";
  let started = 0;
  try {
    const body = await request.json();
    missionId = String(body.missionId || "").trim();
    taskKey = String(body.taskKey || "").trim();
    const feedback = String(body.feedback || "").trim().slice(0, 5000);
    if (!missionId || !taskKey || !feedback) return Response.json({ error: "missionId, taskKey and feedback are required." }, { status: 400 });

    const detail: any = await getOfficeMission(missionId);
    if (!detail) return Response.json({ error: "Mission not found." }, { status: 404 });
    const task: any = detail.tasks.find((item: any) => item.task_key === taskKey);
    if (!task) return Response.json({ error: "Task not found." }, { status: 404 });
    agentId = String(task.agent_id || "");

    await setOfficeTaskHumanFeedback(missionId, taskKey, feedback);
    await setOfficeTaskStatus(missionId, taskKey, "working");
    const contextBlock = await getOfficeWorkspaceContext(detail.mission.workspace_id || null);
    const dependencyOutputs = (Array.isArray(task.depends_on) ? task.depends_on : [])
      .map((id: string) => {
        const upstream = detail.tasks.find((item: any) => item.task_key === id);
        return upstream?.output ? `### ${id}\n${upstream.output}` : "";
      })
      .filter(Boolean)
      .join("\n\n");

    started = Date.now();
    const output = await retryOfficeOperation(
      () => runOfficeAgent({
        agentId: task.agent_id as OfficeAgentId,
        mission: String(detail.mission.mission || ""),
        task: {
          id: task.task_key,
          agent: task.agent_id as OfficeAgentId,
          title: task.title,
          instruction: [
            task.instruction,
            `HUMAN FEEDBACK FOR THIS REVISION:\n${feedback}`,
            "Revise the work directly. Preserve correct evidence and do not defend the previous answer.",
            "For externally verifiable factual claims, preserve or improve the Evidence section. Do not introduce unsupported facts during a revision.",
          ].join("\n\n"),
          dependsOn: Array.isArray(task.depends_on) ? task.depends_on : [],
        },
        contextBlock,
        dependencyOutputs,
      }),
      { attempts: 2 },
    );
    if (!output.trim()) throw new Error("Agent revision returned an empty output.");

    await setOfficeTaskStatus(missionId, taskKey, "completed", output);
    await addOfficeAgentRun(missionId, task.agent_id, "completed", `Revised after feedback: ${feedback.slice(0, 120)}`, taskKey, output, Date.now() - started);

    const sql = getDatabase();
    await sql`
      update ai_office_artifacts set content = ${output}, version = version + 1,
        status = case when status = 'executed' then 'pending_approval' else status end, updated_at = now()
      where id = (
        select id from ai_office_artifacts where mission_id = ${missionId}::uuid and agent_id = ${task.agent_id}
        order by created_at desc limit 1
      )
    `;
    return Response.json({ ok: true, output });
  } catch (error) {
    console.error("AI Office retry error", error);
    const message = error instanceof Error ? error.message : "Unable to retry agent.";
    if (missionId && taskKey) {
      try { await setOfficeTaskStatus(missionId, taskKey, "failed"); } catch {}
      if (agentId) {
        try { await addOfficeAgentRun(missionId, agentId, "failed", "Targeted revision failed after safe retry.", taskKey, undefined, started ? Date.now() - started : undefined); } catch {}
      }
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

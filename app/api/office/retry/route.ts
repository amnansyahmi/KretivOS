import { runOfficeAgent, type OfficeAgentId } from "@/lib/office-agents";
import { getDatabase } from "@/lib/db";
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
  try {
    const body = await request.json();
    const missionId = String(body.missionId || "").trim();
    const taskKey = String(body.taskKey || "").trim();
    const feedback = String(body.feedback || "").trim();
    if (!missionId || !taskKey || !feedback) return Response.json({ error: "missionId, taskKey and feedback are required." }, { status: 400 });

    const detail: any = await getOfficeMission(missionId);
    if (!detail) return Response.json({ error: "Mission not found." }, { status: 404 });
    const task: any = detail.tasks.find((item: any) => item.task_key === taskKey);
    if (!task) return Response.json({ error: "Task not found." }, { status: 404 });

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

    const started = Date.now();
    const output = await runOfficeAgent({
      agentId: task.agent_id as OfficeAgentId,
      mission: String(detail.mission.mission || ""),
      task: {
        id: task.task_key,
        agent: task.agent_id as OfficeAgentId,
        title: task.title,
        instruction: `${task.instruction}\n\nHUMAN FEEDBACK FOR THIS REVISION:\n${feedback}\n\nRevise the work directly. Preserve correct evidence and do not defend the previous answer.`,
        dependsOn: Array.isArray(task.depends_on) ? task.depends_on : [],
      },
      contextBlock,
      dependencyOutputs,
    });
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
    return Response.json({ error: error instanceof Error ? error.message : "Unable to retry agent." }, { status: 500 });
  }
}

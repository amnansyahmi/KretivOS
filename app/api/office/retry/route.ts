import { runOfficeAgent, type OfficeAgentId } from "@/lib/office-agents";
import { getDatabase } from "@/lib/db";
import { retryOfficeOperation } from "@/lib/office-hardening";
import { getRelevantOfficeWorkspaceContext } from "@/lib/office-memory";
import { persistOfficeTelemetry, type OfficeUsageRecord } from "@/lib/office-telemetry";
import {
  addOfficeAgentRun,
  addOfficeEvent,
  getOfficeMission,
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
  const usageRecords: OfficeUsageRecord[] = [];
  const reportUsage = (record: OfficeUsageRecord) => usageRecords.push(record);
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
    const query = `${detail.mission.mission || ""}\nRevision feedback: ${feedback}`;
    const contextBlock = await getRelevantOfficeWorkspaceContext(detail.mission.workspace_id || null, query);
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
            "Remove duplicated recommendations and stay strictly inside this specialist's ownership.",
            "For externally verifiable factual claims, preserve or improve the Evidence section. Do not introduce unsupported facts during a revision.",
          ].join("\n\n"),
          dependsOn: Array.isArray(task.depends_on) ? task.depends_on : [],
        },
        contextBlock,
        dependencyOutputs,
      }, reportUsage),
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

    const staleTasks = await sql`
      with recursive downstream(task_key, agent_id) as (
        select task_key, agent_id from ai_office_tasks
         where mission_id = ${missionId}::uuid and depends_on ? ${taskKey}
        union
        select t.task_key, t.agent_id from ai_office_tasks t
        join downstream d on t.depends_on ? d.task_key
         where t.mission_id = ${missionId}::uuid
      )
      update ai_office_tasks set stale = true, updated_at = now()
       where mission_id = ${missionId}::uuid and task_key in (select task_key from downstream)
      returning task_key, agent_id
    `;

    const staleAgents = [...new Set((staleTasks as any[]).map((row) => String(row.agent_id)).filter(Boolean))];
    if (staleAgents.length) {
      const staleArtifacts = await sql`
        update ai_office_artifacts set status = 'stale', updated_at = now()
         where mission_id = ${missionId}::uuid and agent_id = any(${staleAgents}::text[])
           and status not in ('rejected')
        returning id::text
      `;
      const staleArtifactIds = (staleArtifacts as any[]).map((row) => String(row.id));
      if (staleArtifactIds.length) {
        await sql`
          update ai_office_approvals set status = 'superseded', decision_note = 'Upstream agent work changed; regenerate dependent work before approval.',
            resolved_at = now(), updated_at = now()
           where artifact_id = any(${staleArtifactIds}::uuid[]) and status = 'pending'
        `;
      }
    }

    await addOfficeEvent(missionId, detail.mission.workspace_id || null, "agent.revised", {
      taskKey,
      agentId: task.agent_id,
      feedback: feedback.slice(0, 500),
      staleTasks: (staleTasks as any[]).map((row) => row.task_key),
    }, "Kretivco Team");

    if (usageRecords.length) await persistOfficeTelemetry(missionId, usageRecords);
    return Response.json({ ok: true, output, staleTasks: (staleTasks as any[]).map((row) => row.task_key) });
  } catch (error) {
    console.error("AI Office retry error", error);
    const message = error instanceof Error ? error.message : "Unable to retry agent.";
    if (missionId && usageRecords.length) {
      try { await persistOfficeTelemetry(missionId, usageRecords); } catch {}
    }
    if (missionId && taskKey) {
      try { await setOfficeTaskStatus(missionId, taskKey, "failed"); } catch {}
      if (agentId) {
        try { await addOfficeAgentRun(missionId, agentId, "failed", "Targeted revision failed after safe retry.", taskKey, undefined, started ? Date.now() - started : undefined); } catch {}
      }
      try { await addOfficeEvent(missionId, null, "agent.revision_failed", { taskKey, agentId, error: message.slice(0, 500) }, "Kretivco Team"); } catch {}
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

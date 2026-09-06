import { getDatabase } from "@/lib/db";
import type { OfficePlan } from "@/lib/office-agents";

const ORGANIZATION_ID = "org-kretivco";

export async function createOfficeMission(mission: string) {
  const sql = getDatabase();
  const title = mission.replace(/\s+/g, " ").trim().slice(0, 120);
  const rows = await sql`
    insert into ai_office_missions (organization_id, title, mission, status, started_at)
    values (${ORGANIZATION_ID}, ${title}, ${mission}, 'planning', now())
    returning id::text
  `;
  return String(rows[0]?.id || "");
}

export async function saveOfficePlan(missionId: string, plan: OfficePlan, grounded: boolean, sourceCount: number) {
  const sql = getDatabase();
  await sql`
    update ai_office_missions
       set mission_type = ${plan.missionType}, objective = ${plan.objective}, summary = ${plan.summary},
           grounded = ${grounded}, source_count = ${sourceCount}, status = 'running', updated_at = now()
     where id = ${missionId}::uuid
  `;
  for (const task of plan.tasks) {
    await sql`
      insert into ai_office_tasks (mission_id, task_key, agent_id, title, instruction, depends_on, status)
      values (${missionId}::uuid, ${task.id}, ${task.agent}, ${task.title}, ${task.instruction}, ${JSON.stringify(task.dependsOn)}::jsonb, 'queued')
      on conflict (mission_id, task_key) do update set
        agent_id = excluded.agent_id, title = excluded.title, instruction = excluded.instruction,
        depends_on = excluded.depends_on, status = 'queued', updated_at = now()
    `;
  }
}

export async function setOfficeTaskStatus(missionId: string, taskKey: string, status: string, output?: string, inputRequest?: string) {
  const sql = getDatabase();
  await sql`
    update ai_office_tasks
       set status = ${status}, output = coalesce(${output ?? null}, output), input_request = coalesce(${inputRequest ?? null}, input_request),
           started_at = case when ${status} = 'working' and started_at is null then now() else started_at end,
           completed_at = case when ${status} in ('completed','failed') then now() else completed_at end,
           updated_at = now()
     where mission_id = ${missionId}::uuid and task_key = ${taskKey}
  `;
}

export async function addOfficeAgentRun(missionId: string, agentId: string, status: string, detail: string, taskKey?: string, output?: string, durationMs?: number) {
  const sql = getDatabase();
  await sql`
    insert into ai_office_agent_runs (mission_id, task_id, agent_id, status, detail, output, duration_ms)
    values (
      ${missionId}::uuid,
      (select id from ai_office_tasks where mission_id = ${missionId}::uuid and task_key = ${taskKey || ""} limit 1),
      ${agentId}, ${status}, ${detail}, ${output ?? null}, ${durationMs ?? null}
    )
  `;
}

export async function completeOfficeMission(missionId: string, qa: string, final: string) {
  const sql = getDatabase();
  await sql`
    update ai_office_missions
       set status = 'completed', qa_output = ${qa}, final_output = ${final}, completed_at = now(), updated_at = now()
     where id = ${missionId}::uuid
  `;
}

export async function failOfficeMission(missionId: string, error: string) {
  const sql = getDatabase();
  await sql`
    update ai_office_missions set status = 'failed', error = ${error}, completed_at = now(), updated_at = now()
     where id = ${missionId}::uuid
  `;
}

export async function listOfficeMissions(limit = 20) {
  const sql = getDatabase();
  return await sql`
    select id::text, title, mission_type, objective, status, grounded, source_count,
           created_at::text, completed_at::text,
           (select count(*)::int from ai_office_tasks t where t.mission_id = m.id) as task_count,
           (select count(*)::int from ai_office_tasks t where t.mission_id = m.id and t.status = 'completed') as completed_tasks
      from ai_office_missions m
     where organization_id = ${ORGANIZATION_ID}
     order by created_at desc
     limit ${Math.max(1, Math.min(limit, 100))}
  `;
}

export async function getOfficeMission(id: string) {
  const sql = getDatabase();
  const mission = await sql`select * from ai_office_missions where id = ${id}::uuid and organization_id = ${ORGANIZATION_ID} limit 1`;
  if (!mission[0]) return null;
  const tasks = await sql`select id::text, task_key, agent_id, title, instruction, depends_on, status, output, input_request, human_input, started_at::text, completed_at::text from ai_office_tasks where mission_id = ${id}::uuid order by created_at, task_key`;
  const runs = await sql`select id::text, agent_id, status, detail, output, duration_ms, created_at::text from ai_office_agent_runs where mission_id = ${id}::uuid order by created_at`;
  return { mission: mission[0], tasks, runs };
}

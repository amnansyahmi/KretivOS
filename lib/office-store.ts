import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/db";
import type { OfficePlan } from "@/lib/office-agents";

const ORGANIZATION_ID = "org-kretivco";
let schemaPromise: Promise<void> | null = null;

export type OfficeBudgetMode = "economy" | "balanced" | "max_quality";

export async function ensureOfficeSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const sql = getDatabase();
    await sql`create extension if not exists pgcrypto`;
    await sql`
      create table if not exists ai_office_missions (
        id uuid primary key default gen_random_uuid(), organization_id text not null default 'org-kretivco',
        title text not null, mission text not null, mission_type text, objective text, summary text,
        status text not null default 'planning', grounded boolean not null default false, source_count integer not null default 0,
        qa_output text, final_output text, error text, created_at timestamptz not null default now(),
        started_at timestamptz, completed_at timestamptz, updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists ai_office_tasks (
        id uuid primary key default gen_random_uuid(), mission_id uuid not null references ai_office_missions(id) on delete cascade,
        task_key text not null, agent_id text not null, title text not null, instruction text not null,
        depends_on jsonb not null default '[]'::jsonb, status text not null default 'queued', output text,
        input_request text, human_input text, started_at timestamptz, completed_at timestamptz,
        updated_at timestamptz not null default now(), unique(mission_id, task_key)
      )
    `;
    await sql`
      create table if not exists ai_office_agent_runs (
        id uuid primary key default gen_random_uuid(), mission_id uuid not null references ai_office_missions(id) on delete cascade,
        task_id uuid references ai_office_tasks(id) on delete cascade, agent_id text not null, status text not null,
        detail text, output text, duration_ms integer, created_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists ai_office_workspaces (
        id uuid primary key default gen_random_uuid(), organization_id text not null default 'org-kretivco',
        customer_id text references customers(id) on delete set null, brand_id text references brands(id) on delete set null,
        name text not null, summary text, goals jsonb not null default '[]'::jsonb,
        context jsonb not null default '{}'::jsonb, status text not null default 'active',
        created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      )
    `;
    await sql`alter table ai_office_missions add column if not exists workspace_id uuid references ai_office_workspaces(id) on delete set null`;
    await sql`alter table ai_office_missions add column if not exists parent_mission_id uuid references ai_office_missions(id) on delete set null`;
    await sql`alter table ai_office_missions add column if not exists budget_mode text not null default 'balanced'`;
    await sql`alter table ai_office_missions add column if not exists quality_score numeric(5,2)`;
    await sql`alter table ai_office_missions add column if not exists evaluation jsonb not null default '{}'::jsonb`;
    await sql`alter table ai_office_missions add column if not exists total_tokens integer not null default 0`;
    await sql`alter table ai_office_missions add column if not exists estimated_cost numeric(12,6) not null default 0`;
    await sql`alter table ai_office_missions add column if not exists execution_mode text not null default 'interactive'`;
    await sql`alter table ai_office_tasks add column if not exists retry_count integer not null default 0`;
    await sql`alter table ai_office_tasks add column if not exists last_feedback text`;
    await sql`alter table ai_office_tasks add column if not exists stale boolean not null default false`;
    await sql`
      create table if not exists ai_office_artifacts (
        id uuid primary key default gen_random_uuid(), mission_id uuid not null references ai_office_missions(id) on delete cascade,
        workspace_id uuid references ai_office_workspaces(id) on delete set null, agent_id text not null, artifact_type text not null,
        title text not null, content text not null, payload jsonb not null default '{}'::jsonb,
        evidence jsonb not null default '[]'::jsonb, confidence numeric(5,2), status text not null default 'draft',
        destination text, destination_id text, version integer not null default 1,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists ai_office_approvals (
        id uuid primary key default gen_random_uuid(), mission_id uuid not null references ai_office_missions(id) on delete cascade,
        artifact_id uuid references ai_office_artifacts(id) on delete cascade, action_key text not null default 'publish',
        title text not null, summary text, status text not null default 'pending', requested_by text not null default 'ai-office',
        resolved_by text, decision_note text, created_at timestamptz not null default now(), resolved_at timestamptz,
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists ai_office_feedback (
        id uuid primary key default gen_random_uuid(), organization_id text not null default 'org-kretivco',
        target_type text not null, target_id text not null, agent_id text, rating integer, comment text,
        created_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists ai_office_events (
        id uuid primary key default gen_random_uuid(), mission_id uuid references ai_office_missions(id) on delete cascade,
        workspace_id uuid references ai_office_workspaces(id) on delete set null, event_type text not null,
        actor text not null default 'system', payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists ai_office_jobs (
        id uuid primary key default gen_random_uuid(), organization_id text not null default 'org-kretivco',
        workspace_id uuid references ai_office_workspaces(id) on delete set null, mission_id uuid references ai_office_missions(id) on delete set null,
        job_type text not null, payload jsonb not null default '{}'::jsonb, status text not null default 'queued', attempts integer not null default 0,
        max_attempts integer not null default 3, run_after timestamptz not null default now(), locked_at timestamptz,
        completed_at timestamptz, error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists ai_office_watchers (
        id uuid primary key default gen_random_uuid(), organization_id text not null default 'org-kretivco',
        workspace_id uuid references ai_office_workspaces(id) on delete cascade, name text not null, mission_prompt text not null,
        cadence text not null default 'weekly', next_run_at timestamptz, last_run_at timestamptz,
        status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      )
    `;
    await sql`create index if not exists ai_office_missions_created_idx on ai_office_missions(organization_id, created_at desc)`;
    await sql`create index if not exists ai_office_tasks_mission_idx on ai_office_tasks(mission_id, status)`;
    await sql`create index if not exists ai_office_artifact_mission_idx on ai_office_artifacts(mission_id, created_at desc)`;
    await sql`create index if not exists ai_office_approval_status_idx on ai_office_approvals(status, created_at desc)`;
    await sql`create index if not exists ai_office_job_queue_idx on ai_office_jobs(status, run_after)`;
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

export async function syncOfficeWorkspaces() {
  await ensureOfficeSchema();
  const sql = getDatabase();
  const customers = await sql`
    select c.id, c.name, c.industry, c.status, c.notes,
           b.id as brand_id, b.name as brand_name, b.description as brand_description, b.website_url
      from customers c left join brands b on b.customer_id = c.id
     where c.organization_id = ${ORGANIZATION_ID}
     order by c.name, b.name
  `;
  for (const row of customers as any[]) {
    const existing = await sql`
      select id from ai_office_workspaces
       where organization_id = ${ORGANIZATION_ID} and customer_id = ${row.id}
         and ((${row.brand_id ?? null}::text is null and brand_id is null) or brand_id = ${row.brand_id ?? null})
       limit 1
    `;
    if (existing.length) continue;
    const name = row.brand_name ? `${row.name} · ${row.brand_name}` : row.name;
    const summary = [row.industry, row.brand_description || row.notes].filter(Boolean).join(" · ");
    await sql`
      insert into ai_office_workspaces (organization_id, customer_id, brand_id, name, summary, context)
      values (${ORGANIZATION_ID}, ${row.id}, ${row.brand_id ?? null}, ${name}, ${summary || null},
        ${JSON.stringify({ website: row.website_url || "", customerStatus: row.status || "" })}::jsonb)
    `;
  }
}

export async function listOfficeWorkspaces() {
  await syncOfficeWorkspaces();
  const sql = getDatabase();
  return await sql`
    select w.id::text, w.name, w.summary, w.status, w.customer_id, w.brand_id, w.goals, w.context,
           c.name as customer_name, c.industry, c.status as customer_status, b.name as brand_name,
           (select count(*)::int from ai_office_missions m where m.workspace_id = w.id) as mission_count,
           (select count(*)::int from ai_office_artifacts a where a.workspace_id = w.id) as artifact_count,
           w.updated_at::text
      from ai_office_workspaces w
      left join customers c on c.id = w.customer_id
      left join brands b on b.id = w.brand_id
     where w.organization_id = ${ORGANIZATION_ID} and w.status = 'active'
     order by w.updated_at desc, w.name
  `;
}

export async function getOfficeWorkspace(id: string) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  const rows = await sql`
    select w.*, c.name as customer_name, c.industry, c.status as customer_status, c.notes as customer_notes,
           b.name as brand_name, b.description as brand_description, b.website_url
      from ai_office_workspaces w
      left join customers c on c.id = w.customer_id
      left join brands b on b.id = w.brand_id
     where w.id = ${id}::uuid and w.organization_id = ${ORGANIZATION_ID} limit 1
  `;
  return rows[0] || null;
}

export async function getOfficeWorkspaceContext(id?: string | null) {
  if (!id) return "";
  const workspace: any = await getOfficeWorkspace(id);
  if (!workspace) return "";
  const sql = getDatabase();
  const [missions, artifacts] = await Promise.all([
    sql`select title, objective, status, quality_score from ai_office_missions where workspace_id = ${id}::uuid order by created_at desc limit 5`,
    sql`select title, artifact_type, content, status from ai_office_artifacts where workspace_id = ${id}::uuid and status <> 'rejected' order by updated_at desc limit 8`,
  ]);
  const lines = [
    `CLIENT WORKSPACE: ${workspace.name}`,
    workspace.industry ? `Industry: ${workspace.industry}` : "",
    workspace.brand_description ? `Brand: ${workspace.brand_description}` : "",
    workspace.website_url ? `Website: ${workspace.website_url}` : "",
    workspace.customer_notes ? `Client notes: ${workspace.customer_notes}` : "",
    workspace.summary ? `Workspace summary: ${workspace.summary}` : "",
    Array.isArray(workspace.goals) && workspace.goals.length ? `Goals: ${workspace.goals.join("; ")}` : "",
    missions.length ? `RECENT MISSIONS:\n${missions.map((m: any) => `- ${m.title}: ${m.objective || ""}${m.quality_score ? ` (quality ${m.quality_score})` : ""}`).join("\n")}` : "",
    artifacts.length ? `REUSABLE DELIVERABLES:\n${artifacts.map((a: any) => `- ${a.title} [${a.artifact_type}]: ${String(a.content || "").slice(0, 500)}`).join("\n")}` : "",
  ];
  return lines.filter(Boolean).join("\n\n").slice(0, 16000);
}

export async function createOfficeMission(mission: string, options: { workspaceId?: string | null; parentMissionId?: string | null; budgetMode?: OfficeBudgetMode; executionMode?: string } = {}) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  const title = mission.replace(/\s+/g, " ").trim().slice(0, 120);
  const rows = await sql`
    insert into ai_office_missions (organization_id, title, mission, status, started_at, workspace_id, parent_mission_id, budget_mode, execution_mode)
    values (${ORGANIZATION_ID}, ${title}, ${mission}, 'planning', now(), ${options.workspaceId ?? null}::uuid,
      ${options.parentMissionId ?? null}::uuid, ${options.budgetMode || "balanced"}, ${options.executionMode || "interactive"})
    returning id::text
  `;
  const id = String(rows[0]?.id || "");
  if (id) await addOfficeEvent(id, options.workspaceId || null, "mission.started", { title, budgetMode: options.budgetMode || "balanced" });
  return id;
}

export async function saveOfficePlan(missionId: string, plan: OfficePlan, grounded: boolean, sourceCount: number) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  await sql`
    update ai_office_missions set mission_type = ${plan.missionType}, objective = ${plan.objective}, summary = ${plan.summary},
      grounded = ${grounded}, source_count = ${sourceCount}, status = 'running', updated_at = now()
    where id = ${missionId}::uuid
  `;
  for (const task of plan.tasks) {
    await sql`
      insert into ai_office_tasks (mission_id, task_key, agent_id, title, instruction, depends_on, status)
      values (${missionId}::uuid, ${task.id}, ${task.agent}, ${task.title}, ${task.instruction}, ${JSON.stringify(task.dependsOn)}::jsonb, 'queued')
      on conflict (mission_id, task_key) do update set agent_id = excluded.agent_id, title = excluded.title,
        instruction = excluded.instruction, depends_on = excluded.depends_on, status = 'queued', stale = false, updated_at = now()
    `;
  }
}

export async function setOfficeTaskStatus(missionId: string, taskKey: string, status: string, output?: string, inputRequest?: string) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  await sql`
    update ai_office_tasks set status = ${status}, output = coalesce(${output ?? null}, output),
      input_request = coalesce(${inputRequest ?? null}, input_request),
      started_at = case when ${status} = 'working' and started_at is null then now() else started_at end,
      completed_at = case when ${status} in ('completed','failed') then now() else completed_at end, updated_at = now()
    where mission_id = ${missionId}::uuid and task_key = ${taskKey}
  `;
}

export async function addOfficeAgentRun(missionId: string, agentId: string, status: string, detail: string, taskKey?: string, output?: string, durationMs?: number) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  await sql`
    insert into ai_office_agent_runs (mission_id, task_id, agent_id, status, detail, output, duration_ms)
    values (${missionId}::uuid,
      (select id from ai_office_tasks where mission_id = ${missionId}::uuid and task_key = ${taskKey || ""} limit 1),
      ${agentId}, ${status}, ${detail}, ${output ?? null}, ${durationMs ?? null})
  `;
}

export async function completeOfficeMission(missionId: string, qa: string, final: string) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  await sql`update ai_office_missions set status = 'completed', qa_output = ${qa}, final_output = ${final}, completed_at = now(), updated_at = now() where id = ${missionId}::uuid`;
  const row: any = (await sql`select workspace_id::text from ai_office_missions where id = ${missionId}::uuid`)[0];
  await addOfficeEvent(missionId, row?.workspace_id || null, "mission.completed", {});
}

export async function failOfficeMission(missionId: string, error: string) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  await sql`update ai_office_missions set status = 'failed', error = ${error}, completed_at = now(), updated_at = now() where id = ${missionId}::uuid`;
}

export async function saveMissionEvaluation(missionId: string, evaluation: Record<string, unknown>) {
  await ensureOfficeSchema();
  const score = Math.max(0, Math.min(100, Number(evaluation.score || 0)));
  const sql = getDatabase();
  await sql`update ai_office_missions set quality_score = ${score || null}, evaluation = ${JSON.stringify(evaluation)}::jsonb, updated_at = now() where id = ${missionId}::uuid`;
}

export async function listOfficeMissions(limit = 20, workspaceId?: string | null) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  if (workspaceId) return await sql`
    select m.id::text, m.title, m.mission_type, m.objective, m.status, m.grounded, m.source_count,
      m.quality_score, m.budget_mode, m.workspace_id::text, m.created_at::text, m.completed_at::text,
      (select count(*)::int from ai_office_tasks t where t.mission_id = m.id) as task_count,
      (select count(*)::int from ai_office_tasks t where t.mission_id = m.id and t.status = 'completed') as completed_tasks,
      (select count(*)::int from ai_office_artifacts a where a.mission_id = m.id) as artifact_count
    from ai_office_missions m where organization_id = ${ORGANIZATION_ID} and workspace_id = ${workspaceId}::uuid
    order by created_at desc limit ${Math.max(1, Math.min(limit, 100))}
  `;
  return await sql`
    select m.id::text, m.title, m.mission_type, m.objective, m.status, m.grounded, m.source_count,
      m.quality_score, m.budget_mode, m.workspace_id::text, m.created_at::text, m.completed_at::text,
      w.name as workspace_name,
      (select count(*)::int from ai_office_tasks t where t.mission_id = m.id) as task_count,
      (select count(*)::int from ai_office_tasks t where t.mission_id = m.id and t.status = 'completed') as completed_tasks,
      (select count(*)::int from ai_office_artifacts a where a.mission_id = m.id) as artifact_count
    from ai_office_missions m left join ai_office_workspaces w on w.id = m.workspace_id
    where m.organization_id = ${ORGANIZATION_ID} order by m.created_at desc limit ${Math.max(1, Math.min(limit, 100))}
  `;
}

export async function getOfficeMission(id: string) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  const mission = await sql`
    select m.*, m.id::text, m.workspace_id::text, m.parent_mission_id::text, w.name as workspace_name,
      w.customer_id, w.brand_id from ai_office_missions m left join ai_office_workspaces w on w.id = m.workspace_id
    where m.id = ${id}::uuid and m.organization_id = ${ORGANIZATION_ID} limit 1
  `;
  if (!mission[0]) return null;
  const [tasks, runs, artifacts, approvals, events] = await Promise.all([
    sql`select id::text, task_key, agent_id, title, instruction, depends_on, status, output, input_request, human_input, retry_count, last_feedback, stale, started_at::text, completed_at::text from ai_office_tasks where mission_id = ${id}::uuid order by created_at, task_key`,
    sql`select id::text, agent_id, status, detail, output, duration_ms, created_at::text from ai_office_agent_runs where mission_id = ${id}::uuid order by created_at`,
    sql`select id::text, agent_id, artifact_type, title, content, payload, evidence, confidence, status, destination, destination_id, version, created_at::text, updated_at::text from ai_office_artifacts where mission_id = ${id}::uuid order by created_at`,
    sql`select id::text, artifact_id::text, action_key, title, summary, status, requested_by, resolved_by, decision_note, created_at::text, resolved_at::text from ai_office_approvals where mission_id = ${id}::uuid order by created_at desc`,
    sql`select id::text, event_type, actor, payload, created_at::text from ai_office_events where mission_id = ${id}::uuid order by created_at`,
  ]);
  return { mission: mission[0], tasks, runs, artifacts, approvals, events };
}

const artifactTypeByAgent: Record<string, string> = {
  research: "research_report", business: "strategy", marketing: "funnel_strategy", content: "content_plan",
  pricing: "pricing_strategy", sales: "sales_playbook", proposal: "proposal", product: "prd", ux: "ux_spec",
  architect: "architecture", frontend: "technical_spec", backend: "technical_spec", security: "security_review",
  qa: "qa_review", chief: "executive_plan",
};

const approvalTypes = new Set(["strategy", "funnel_strategy", "content_plan", "pricing_strategy", "sales_playbook", "proposal", "prd", "ux_spec", "architecture", "technical_spec", "executive_plan"]);

export async function createOfficeArtifacts(missionId: string, plan: OfficePlan, outputs: Record<string, string>, final: string, qa: string) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  const mission: any = (await sql`select workspace_id::text from ai_office_missions where id = ${missionId}::uuid`)[0];
  const created: any[] = [];
  const items = [
    ...plan.tasks.map((task) => ({ agent: task.agent, type: artifactTypeByAgent[task.agent] || "work_product", title: task.title, content: outputs[task.id] || "" })),
    { agent: "qa", type: "qa_review", title: "QA review", content: qa },
    { agent: "chief", type: "executive_plan", title: plan.objective || "Executive mission plan", content: final },
  ].filter((item) => item.content.trim());

  for (const item of items) {
    const status = approvalTypes.has(item.type) ? "pending_approval" : "ready";
    const rows = await sql`
      insert into ai_office_artifacts (mission_id, workspace_id, agent_id, artifact_type, title, content, status)
      values (${missionId}::uuid, ${mission.workspace_id || null}::uuid, ${item.agent}, ${item.type}, ${item.title}, ${item.content}, ${status})
      returning id::text, artifact_type, title, status
    `;
    const artifact: any = rows[0];
    created.push(artifact);
    if (status === "pending_approval") {
      await sql`
        insert into ai_office_approvals (mission_id, artifact_id, action_key, title, summary)
        values (${missionId}::uuid, ${artifact.id}::uuid, 'execute', ${`Approve ${item.title}`}, ${`Allow AI Office to publish this ${item.type.replaceAll("_", " ")} into KretivOS.`})
      `;
    }
  }
  return created;
}

export async function listOfficeArtifacts(options: { workspaceId?: string | null; missionId?: string | null; limit?: number } = {}) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  const limit = Math.max(1, Math.min(options.limit || 50, 200));
  if (options.missionId) return await sql`select a.*, a.id::text, a.mission_id::text, a.workspace_id::text, m.title as mission_title from ai_office_artifacts a join ai_office_missions m on m.id = a.mission_id where a.mission_id = ${options.missionId}::uuid order by a.updated_at desc limit ${limit}`;
  if (options.workspaceId) return await sql`select a.*, a.id::text, a.mission_id::text, a.workspace_id::text, m.title as mission_title from ai_office_artifacts a join ai_office_missions m on m.id = a.mission_id where a.workspace_id = ${options.workspaceId}::uuid order by a.updated_at desc limit ${limit}`;
  return await sql`select a.*, a.id::text, a.mission_id::text, a.workspace_id::text, m.title as mission_title, w.name as workspace_name from ai_office_artifacts a join ai_office_missions m on m.id = a.mission_id left join ai_office_workspaces w on w.id = a.workspace_id order by a.updated_at desc limit ${limit}`;
}

export async function listOfficeApprovals(limit = 100) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  return await sql`
    select p.*, p.id::text, p.artifact_id::text, p.mission_id::text, a.artifact_type, a.agent_id, a.content,
      a.status as artifact_status, m.title as mission_title, w.name as workspace_name
    from ai_office_approvals p join ai_office_artifacts a on a.id = p.artifact_id
    join ai_office_missions m on m.id = p.mission_id left join ai_office_workspaces w on w.id = m.workspace_id
    order by case when p.status = 'pending' then 0 else 1 end, p.created_at desc limit ${Math.max(1, Math.min(limit, 300))}
  `;
}

export async function resolveOfficeApproval(id: string, status: "approved" | "rejected", note = "") {
  await ensureOfficeSchema();
  const sql = getDatabase();
  const rows = await sql`
    update ai_office_approvals set status = ${status}, resolved_by = 'Kretivco Team', decision_note = ${note || null}, resolved_at = now(), updated_at = now()
    where id = ${id}::uuid and status = 'pending' returning artifact_id::text, mission_id::text
  `;
  if (!rows[0]) return null;
  await sql`update ai_office_artifacts set status = ${status === "approved" ? "approved" : "rejected"}, updated_at = now() where id = ${rows[0].artifact_id}::uuid`;
  return rows[0] as any;
}

export async function executeOfficeArtifact(artifactId: string) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  const rows = await sql`
    select a.*, a.id::text, a.mission_id::text, a.workspace_id::text, w.customer_id, w.brand_id, w.name as workspace_name
      from ai_office_artifacts a left join ai_office_workspaces w on w.id = a.workspace_id
     where a.id = ${artifactId}::uuid limit 1
  `;
  const artifact: any = rows[0];
  if (!artifact) throw new Error("Artifact not found.");
  if (artifact.status !== "approved" && artifact.status !== "ready") throw new Error("Artifact requires approval before execution.");

  let destination = "knowledge";
  let destinationId = "";
  if (artifact.artifact_type === "funnel_strategy") {
    if (!artifact.customer_id) throw new Error("Select a client workspace before creating a funnel.");
    destination = "funnel";
    destinationId = randomUUID();
    await sql`
      insert into funnels (id, customer_id, brand_id, playbook_key, name, objective, audience, offer, summary, status, source, metadata)
      values (${destinationId}, ${artifact.customer_id}, ${artifact.brand_id || null}, 'ai-office', ${artifact.title}, ${artifact.title}, null, null,
        ${artifact.content}, 'Draft', 'ai-office', ${JSON.stringify({ aiOfficeArtifactId: artifact.id, missionId: artifact.mission_id })}::jsonb)
    `;
    const stageSpecs = [["TOFU", "Awareness"], ["MOFU", "Consideration"], ["BOFU", "Conversion"], ["RETENTION", "Retention"]];
    for (let i = 0; i < stageSpecs.length; i += 1) {
      await sql`insert into funnel_stages (id, funnel_id, stage_key, title, objective, sort_order) values (${randomUUID()}, ${destinationId}, ${stageSpecs[i][0]}, ${stageSpecs[i][1]}, ${`AI Office strategy source: ${artifact.title}`}, ${i})`;
    }
  } else if (["proposal", "prd", "ux_spec", "architecture", "technical_spec", "security_review"].includes(artifact.artifact_type)) {
    destination = "document";
    destinationId = randomUUID();
    await sql`
      insert into generated_documents (id, organization_id, customer_id, title, document_type, status, field_values, rendered_markdown)
      values (${destinationId}, ${ORGANIZATION_ID}, ${artifact.customer_id || null}, ${artifact.title}, ${artifact.artifact_type}, 'Draft',
        ${JSON.stringify({ aiOfficeArtifactId: artifact.id, missionId: artifact.mission_id })}::jsonb, ${artifact.content})
    `;
  } else if (artifact.artifact_type === "executive_plan") {
    destination = "project";
    destinationId = randomUUID();
    await sql`
      insert into projects (id, customer_id, name, status, progress, notes, metadata)
      values (${destinationId}, ${artifact.customer_id || null}, ${artifact.title}, 'Planning', 0, ${artifact.content},
        ${JSON.stringify({ aiOfficeArtifactId: artifact.id, missionId: artifact.mission_id })}::jsonb)
    `;
  } else {
    destinationId = randomUUID();
    await sql`
      insert into knowledge_entries (id, organization_id, customer_id, brand_id, title, category, tags, content, source, metadata)
      values (${destinationId}, ${ORGANIZATION_ID}, ${artifact.customer_id || null}, ${artifact.brand_id || null}, ${artifact.title}, 'AI Office',
        ${["ai-office", artifact.artifact_type]}, ${artifact.content}, 'ai-office',
        ${JSON.stringify({ aiOfficeArtifactId: artifact.id, missionId: artifact.mission_id })}::jsonb)
    `;
  }
  await sql`update ai_office_artifacts set status = 'executed', destination = ${destination}, destination_id = ${destinationId}, updated_at = now() where id = ${artifactId}::uuid`;
  await addOfficeEvent(artifact.mission_id, artifact.workspace_id || null, "artifact.executed", { artifactId, destination, destinationId });
  return { destination, destinationId };
}

export async function recordOfficeFeedback(input: { targetType: string; targetId: string; agentId?: string; rating?: number; comment?: string }) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  const rating = input.rating ? Math.max(1, Math.min(5, Number(input.rating))) : null;
  const rows = await sql`
    insert into ai_office_feedback (organization_id, target_type, target_id, agent_id, rating, comment)
    values (${ORGANIZATION_ID}, ${input.targetType}, ${input.targetId}, ${input.agentId || null}, ${rating}, ${input.comment || null}) returning id::text
  `;
  return rows[0];
}

export async function getOfficeOverview() {
  await ensureOfficeSchema();
  await syncOfficeWorkspaces();
  const sql = getDatabase();
  const [stats, agents, feedback, recent, approvals, artifacts, workspaces] = await Promise.all([
    sql`select count(*)::int as missions, count(*) filter (where status = 'running')::int as active, count(*) filter (where status = 'completed')::int as completed, round(avg(quality_score)::numeric,1) as avg_quality from ai_office_missions where organization_id = ${ORGANIZATION_ID}`,
    sql`select agent_id, count(*)::int as runs, count(*) filter (where status = 'completed')::int as completed, round(avg(duration_ms)::numeric,0)::int as avg_duration_ms from ai_office_agent_runs group by agent_id order by runs desc`,
    sql`select agent_id, round(avg(rating)::numeric,2) as avg_rating, count(*)::int as ratings from ai_office_feedback where rating is not null group by agent_id`,
    listOfficeMissions(12), listOfficeApprovals(20), listOfficeArtifacts({ limit: 20 }), listOfficeWorkspaces(),
  ]);
  const feedbackMap = new Map((feedback as any[]).map((row: any) => [row.agent_id, row]));
  return {
    stats: (stats as any[])[0] || {}, recent, approvals, artifacts, workspaces,
    agents: (agents as any[]).map((row: any) => ({ ...row, avg_rating: feedbackMap.get(row.agent_id)?.avg_rating || null, ratings: feedbackMap.get(row.agent_id)?.ratings || 0 })),
  };
}

export async function addOfficeEvent(missionId: string | null, workspaceId: string | null, eventType: string, payload: Record<string, unknown>, actor = "system") {
  await ensureOfficeSchema();
  const sql = getDatabase();
  await sql`insert into ai_office_events (mission_id, workspace_id, event_type, actor, payload) values (${missionId}::uuid, ${workspaceId}::uuid, ${eventType}, ${actor}, ${JSON.stringify(payload)}::jsonb)`;
}

export async function setOfficeTaskHumanFeedback(missionId: string, taskKey: string, feedback: string) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  await sql`update ai_office_tasks set last_feedback = ${feedback}, retry_count = retry_count + 1, stale = false, updated_at = now() where mission_id = ${missionId}::uuid and task_key = ${taskKey}`;
  await sql`update ai_office_tasks set stale = true, updated_at = now() where mission_id = ${missionId}::uuid and depends_on @> ${JSON.stringify([taskKey])}::jsonb`;
}

export async function enqueueOfficeJob(input: { workspaceId?: string | null; missionId?: string | null; jobType: string; payload: Record<string, unknown>; runAfter?: string | null }) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  const rows = await sql`
    insert into ai_office_jobs (organization_id, workspace_id, mission_id, job_type, payload, run_after)
    values (${ORGANIZATION_ID}, ${input.workspaceId ?? null}::uuid, ${input.missionId ?? null}::uuid, ${input.jobType}, ${JSON.stringify(input.payload)}::jsonb,
      coalesce(${input.runAfter ?? null}::timestamptz, now())) returning id::text
  `;
  return rows[0];
}

export async function claimOfficeJobs(limit = 3) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  return await sql`
    update ai_office_jobs set status = 'running', attempts = attempts + 1, locked_at = now(), updated_at = now()
    where id in (select id from ai_office_jobs where status = 'queued' and run_after <= now() order by run_after for update skip locked limit ${Math.max(1, Math.min(limit, 10))})
    returning id::text, workspace_id::text, mission_id::text, job_type, payload, attempts, max_attempts
  `;
}

export async function finishOfficeJob(id: string, error?: string) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  if (error) await sql`update ai_office_jobs set status = case when attempts >= max_attempts then 'failed' else 'queued' end, error = ${error}, run_after = now() + interval '5 minutes', updated_at = now() where id = ${id}::uuid`;
  else await sql`update ai_office_jobs set status = 'completed', completed_at = now(), updated_at = now() where id = ${id}::uuid`;
}

export async function listOfficeWatchers() {
  await ensureOfficeSchema();
  const sql = getDatabase();
  return await sql`select w.*, w.id::text, w.workspace_id::text, s.name as workspace_name from ai_office_watchers w left join ai_office_workspaces s on s.id = w.workspace_id where w.organization_id = ${ORGANIZATION_ID} order by w.created_at desc`;
}

export async function createOfficeWatcher(input: { workspaceId?: string | null; name: string; missionPrompt: string; cadence: string }) {
  await ensureOfficeSchema();
  const sql = getDatabase();
  const interval = input.cadence === "daily" ? "1 day" : input.cadence === "monthly" ? "1 month" : "7 days";
  const rows = await sql`
    insert into ai_office_watchers (organization_id, workspace_id, name, mission_prompt, cadence, next_run_at)
    values (${ORGANIZATION_ID}, ${input.workspaceId ?? null}::uuid, ${input.name}, ${input.missionPrompt}, ${input.cadence}, now() + ${interval}::interval)
    returning id::text
  `;
  return rows[0];
}

export async function enqueueDueOfficeWatchers() {
  await ensureOfficeSchema();
  const sql = getDatabase();
  const due = await sql`select id::text, workspace_id::text, mission_prompt, cadence from ai_office_watchers where organization_id = ${ORGANIZATION_ID} and status = 'active' and next_run_at <= now() order by next_run_at limit 10`;
  for (const watcher of due as any[]) {
    await enqueueOfficeJob({ workspaceId: watcher.workspace_id, jobType: "mission", payload: { mission: watcher.mission_prompt, workspaceId: watcher.workspace_id, executionMode: "background", budgetMode: "balanced" } });
    const interval = watcher.cadence === "daily" ? "1 day" : watcher.cadence === "monthly" ? "1 month" : "7 days";
    await sql`update ai_office_watchers set last_run_at = now(), next_run_at = now() + ${interval}::interval, updated_at = now() where id = ${watcher.id}::uuid`;
  }
  return due.length;
}

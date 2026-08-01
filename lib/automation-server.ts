import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/db";
import {
  AutomationAction,
  AutomationEvent,
  AutomationRecipe,
  AutomationTrigger,
  DEFAULT_AUTOMATION_RECIPES,
} from "@/lib/automation-engine";
import { isoDate, isoDateFrom } from "@/lib/dates";

const ORGANIZATION_ID = "org-kretivco";
const clean = (value: unknown) => String(value ?? "").trim();
const value = (payload: Record<string, any>, ...keys: string[]) => {
  for (const key of keys) if (payload[key] !== undefined && payload[key] !== null) return payload[key];
  return "";
};
const iso = () => new Date().toISOString();
const date = () => iso().slice(0, 10);

function addDays(input: string, days: number) {
  const next = new Date(`${input}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return isoDateFrom(next);
}

function mapRecipe(row: any): AutomationRecipe {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    workspace: row.workspace,
    trigger: row.trigger_key,
    actions: Array.isArray(row.actions) ? row.actions : [],
    status: row.status,
    approvalRequired: Boolean(row.approval_required),
    system: Boolean(row.is_system),
    runCount: Number(row.run_count || 0),
    lastRun: row.last_run_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row: any): AutomationEvent {
  return {
    id: row.id,
    trigger: row.trigger_key,
    entityId: row.entity_id ?? "",
    occurredAt: row.occurred_at,
    payload: row.payload ?? {},
    source: row.source,
  };
}

export async function ensureAutomationRecipes() {
  const sql = getDatabase();
  for (const recipe of DEFAULT_AUTOMATION_RECIPES) {
    await sql`
      insert into automation_recipes (
        id, organization_id, name, description, workspace, trigger_key, actions,
        status, approval_required, is_system, run_count, created_at, updated_at
      ) values (
        ${recipe.id}, ${ORGANIZATION_ID}, ${recipe.name}, ${recipe.description}, ${recipe.workspace},
        ${recipe.trigger}, ${JSON.stringify(recipe.actions)}::jsonb, ${recipe.status},
        ${recipe.approvalRequired}, true, 0, ${recipe.createdAt}, ${recipe.updatedAt}
      ) on conflict (id) do nothing
    `;
  }
}

export async function listAutomationData() {
  await ensureAutomationRecipes();
  const sql = getDatabase();
  const [recipeRows, runRows, approvalRows, notificationRows] = await Promise.all([
    sql`select * from automation_recipes where organization_id = ${ORGANIZATION_ID} order by is_system desc, updated_at desc`,
    sql`
      select r.*, p.name as recipe_name, e.trigger_key, e.entity_id
      from automation_runs r
      left join automation_recipes p on p.id = r.recipe_id
      left join automation_events e on e.id = r.event_id
      where p.organization_id = ${ORGANIZATION_ID} or p.id is null
      order by r.started_at desc limit 500
    `,
    sql`
      select a.*, p.name as recipe_name, e.trigger_key, e.entity_id, e.source, e.payload, e.occurred_at
      from automation_approvals a
      join automation_recipes p on p.id = a.recipe_id
      join automation_events e on e.id = a.event_id
      where p.organization_id = ${ORGANIZATION_ID}
      order by case when a.status = 'Pending' then 0 else 1 end, a.created_at desc limit 300
    `,
    sql`select * from notifications where organization_id = ${ORGANIZATION_ID} and status <> 'Archived' order by created_at desc limit 500`,
  ]);

  return {
    recipes: recipeRows.map(mapRecipe),
    runs: runRows.map((row: any) => ({
      id: row.id,
      recipeId: row.recipe_id ?? "",
      recipeName: row.recipe_name ?? "Deleted automation",
      eventId: row.event_id ?? "",
      trigger: row.trigger_key ?? "daily.scan",
      entityId: row.entity_id ?? "",
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      status: row.status,
      actions: Array.isArray(row.actions) ? row.actions : [],
      summary: row.summary ?? "",
      error: row.error ?? undefined,
    })),
    approvals: approvalRows.map((row: any) => ({
      id: row.id,
      recipeId: row.recipe_id,
      recipeName: row.recipe_name,
      event: mapEvent({
        id: row.event_id,
        trigger_key: row.trigger_key,
        entity_id: row.entity_id,
        source: row.source,
        payload: row.payload,
        occurred_at: row.occurred_at,
      }),
      status: row.status,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at ?? undefined,
    })),
    notifications: notificationRows.map((row: any) => ({
      id: row.id,
      type: row.type === "warning" ? "Warning" : row.type === "success" ? "Success" : row.type === "reminder" ? "Reminder" : "Info",
      title: row.title,
      description: row.body ?? "",
      href: row.entity_type ? notificationHref(row.entity_type) : undefined,
      entityId: row.entity_id ?? undefined,
      dueDate: isoDate(row.due_at) || undefined,
      read: row.status === "Read",
      createdAt: row.created_at,
    })),
    syncedAt: iso(),
  };
}

function notificationHref(entityType: string) {
  if (entityType === "invoice") return "/sales?tab=invoice";
  if (entityType === "settlement") return "/sales?tab=settlements";
  if (entityType === "project") return "/sales?tab=projects";
  if (entityType === "opportunity") return "/sales?tab=crm";
  if (entityType === "knowledge") return "/knowledge";
  return undefined;
}

export async function saveAutomationRecipe(input: Partial<AutomationRecipe>) {
  await ensureAutomationRecipes();
  const sql = getDatabase();
  const id = clean(input.id) || randomUUID();
  const rows = await sql`
    insert into automation_recipes (
      id, organization_id, name, description, workspace, trigger_key, actions,
      status, approval_required, is_system, run_count
    ) values (
      ${id}, ${ORGANIZATION_ID}, ${clean(input.name)}, ${clean(input.description) || null},
      ${clean(input.workspace) || "General"}, ${clean(input.trigger)},
      ${JSON.stringify(Array.isArray(input.actions) ? input.actions : [])}::jsonb,
      ${input.status === "Paused" ? "Paused" : "Active"}, ${Boolean(input.approvalRequired)},
      ${Boolean(input.system)}, ${Number(input.runCount || 0)}
    ) on conflict (id) do update set
      name = excluded.name, description = excluded.description, workspace = excluded.workspace,
      trigger_key = excluded.trigger_key, actions = excluded.actions, status = excluded.status,
      approval_required = excluded.approval_required, updated_at = now()
    where automation_recipes.organization_id = ${ORGANIZATION_ID}
    returning *
  `;
  if (!rows.length) throw new Error("Automation could not be saved.");
  return mapRecipe(rows[0]);
}

export async function deleteAutomationRecipe(id: string) {
  const sql = getDatabase();
  const rows = await sql`
    delete from automation_recipes where id = ${id} and organization_id = ${ORGANIZATION_ID} and is_system = false returning id
  `;
  if (!rows.length) throw new Error("System automations cannot be deleted. Pause them instead.");
}

async function executeAction(action: AutomationAction, event: AutomationEvent) {
  const sql = getDatabase();
  const payload = event.payload || {};
  const entityId = event.entityId;
  const customerId = clean(value(payload, "customerId", "customer_id"));
  const stamp = iso();

  if (action === "create_onboarding") {
    const id = `auto-onboarding-${entityId}`;
    await sql`
      insert into onboardings (id, customer_id, blueprint, status, target_launch, notes)
      values (${id}, ${entityId}, 'Standard customer onboarding', 'Not started', null, 'Created by server automation.')
      on conflict (id) do nothing
    `;
    const steps = ["Commercial documents approved", "Access and brand assets received", "Delivery workspace created", "Kick-off completed", "Launch readiness approved"];
    for (let index = 0; index < steps.length; index += 1) {
      await sql`
        insert into onboarding_steps (id, onboarding_id, label, is_done, sort_order)
        values (${`${id}-step-${index + 1}`}, ${id}, ${steps[index]}, false, ${index}) on conflict (id) do nothing
      `;
    }
    return "Onboarding checklist ensured.";
  }

  if (action === "create_onboarding_project") {
    await sql`
      insert into projects (id, customer_id, name, status, progress, budget, due_date, owner, notes)
      values (${`auto-onboarding-project-${entityId}`}, ${entityId}, 'Customer onboarding', 'Planning', 0, 0, ${addDays(date(), 14)}, 'Kretivco Team', 'Created by server automation.')
      on conflict (id) do nothing
    `;
    return "Onboarding project ensured.";
  }

  if (action === "create_customer_knowledge") {
    const name = clean(value(payload, "name")) || "Customer";
    const metadata = { owner: "Kretivco Team", reviewIntervalDays: 90, lastReviewedAt: stamp, nextReviewAt: addDays(date(), 90), freshnessStatus: "Current", automation: true };
    await sql`
      insert into knowledge_entries (id, organization_id, customer_id, title, filename, category, tags, content, source, metadata)
      values (
        ${`auto-customer-${entityId}`}, ${ORGANIZATION_ID}, ${entityId}, ${`${name} — Customer Profile`},
        ${`${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-profile.md`}, 'Customer', array['customer','profile'],
        ${`# ${name}\n\n## Company\n\n${clean(value(payload, "legalName", "legal_name")) || name}\n\n## Industry\n\n${clean(value(payload, "industry")) || "To be confirmed"}\n\n## Notes\n\n${clean(value(payload, "notes")) || "Add approved customer context here."}`},
        'automation', ${JSON.stringify(metadata)}::jsonb
      ) on conflict (id) do nothing
    `;
    return "Customer knowledge ensured.";
  }

  if (action === "create_delivery_project") {
    await sql`
      insert into projects (id, customer_id, name, status, progress, budget, due_date, owner, notes)
      values (
        ${`auto-project-opportunity-${entityId}`}, ${customerId}, ${clean(value(payload, "title")) || "Won opportunity delivery"},
        'Planning', 0, ${Number(value(payload, "value") || 0)}, ${addDays(date(), 30)}, 'Kretivco Team', 'Created from an approved won opportunity.'
      ) on conflict (id) do nothing
    `;
    return "Delivery project ensured.";
  }

  if (action === "create_sales_order_draft") {
    await sql`
      insert into sales_documents (id, customer_id, type, title, reference, status, value, issue_date, notes)
      values (
        ${`auto-sales-order-${entityId}`}, ${customerId}, 'Sales Order', ${clean(value(payload, "title")) || "Sales Order"},
        ${`SO-${entityId.slice(0, 8).toUpperCase()}`}, 'Draft', ${Number(value(payload, "value") || 0)}, ${date()}, 'Created from won opportunity; human review required.'
      ) on conflict (id) do nothing
    `;
    return "Draft sales order ensured.";
  }

  if (action === "ensure_income_transaction") {
    // Income is now recorded on the ledger by the invoice and settlement
    // posting paths. This used to insert a `finance_transactions` row as well,
    // which made the same money appear a third time — once here, once from the
    // paid-document action, and once in the journal.
    return "Income is recorded on the ledger by the source document.";
  }

  if (action === "create_invoice_receipt" || action === "create_settlement_receipt") {
    const settlement = action === "create_settlement_receipt";
    const amount = settlement
      ? Number(value(payload, "units") || 0) * Number(value(payload, "feePerUnit", "fee_per_unit") || 0) + Number(value(payload, "adReimbursement", "ad_reimbursement") || 0) + Number(value(payload, "incentive") || 0)
      : Number(value(payload, "value") || 0);
    await sql`
      insert into sales_documents (id, customer_id, type, title, reference, status, value, issue_date, due_date, notes)
      values (
        ${`auto-receipt-${settlement ? "settlement" : "invoice"}-${entityId}`}, ${customerId}, 'Receipt',
        ${settlement ? "Settlement Receipt" : `Receipt — ${clean(value(payload, "title")) || "Invoice"}`},
        ${`RCPT-${entityId.slice(0, 8).toUpperCase()}`}, 'Paid', ${amount}, ${date()}, ${date()}, 'Created by server automation after payment confirmation.'
      ) on conflict (id) do nothing
    `;
    return "Receipt ensured.";
  }

  if (action === "activate_customer") {
    await sql`update customers set status = 'Active', updated_at = now() where id = ${customerId} and organization_id = ${ORGANIZATION_ID}`;
    return "Customer activated.";
  }

  if (action === "activate_customer_projects") {
    await sql`update projects set status = 'Active', updated_at = now() where customer_id = ${customerId} and status = 'Planning'`;
    return "Planning projects activated.";
  }

  if (action === "create_funnel_knowledge") {
    const name = clean(value(payload, "name")) || "Marketing Funnel";
    await sql`
      insert into knowledge_entries (id, organization_id, customer_id, brand_id, title, filename, category, tags, content, source, metadata)
      values (
        ${`auto-funnel-${entityId}`}, ${ORGANIZATION_ID}, ${customerId || null}, ${clean(value(payload, "brandId", "brand_id")) || null},
        ${`${name} — Funnel`}, ${`${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`}, 'Marketing Funnel', array['funnel','marketing'],
        ${`# ${name}\n\n## Objective\n\n${clean(value(payload, "objective"))}\n\n## Audience\n\n${clean(value(payload, "audience"))}\n\n## Offer\n\n${clean(value(payload, "offer"))}\n\n## Summary\n\n${clean(value(payload, "summary"))}`},
        'automation', ${JSON.stringify({ owner: "Marketing", reviewIntervalDays: 60, lastReviewedAt: stamp, nextReviewAt: addDays(date(), 60), freshnessStatus: "Current", automation: true })}::jsonb
      ) on conflict (id) do nothing
    `;
    return "Funnel knowledge ensured.";
  }

  if (action === "create_campaign_project") {
    await sql`
      insert into projects (id, customer_id, name, status, progress, budget, due_date, owner, notes)
      values (${`auto-campaign-${entityId}`}, ${customerId || null}, ${`Campaign · ${clean(value(payload, "name")) || "Marketing"}`}, 'Active', 0, 0, ${addDays(date(), 30)}, 'Kretivco Team', 'Created from active funnel.')
      on conflict (id) do nothing
    `;
    return "Campaign project ensured.";
  }

  if (action === "archive_project_summary" || action === "archive_generated_document") {
    const project = action === "archive_project_summary";
    const title = project ? `${clean(value(payload, "name")) || "Project"} — Completion Summary` : clean(value(payload, "title")) || "Generated Document";
    const content = project
      ? `# ${title}\n\n**Status:** ${clean(value(payload, "status"))}\n**Owner:** ${clean(value(payload, "owner")) || "Kretivco Team"}\n**Due date:** ${clean(value(payload, "dueDate", "due_date")) || "Not set"}\n\n## Completion Notes\n\n${clean(value(payload, "notes"))}`
      : clean(value(payload, "content", "rendered_markdown"));
    await sql`
      insert into knowledge_entries (id, organization_id, customer_id, title, filename, category, tags, content, source, metadata)
      values (
        ${`auto-${project ? "project-summary" : "generated-document"}-${entityId}`}, ${ORGANIZATION_ID}, ${customerId || null}, ${title},
        ${`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`}, ${project ? "Project" : "Generated Document"},
        ${project ? ["project", "completed"] : ["document", "archive"]}, ${content || "No content available."}, 'automation',
        ${JSON.stringify({ owner: "Kretivco Team", reviewIntervalDays: 180, lastReviewedAt: stamp, nextReviewAt: addDays(date(), 180), freshnessStatus: "Current", automation: true })}::jsonb
      ) on conflict (id) do nothing
    `;
    return project ? "Project summary archived." : "Generated document archived.";
  }

  if (action === "create_due_notifications") {
    return createDueNotifications();
  }

  return `${action} completed.`;
}

async function createDueNotifications() {
  const sql = getDatabase();
  const current = date();
  const upcoming = addDays(current, 7);
  const [invoices, settlements, projects, opportunities, knowledge] = await Promise.all([
    sql`select d.*, c.name as customer_name from sales_documents d join customers c on c.id = d.customer_id where c.organization_id = ${ORGANIZATION_ID} and d.type = 'Invoice' and d.status not in ('Paid','Cancelled') and d.due_date <= ${current}`,
    sql`select s.*, c.name as customer_name from settlements s join customers c on c.id = s.customer_id where c.organization_id = ${ORGANIZATION_ID} and s.status <> 'Paid' and s.due_date <= ${current}`,
    sql`select p.*, c.name as customer_name from projects p left join customers c on c.id = p.customer_id where (p.customer_id is null or c.organization_id = ${ORGANIZATION_ID}) and p.status not in ('Completed','On hold') and p.due_date between ${current} and ${upcoming}`,
    sql`select o.*, c.name as customer_name from opportunities o join customers c on c.id = o.customer_id where c.organization_id = ${ORGANIZATION_ID} and o.stage not in ('Won','Lost') and o.due_date <= ${current}`,
    sql`select id, title, metadata from knowledge_entries where organization_id = ${ORGANIZATION_ID}`,
  ]);
  let count = 0;

  const insert = async (id: string, title: string, body: string, type: string, entityType: string, entityId: string, dueAt?: string) => {
    const rows = await sql`
      insert into notifications (id, organization_id, title, body, type, status, entity_type, entity_id, due_at)
      values (${id}, ${ORGANIZATION_ID}, ${title}, ${body}, ${type}, 'Unread', ${entityType}, ${entityId}, ${dueAt || null})
      on conflict (id) do nothing returning id
    `;
    count += rows.length;
  };

  for (const row of invoices as any[]) await insert(`due-invoice-${row.id}`, `Invoice requires attention · ${row.customer_name}`, `${row.title} was due ${row.due_date}.`, "warning", "invoice", row.id, row.due_date);
  for (const row of settlements as any[]) await insert(`due-settlement-${row.id}`, `Settlement due · ${row.customer_name}`, `${row.period_start} to ${row.period_end} requires verification or payment.`, "warning", "settlement", row.id, row.due_date);
  for (const row of projects as any[]) await insert(`due-project-${row.id}`, `Project due soon · ${row.customer_name || "Internal"}`, `${row.name} is due ${row.due_date} and is ${row.progress}% complete.`, "reminder", "project", row.id, row.due_date);
  for (const row of opportunities as any[]) await insert(`due-opportunity-${row.id}`, `CRM follow-up due · ${row.customer_name}`, row.next_action || row.title, "reminder", "opportunity", row.id, row.due_date);
  for (const row of knowledge as any[]) {
    const nextReview = clean(row.metadata?.nextReviewAt);
    if (nextReview && nextReview <= current) await insert(`knowledge-review-${row.id}-${nextReview}`, `Knowledge review due · ${row.title}`, `Review this source before AI continues treating it as current. Due ${nextReview}.`, "warning", "knowledge", row.id, nextReview);
  }
  return `${count} new notification${count === 1 ? "" : "s"} created.`;
}

async function executeRecipe(recipe: AutomationRecipe, event: AutomationEvent, existingRunId?: string) {
  const sql = getDatabase();
  const idempotencyKey = `${recipe.id}:${event.id}`;
  let runId = existingRunId;
  if (!runId) {
    const rows = await sql`
      insert into automation_runs (id, recipe_id, event_id, status, actions, summary, idempotency_key)
      values (${randomUUID()}, ${recipe.id}, ${event.id}, 'Running', ${JSON.stringify(recipe.actions)}::jsonb, 'Server execution started.', ${idempotencyKey})
      on conflict (idempotency_key) do nothing returning id
    `;
    if (!rows.length) return;
    runId = rows[0].id;
  }

  try {
    const summaries: string[] = [];
    for (const action of recipe.actions) summaries.push(await executeAction(action, event));
    await sql`update automation_runs set status = 'Success', summary = ${summaries.join(" ")}, finished_at = now() where id = ${runId}`;
    await sql`update automation_recipes set run_count = run_count + 1, last_run_at = now(), updated_at = now() where id = ${recipe.id}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server automation error";
    await sql`update automation_runs set status = 'Failed', summary = 'Server automation failed.', error = ${message}, finished_at = now() where id = ${runId}`;
  }
}

export async function dispatchAutomationEvent(
  trigger: AutomationTrigger,
  entityType: string,
  entityId: string,
  payload: Record<string, any>,
  source: AutomationEvent["source"] = "detected",
  eventVersion = "state",
) {
  await ensureAutomationRecipes();
  const sql = getDatabase();
  const eventId = `${trigger}:${entityId}:${eventVersion}`;
  const eventRows = await sql`
    insert into automation_events (id, organization_id, trigger_key, entity_type, entity_id, source, payload)
    values (${eventId}, ${ORGANIZATION_ID}, ${trigger}, ${entityType}, ${entityId}, ${source}, ${JSON.stringify(payload)}::jsonb)
    on conflict (id) do update set payload = excluded.payload
    returning *
  `;
  const event = mapEvent(eventRows[0]);
  const recipeRows = await sql`
    select * from automation_recipes where organization_id = ${ORGANIZATION_ID} and status = 'Active' and trigger_key = ${trigger}
  `;

  for (const row of recipeRows as any[]) {
    const recipe = mapRecipe(row);
    const exists = await sql`select id from automation_runs where idempotency_key = ${`${recipe.id}:${event.id}`} limit 1`;
    if (exists.length) continue;
    if (recipe.approvalRequired) {
      const runId = randomUUID();
      await sql`
        insert into automation_runs (id, recipe_id, event_id, status, actions, summary, idempotency_key)
        values (${runId}, ${recipe.id}, ${event.id}, 'Pending approval', ${JSON.stringify(recipe.actions)}::jsonb, 'Waiting for human approval.', ${`${recipe.id}:${event.id}`})
      `;
      await sql`
        insert into automation_approvals (id, recipe_id, event_id, status, requested_by)
        values (${randomUUID()}, ${recipe.id}, ${event.id}, 'Pending', 'KretivOS server')
      `;
    } else {
      await executeRecipe(recipe, event);
    }
  }
  return event;
}

async function latestCandidate(trigger: AutomationTrigger) {
  const sql = getDatabase();
  if (trigger === "customer.created") return (await sql`select * from customers where organization_id = ${ORGANIZATION_ID} order by updated_at desc limit 1`)[0];
  if (trigger === "opportunity.won") return (await sql`select o.* from opportunities o join customers c on c.id = o.customer_id where c.organization_id = ${ORGANIZATION_ID} and o.stage = 'Won' order by o.updated_at desc limit 1`)[0];
  if (trigger === "invoice.paid") return (await sql`select d.* from sales_documents d join customers c on c.id = d.customer_id where c.organization_id = ${ORGANIZATION_ID} and d.type = 'Invoice' and d.status = 'Paid' order by d.updated_at desc limit 1`)[0];
  if (trigger === "settlement.paid") return (await sql`select s.* from settlements s join customers c on c.id = s.customer_id where c.organization_id = ${ORGANIZATION_ID} and s.status = 'Paid' order by s.updated_at desc limit 1`)[0];
  if (trigger === "onboarding.completed") return (await sql`select o.* from onboardings o join customers c on c.id = o.customer_id where c.organization_id = ${ORGANIZATION_ID} and o.status = 'Completed' order by o.updated_at desc limit 1`)[0];
  if (trigger === "project.completed") return (await sql`select p.* from projects p left join customers c on c.id = p.customer_id where (p.customer_id is null or c.organization_id = ${ORGANIZATION_ID}) and p.status = 'Completed' order by p.updated_at desc limit 1`)[0];
  if (trigger === "funnel.created") return (await sql`select f.* from funnels f join customers c on c.id = f.customer_id where c.organization_id = ${ORGANIZATION_ID} order by f.created_at desc limit 1`)[0];
  if (trigger === "funnel.activated") return (await sql`select f.* from funnels f join customers c on c.id = f.customer_id where c.organization_id = ${ORGANIZATION_ID} and f.status = 'Active' order by f.updated_at desc limit 1`)[0];
  if (trigger === "knowledge.created") return (await sql`select * from knowledge_entries where organization_id = ${ORGANIZATION_ID} order by created_at desc limit 1`)[0];
  if (trigger === "document.generated") return (await sql`select * from generated_documents where organization_id = ${ORGANIZATION_ID} order by created_at desc limit 1`)[0];
  if (trigger === "daily.scan") return { id: date(), updated_at: date() };
  return undefined;
}

export async function runAutomationNow(recipeId: string) {
  await ensureAutomationRecipes();
  const sql = getDatabase();
  const rows = await sql`select * from automation_recipes where id = ${recipeId} and organization_id = ${ORGANIZATION_ID}`;
  if (!rows.length) throw new Error("Automation was not found.");
  const recipe = mapRecipe(rows[0]);
  if (recipe.status !== "Active") throw new Error("Activate this automation before running it.");
  const candidate: any = await latestCandidate(recipe.trigger);
  if (!candidate) {
    await sql`
      insert into automation_runs (id, recipe_id, status, actions, summary, idempotency_key, finished_at)
      values (${randomUUID()}, ${recipe.id}, 'Skipped', ${JSON.stringify(recipe.actions)}::jsonb, 'No matching server record is available for this trigger.', ${`manual-empty:${recipe.id}:${Date.now()}`}, now())
    `;
    return;
  }
  const entityId = clean(candidate.id) || date();
  return dispatchAutomationEvent(recipe.trigger, recipe.workspace, entityId, candidate, "manual", `manual-${Date.now()}`);
}

export async function resolveAutomationApproval(id: string, decision: "Approved" | "Rejected") {
  const sql = getDatabase();
  const approvalRows = await sql`
    select a.*, e.id as automation_event_id, e.trigger_key as event_trigger_key,
      e.entity_id as event_entity_id, e.payload as event_payload, e.source as event_source, e.occurred_at as event_occurred_at
    from automation_approvals a
    join automation_recipes p on p.id = a.recipe_id
    join automation_events e on e.id = a.event_id
    where a.id = ${id} and p.organization_id = ${ORGANIZATION_ID} and a.status = 'Pending'
  `;
  if (!approvalRows.length) throw new Error("Pending automation approval was not found.");
  const row: any = approvalRows[0];
  await sql`update automation_approvals set status = ${decision}, resolved_by = 'KretivOS user', resolved_at = now() where id = ${id}`;
  const runRows = await sql`select id from automation_runs where recipe_id = ${row.recipe_id} and event_id = ${row.event_id} and status = 'Pending approval' limit 1`;
  if (decision === "Rejected") {
    if (runRows[0]) await sql`update automation_runs set status = 'Rejected', summary = 'Automation rejected by user.', finished_at = now() where id = ${runRows[0].id}`;
    return;
  }
  const recipeRows = await sql`
    select * from automation_recipes
    where id = ${row.recipe_id} and organization_id = ${ORGANIZATION_ID}
    limit 1
  `;
  if (!recipeRows.length) throw new Error("Automation recipe was not found.");
  const recipe = mapRecipe(recipeRows[0]);
  const event: AutomationEvent = {
    id: row.automation_event_id,
    trigger: row.event_trigger_key,
    entityId: row.event_entity_id,
    payload: row.event_payload ?? {},
    source: row.event_source,
    occurredAt: row.event_occurred_at,
  };
  await executeRecipe(recipe, event, runRows[0]?.id);
}

export async function runDailyAutomationScan() {
  return dispatchAutomationEvent("daily.scan", "company", date(), { id: date(), updatedAt: date() }, "scheduled", date());
}

export async function markServerNotification(id: string, read: boolean) {
  const sql = getDatabase();
  await sql`
    update notifications set status = ${read ? "Read" : "Unread"}, read_at = ${read ? iso() : null}
    where id = ${id} and organization_id = ${ORGANIZATION_ID}
  `;
}

export async function archiveReadNotifications() {
  const sql = getDatabase();
  const rows = await sql`
    update notifications set status = 'Archived'
    where organization_id = ${ORGANIZATION_ID} and status = 'Read'
    returning id
  `;
  return rows.length;
}

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { dispatchAutomationEvent } from "@/lib/automation-server";
import { isIssuedCreditNote, isPostableSalesDocument } from "@/lib/accounting-entries";
import { postSalesInvoice, settleInvoiceInFull } from "@/lib/invoice-posting";
import { postSettlementPayment } from "@/lib/cash-posting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";

type MutationBody = {
  operation: "create" | "update" | "delete" | "action";
  resource?: string;
  id?: string;
  action?: string;
  data?: Record<string, any>;
};

const text = (value: unknown) => String(value ?? "").trim();
const nullable = (value: unknown) => {
  const result = text(value);
  return result || null;
};
const number = (value: unknown) => Number(value || 0);

function customer(row: any) {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name ?? "",
    industry: row.industry ?? "",
    status: row.status,
    contactName: row.primary_contact_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function contact(row: any) {
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    jobTitle: row.job_title ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    isPrimary: Boolean(row.is_primary),
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function brand(row: any) {
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    description: row.description ?? "",
    status: row.status,
    websiteUrl: row.website_url ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function channel(row: any) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status,
    description: row.description ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function opportunity(row: any) {
  return {
    id: row.id,
    customerId: row.customer_id,
    title: row.title,
    stage: row.stage,
    value: Number(row.value),
    probability: Number(row.probability),
    nextAction: row.next_action ?? "",
    dueDate: row.due_date ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function document(row: any) {
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.type,
    title: row.title,
    reference: row.reference ?? "",
    status: row.status,
    value: Number(row.value),
    issueDate: row.issue_date ?? "",
    dueDate: row.due_date ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function transaction(row: any) {
  return {
    id: row.id,
    customerId: row.customer_id ?? "",
    type: row.type,
    category: row.category,
    amount: Number(row.amount),
    date: row.transaction_date,
    status: row.status,
    reference: row.reference ?? "",
    notes: row.notes ?? "",
    sourceType: row.source_type ?? "",
    sourceId: row.source_id ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function settlement(row: any) {
  return {
    id: row.id,
    customerId: row.customer_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    units: Number(row.units),
    feePerUnit: Number(row.fee_per_unit),
    adReimbursement: Number(row.ad_reimbursement),
    incentive: Number(row.incentive),
    status: row.status,
    dueDate: row.due_date ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function project(row: any) {
  return {
    id: row.id,
    customerId: row.customer_id ?? "",
    name: row.name,
    status: row.status,
    progress: Number(row.progress),
    budget: Number(row.budget),
    dueDate: row.due_date ?? "",
    owner: row.owner ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function onboarding(row: any, steps: any[]) {
  return {
    id: row.id,
    customerId: row.customer_id,
    blueprint: row.blueprint,
    status: row.status,
    targetLaunch: row.target_launch ?? "",
    notes: row.notes ?? "",
    steps: steps
      .filter((step) => step.onboarding_id === row.id)
      .map((step) => ({ id: step.id, label: step.label, done: Boolean(step.is_done), sortOrder: Number(step.sort_order) })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function audit(action: string, entityType: string, entityId: string | null, afterData?: unknown) {
  try {
    const sql = getDatabase();
    await sql`
      insert into audit_logs (organization_id, action, entity_type, entity_id, after_data, metadata)
      values (${ORGANIZATION_ID}, ${action}, ${entityType}, ${entityId}, ${afterData ? JSON.stringify(afterData) : null}::jsonb, ${JSON.stringify({ source: "kretivos-api", authentication: "skipped" })}::jsonb)
    `;
  } catch {
    // A failed audit write must not invalidate the primary business operation.
  }
}

/**
 * Recognises revenue as soon as an invoice reaches an issued status.
 *
 * Accrual accounting records the sale when it is invoiced, not when the money
 * arrives — recognising on payment would misstate every period an invoice
 * straddles. Posting is idempotent, so this runs safely on every write.
 *
 * Never throws: recording an invoice must not fail because the ledger is
 * unavailable or the period is closed. A failure leaves the invoice unposted and
 * retryable through the Accounting workspace, and is reported back to the caller.
 */
async function recogniseInvoiceRevenue(result: any) {
  const record = result?.document || result;
  const id = text(record?.id);
  if (!id || !isPostableSalesDocument(text(record?.type), text(record?.status))) return null;

  const outcome = await postSalesInvoice(id);

  // A "Paid" invoice needs both halves: the revenue on issue, and the receipt
  // that clears it. Posting only the first would leave receivables permanently
  // debited for money that has already arrived.
  // Do not clear receivables until the invoice itself is on the ledger. If its
  // issue period is closed (or the accounting schema is not ready), posting a
  // receipt alone would leave a credit in AR with no matching invoice debit.
  //
  // A credit note is excluded outright: it has already reduced receivables, and
  // "Paid" on one means the client's balance was settled by the credit, not
  // that money arrived. Settling it would credit AR a second time.
  const settleable = !isIssuedCreditNote(text(record?.type), text(record?.status));
  const receipt = outcome.status === "failed" || text(record.status) !== "Paid" || !settleable
    ? null
    : await settleInvoiceInFull(id);

  if (outcome.status === "failed") return { posted: false, error: outcome.reason };
  if (receipt?.status === "failed") return { posted: true, error: receipt.reason };
  if (outcome.status === "posted") return { posted: true, entryId: outcome.entryId };
  if (receipt?.status === "posted") return { posted: true, entryId: receipt.entryId };
  return null;
}

async function dispatchBusinessAutomation(operation: string, resource: string, action: string, result: any) {
  try {
    const record = result?.document || result?.settlement || result;
    const id = text(record?.id);
    if (!id) return;
    if (operation === "create" && resource === "customers") {
      await dispatchAutomationEvent("customer.created", "customer", id, record, "detected", "created");
    } else if (resource === "crm" && text(record.stage) === "Won") {
      await dispatchAutomationEvent("opportunity.won", "opportunity", id, record, "detected", "won");
    } else if ((resource === "sales" || action === "mark-invoice-paid") && text(record.type) === "Invoice" && text(record.status) === "Paid") {
      await dispatchAutomationEvent("invoice.paid", "invoice", id, record, "detected", "paid");
    } else if ((resource === "settlements" || action === "mark-settlement-paid") && text(record.status) === "Paid") {
      await dispatchAutomationEvent("settlement.paid", "settlement", id, record, "detected", "paid");
    } else if (resource === "onboarding" && text(record.status) === "Completed") {
      await dispatchAutomationEvent("onboarding.completed", "onboarding", id, record, "detected", "completed");
    } else if (resource === "projects" && text(record.status) === "Completed") {
      await dispatchAutomationEvent("project.completed", "project", id, record, "detected", "completed");
    }
  } catch (error) {
    console.error("Business automation dispatch failed", error);
  }
}

export async function GET() {
  try {
    const sql = getDatabase();
    const [customers, contacts, brands, channels, opportunities, documents, transactions, settlements, projects, onboardings, onboardingSteps] = await Promise.all([
      sql`select * from customers where organization_id = ${ORGANIZATION_ID} order by updated_at desc, name asc`,
      sql`select c.* from contacts c join customers cu on cu.id = c.customer_id where cu.organization_id = ${ORGANIZATION_ID} order by c.is_primary desc, c.name asc`,
      sql`select b.* from brands b join customers c on c.id = b.customer_id where c.organization_id = ${ORGANIZATION_ID} order by b.updated_at desc, b.name asc`,
      sql`select * from marketing_channels where organization_id = ${ORGANIZATION_ID} order by category asc, name asc`,
      sql`select o.* from opportunities o join customers c on c.id = o.customer_id where c.organization_id = ${ORGANIZATION_ID} order by o.updated_at desc`,
      sql`select d.* from sales_documents d join customers c on c.id = d.customer_id where c.organization_id = ${ORGANIZATION_ID} order by d.updated_at desc`,
      sql`select f.* from finance_transactions f left join customers c on c.id = f.customer_id where f.customer_id is null or c.organization_id = ${ORGANIZATION_ID} order by f.transaction_date desc, f.updated_at desc`,
      sql`select s.* from settlements s join customers c on c.id = s.customer_id where c.organization_id = ${ORGANIZATION_ID} order by s.period_end desc, s.updated_at desc`,
      sql`select p.* from projects p left join customers c on c.id = p.customer_id where p.customer_id is null or c.organization_id = ${ORGANIZATION_ID} order by p.updated_at desc`,
      sql`select o.* from onboardings o join customers c on c.id = o.customer_id where c.organization_id = ${ORGANIZATION_ID} order by o.updated_at desc`,
      sql`select s.* from onboarding_steps s join onboardings o on o.id = s.onboarding_id join customers c on c.id = o.customer_id where c.organization_id = ${ORGANIZATION_ID} order by s.sort_order asc, s.created_at asc`,
    ]);

    const payload = {
      customers: customers.map(customer),
      contacts: contacts.map(contact),
      brands: brands.map(brand),
      channels: channels.map(channel),
      opportunities: opportunities.map(opportunity),
      documents: documents.map(document),
      transactions: transactions.map(transaction),
      settlements: settlements.map(settlement),
      projects: projects.map(project),
      onboardings: onboardings.map((row) => onboarding(row, onboardingSteps as any[])),
      syncedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load business data." },
      { status: 500 },
    );
  }
}

async function createResource(resource: string, data: Record<string, any>) {
  const sql = getDatabase();
  const id = text(data.id) || randomUUID();

  switch (resource) {
    case "customers": {
      const rows = await sql`
        insert into customers (id, organization_id, name, legal_name, industry, status, primary_contact_name, email, phone, notes)
        values (${id}, ${ORGANIZATION_ID}, ${text(data.name)}, ${nullable(data.legalName)}, ${nullable(data.industry)}, ${text(data.status) || "Lead"}, ${nullable(data.contactName)}, ${nullable(data.email)}, ${nullable(data.phone)}, ${nullable(data.notes)})
        returning *
      `;
      return customer(rows[0]);
    }
    case "contacts": {
      if (data.isPrimary) await sql`update contacts set is_primary = false where customer_id = ${text(data.customerId)}`;
      const rows = await sql`
        insert into contacts (id, customer_id, name, job_title, email, phone, is_primary, notes)
        values (${id}, ${text(data.customerId)}, ${text(data.name)}, ${nullable(data.jobTitle)}, ${nullable(data.email)}, ${nullable(data.phone)}, ${Boolean(data.isPrimary)}, ${nullable(data.notes)})
        returning *
      `;
      return contact(rows[0]);
    }
    case "brands": {
      const rows = await sql`
        insert into brands (id, customer_id, name, description, status, website_url)
        values (${id}, ${text(data.customerId)}, ${text(data.name)}, ${nullable(data.description)}, ${text(data.status) || "Active"}, ${nullable(data.websiteUrl)})
        returning *
      `;
      return brand(rows[0]);
    }
    case "channels": {
      const rows = await sql`
        insert into marketing_channels (id, organization_id, name, category, status, description)
        values (${id}, ${ORGANIZATION_ID}, ${text(data.name)}, ${text(data.category)}, ${text(data.status) || "Active"}, ${nullable(data.description)})
        returning *
      `;
      return channel(rows[0]);
    }
    case "crm": {
      const rows = await sql`
        insert into opportunities (id, customer_id, title, stage, value, probability, next_action, due_date, notes)
        values (${id}, ${text(data.customerId)}, ${text(data.title)}, ${text(data.stage) || "New"}, ${number(data.value)}, ${number(data.probability)}, ${nullable(data.nextAction)}, ${nullable(data.dueDate)}, ${nullable(data.notes)})
        returning *
      `;
      return opportunity(rows[0]);
    }
    case "sales": {
      const rows = await sql`
        insert into sales_documents (id, customer_id, type, title, reference, status, value, issue_date, due_date, notes)
        values (${id}, ${text(data.customerId)}, ${text(data.type)}, ${text(data.title)}, ${nullable(data.reference)}, ${text(data.status) || "Draft"}, ${number(data.value)}, ${nullable(data.issueDate)}, ${nullable(data.dueDate)}, ${nullable(data.notes)})
        returning *
      `;
      return document(rows[0]);
    }
    case "finance": {
      const rows = await sql`
        insert into finance_transactions (id, customer_id, type, category, amount, transaction_date, status, reference, notes, source_type, source_id)
        values (${id}, ${nullable(data.customerId)}, ${text(data.type)}, ${text(data.category)}, ${number(data.amount)}, ${text(data.date)}, ${text(data.status) || "Pending"}, ${nullable(data.reference)}, ${nullable(data.notes)}, ${nullable(data.sourceType)}, ${nullable(data.sourceId)})
        returning *
      `;
      return transaction(rows[0]);
    }
    case "settlements": {
      const rows = await sql`
        insert into settlements (id, customer_id, period_start, period_end, units, fee_per_unit, ad_reimbursement, incentive, status, due_date, notes)
        values (${id}, ${text(data.customerId)}, ${text(data.periodStart)}, ${text(data.periodEnd)}, ${number(data.units)}, ${number(data.feePerUnit)}, ${number(data.adReimbursement)}, ${number(data.incentive)}, ${text(data.status) || "Draft"}, ${nullable(data.dueDate)}, ${nullable(data.notes)})
        returning *
      `;
      return settlement(rows[0]);
    }
    case "projects": {
      const rows = await sql`
        insert into projects (id, customer_id, name, status, progress, budget, due_date, owner, notes)
        values (${id}, ${nullable(data.customerId)}, ${text(data.name)}, ${text(data.status) || "Planning"}, ${number(data.progress)}, ${number(data.budget)}, ${nullable(data.dueDate)}, ${nullable(data.owner)}, ${nullable(data.notes)})
        returning *
      `;
      return project(rows[0]);
    }
    case "onboarding": {
      const rows = await sql`
        insert into onboardings (id, customer_id, blueprint, status, target_launch, notes)
        values (${id}, ${text(data.customerId)}, ${text(data.blueprint)}, ${text(data.status) || "Not started"}, ${nullable(data.targetLaunch)}, ${nullable(data.notes)})
        returning *
      `;
      const steps = Array.isArray(data.steps) ? data.steps : [];
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        await sql`
          insert into onboarding_steps (id, onboarding_id, label, is_done, sort_order)
          values (${text(step.id) || randomUUID()}, ${id}, ${text(step.label)}, ${Boolean(step.done)}, ${index})
        `;
      }
      const stepRows = await sql`select * from onboarding_steps where onboarding_id = ${id} order by sort_order asc`;
      return onboarding(rows[0], stepRows as any[]);
    }
    default:
      throw new Error(`Unsupported resource: ${resource}`);
  }
}

async function updateResource(resource: string, id: string, data: Record<string, any>) {
  const sql = getDatabase();

  switch (resource) {
    case "customers": {
      const rows = await sql`
        update customers set name = ${text(data.name)}, legal_name = ${nullable(data.legalName)}, industry = ${nullable(data.industry)}, status = ${text(data.status)}, primary_contact_name = ${nullable(data.contactName)}, email = ${nullable(data.email)}, phone = ${nullable(data.phone)}, notes = ${nullable(data.notes)}
        where id = ${id} and organization_id = ${ORGANIZATION_ID} returning *
      `;
      return customer(rows[0]);
    }
    case "contacts": {
      if (data.isPrimary) await sql`update contacts set is_primary = false where customer_id = ${text(data.customerId)} and id <> ${id}`;
      const rows = await sql`
        update contacts set customer_id = ${text(data.customerId)}, name = ${text(data.name)}, job_title = ${nullable(data.jobTitle)}, email = ${nullable(data.email)}, phone = ${nullable(data.phone)}, is_primary = ${Boolean(data.isPrimary)}, notes = ${nullable(data.notes)}
        where id = ${id} returning *
      `;
      return contact(rows[0]);
    }
    case "brands": {
      const rows = await sql`
        update brands set customer_id = ${text(data.customerId)}, name = ${text(data.name)}, description = ${nullable(data.description)}, status = ${text(data.status)}, website_url = ${nullable(data.websiteUrl)}
        where id = ${id} returning *
      `;
      return brand(rows[0]);
    }
    case "channels": {
      const rows = await sql`
        update marketing_channels set name = ${text(data.name)}, category = ${text(data.category)}, status = ${text(data.status)}, description = ${nullable(data.description)}
        where id = ${id} and organization_id = ${ORGANIZATION_ID} returning *
      `;
      return channel(rows[0]);
    }
    case "crm": {
      const rows = await sql`
        update opportunities set customer_id = ${text(data.customerId)}, title = ${text(data.title)}, stage = ${text(data.stage)}, value = ${number(data.value)}, probability = ${number(data.probability)}, next_action = ${nullable(data.nextAction)}, due_date = ${nullable(data.dueDate)}, notes = ${nullable(data.notes)}
        where id = ${id} returning *
      `;
      return opportunity(rows[0]);
    }
    case "sales": {
      const rows = await sql`
        update sales_documents set customer_id = ${text(data.customerId)}, type = ${text(data.type)}, title = ${text(data.title)}, reference = ${nullable(data.reference)}, status = ${text(data.status)}, value = ${number(data.value)}, issue_date = ${nullable(data.issueDate)}, due_date = ${nullable(data.dueDate)}, notes = ${nullable(data.notes)}
        where id = ${id} returning *
      `;
      return document(rows[0]);
    }
    case "finance": {
      const rows = await sql`
        update finance_transactions set customer_id = ${nullable(data.customerId)}, type = ${text(data.type)}, category = ${text(data.category)}, amount = ${number(data.amount)}, transaction_date = ${text(data.date)}, status = ${text(data.status)}, reference = ${nullable(data.reference)}, notes = ${nullable(data.notes)}
        where id = ${id} returning *
      `;
      return transaction(rows[0]);
    }
    case "settlements": {
      const rows = await sql`
        update settlements set customer_id = ${text(data.customerId)}, period_start = ${text(data.periodStart)}, period_end = ${text(data.periodEnd)}, units = ${number(data.units)}, fee_per_unit = ${number(data.feePerUnit)}, ad_reimbursement = ${number(data.adReimbursement)}, incentive = ${number(data.incentive)}, status = ${text(data.status)}, due_date = ${nullable(data.dueDate)}, notes = ${nullable(data.notes)}
        where id = ${id} returning *
      `;
      return settlement(rows[0]);
    }
    case "projects": {
      const rows = await sql`
        update projects set customer_id = ${nullable(data.customerId)}, name = ${text(data.name)}, status = ${text(data.status)}, progress = ${number(data.progress)}, budget = ${number(data.budget)}, due_date = ${nullable(data.dueDate)}, owner = ${nullable(data.owner)}, notes = ${nullable(data.notes)}
        where id = ${id} returning *
      `;
      return project(rows[0]);
    }
    case "onboarding": {
      const rows = await sql`
        update onboardings set customer_id = ${text(data.customerId)}, blueprint = ${text(data.blueprint)}, status = ${text(data.status)}, target_launch = ${nullable(data.targetLaunch)}, notes = ${nullable(data.notes)}
        where id = ${id} returning *
      `;
      await sql`delete from onboarding_steps where onboarding_id = ${id}`;
      const steps = Array.isArray(data.steps) ? data.steps : [];
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        await sql`
          insert into onboarding_steps (id, onboarding_id, label, is_done, sort_order)
          values (${text(step.id) || randomUUID()}, ${id}, ${text(step.label)}, ${Boolean(step.done)}, ${index})
        `;
      }
      const stepRows = await sql`select * from onboarding_steps where onboarding_id = ${id} order by sort_order asc`;
      return onboarding(rows[0], stepRows as any[]);
    }
    default:
      throw new Error(`Unsupported resource: ${resource}`);
  }
}

async function deleteResource(resource: string, id: string) {
  const sql = getDatabase();
  switch (resource) {
    case "customers": await sql`delete from customers where id = ${id} and organization_id = ${ORGANIZATION_ID}`; break;
    case "contacts": await sql`delete from contacts where id = ${id}`; break;
    case "brands": await sql`delete from brands where id = ${id}`; break;
    case "channels": await sql`delete from marketing_channels where id = ${id} and organization_id = ${ORGANIZATION_ID}`; break;
    case "crm": await sql`delete from opportunities where id = ${id}`; break;
    case "sales": await sql`delete from sales_documents where id = ${id}`; break;
    case "finance": await sql`delete from finance_transactions where id = ${id}`; break;
    case "settlements": await sql`delete from settlements where id = ${id}`; break;
    case "projects": await sql`delete from projects where id = ${id}`; break;
    case "onboarding": await sql`delete from onboardings where id = ${id}`; break;
    default: throw new Error(`Unsupported resource: ${resource}`);
  }
  return { id };
}

async function performAction(action: string, id: string) {
  const sql = getDatabase();

  if (action === "mark-document-paid") {
    const rows = await sql`update sales_documents set status = 'Paid' where id = ${id} returning *`;
    if (!rows[0]) throw new Error("Sales document was not found.");
    const doc: any = rows[0];
    // No cash-log row: the invoice and its receipt both post to the ledger from
    // recogniseInvoiceRevenue below, and duplicating them here is exactly what
    // made income appear twice.
    return { document: document(doc) };
  }

  if (action === "advance-settlement") {
    const rows = await sql`
      update settlements
      set status = case status when 'Draft' then 'Verified' when 'Verified' then 'Invoiced' else status end
      where id = ${id} returning *
    `;
    if (!rows[0]) throw new Error("Settlement was not found.");
    return { settlement: settlement(rows[0]) };
  }

  if (action === "mark-settlement-paid") {
    const rows = await sql`update settlements set status = 'Paid' where id = ${id} returning *`;
    if (!rows[0]) throw new Error("Settlement was not found.");
    const item: any = rows[0];
    const total = Number(item.units) * Number(item.fee_per_unit) + Number(item.ad_reimbursement) + Number(item.incentive);
    // Posts to the ledger rather than inserting a cash-log row. Writing both is
    // what let the same income be counted twice, with the Finance tab and the
    // accounting reports giving different answers.
    const ledger = await postSettlementPayment(id);
    return { settlement: settlement(item), total, ...(ledger.status === "failed" ? { ledgerError: ledger.reason } : {}) };
  }

  throw new Error(`Unsupported action: ${action}`);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MutationBody;
    const operation = body.operation;
    const resource = text(body.resource);
    const id = text(body.id);
    const data = body.data ?? {};

    let result: unknown;
    if (operation === "create") result = await createResource(resource, data);
    else if (operation === "update") result = await updateResource(resource, id, data);
    else if (operation === "delete") result = await deleteResource(resource, id);
    else if (operation === "action") result = await performAction(text(body.action), id);
    else throw new Error("Unsupported operation.");

    await audit(operation === "action" ? text(body.action) : operation, resource || "business", id || (result as any)?.id || null, result);
    await dispatchBusinessAutomation(operation, resource, text(body.action), result);
    const ledger = await recogniseInvoiceRevenue(result);
    return NextResponse.json({ ok: true, result, ...(ledger ? { ledger } : {}) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Business operation failed." },
      { status: 400 },
    );
  }
}

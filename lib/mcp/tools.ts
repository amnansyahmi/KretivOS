/**
 * What an MCP client is allowed to ask KretivOS for.
 *
 * Every tool here reads. Nothing creates, updates, approves, sends or deletes:
 * an assistant on the other side of this connection is not the place to approve
 * a quotation from, and a read-only surface is one that cannot be talked into
 * doing damage. Adding a write tool later means gating it behind its own opt-in
 * and marking `readOnly: false` so clients can warn before calling it.
 *
 * The queries mirror the workspace routes rather than inventing a second view of
 * the data, and the payloads are shaped for a model to read: names resolved
 * instead of foreign keys, money as numbers, dates as plain calendar days.
 */

import { operationsSnapshot, searchKnowledge, snapshotLines } from "@/lib/ai-context";
import { getDatabase } from "@/lib/db";
import { isoDate } from "@/lib/dates";
import type { McpTool, McpToolResult } from "@/lib/mcp/protocol";

const ORGANIZATION_ID = "org-kretivco";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Reads a string argument, trimmed and capped. */
function text(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

/** Reads a limit argument, holding it inside something a model can't blow up. */
function limitOf(value: unknown, fallback = DEFAULT_LIMIT) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_LIMIT);
}

/** Reads an enum argument, case-insensitively, ignoring anything unrecognised. */
function oneOf(value: unknown, allowed: readonly string[]) {
  const asked = text(value, 40).toLowerCase();
  return allowed.find((option) => option.toLowerCase() === asked) || "";
}

const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;
const day = (value: unknown) => (value ? isoDate(value as string) : "");

function ok(data: unknown): McpToolResult {
  return { data };
}

const CUSTOMER_STATUSES = ["Lead", "Active", "Paused", "Archived"] as const;
const DOCUMENT_STATUSES = ["Draft", "Sent", "Approved", "Paid", "Overdue", "Cancelled"] as const;
const DOCUMENT_TYPES = [
  "Cash Sale", "Quotation", "Sales Order", "Delivery Order",
  "Proforma Invoice", "Invoice", "Receipt", "Credit Note", "Proposal",
] as const;
const PROJECT_STATUSES = ["Planning", "Active", "Review", "Completed", "On hold"] as const;

/**
 * Resolves a customer by id or by name, so a model that only has "Kedai Kek
 * Ratu" from an earlier answer does not have to guess an opaque id.
 */
async function findCustomer(sql: ReturnType<typeof getDatabase>, idOrName: string) {
  const rows = await sql`
    select * from customers
    where organization_id = ${ORGANIZATION_ID}
      and (id = ${idOrName} or name ilike ${idOrName} or name ilike ${`%${idOrName}%`})
    order by (id = ${idOrName}) desc, (name ilike ${idOrName}) desc, name
    limit 1
  `;
  return rows[0] as any;
}

export const kretivosTools: McpTool[] = [
  {
    name: "search_records",
    title: "Search KretivOS",
    description:
      "Search across customers, opportunities, sales documents, projects and the knowledge library by name, reference or title. Use this first when you only have a name and need the record behind it.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "A name, reference or title. At least two characters." },
        limit: { type: "integer", description: "Maximum hits per record type (1-100, default 5).", minimum: 1, maximum: 100 },
      },
      required: ["query"],
    },
    async run(args) {
      const query = text(args.query, 100);
      if (query.length < 2) return { data: null, failed: "Give at least two characters to search for." };

      const perType = limitOf(args.limit, 5);
      const pattern = `%${query}%`;
      const sql = getDatabase();
      const [customers, opportunities, documents, projects, knowledge] = await Promise.all([
        sql`
          select id, name, industry, status from customers
          where organization_id = ${ORGANIZATION_ID} and (name ilike ${pattern} or industry ilike ${pattern})
          order by (status = 'Active') desc, name limit ${perType}
        `,
        sql`
          select o.id, o.title, o.stage, o.value, o.due_date, c.name as customer_name
          from opportunities o join customers c on c.id = o.customer_id
          where c.organization_id = ${ORGANIZATION_ID} and (o.title ilike ${pattern} or c.name ilike ${pattern})
          order by o.updated_at desc limit ${perType}
        `,
        sql`
          select d.id, d.title, d.type, d.reference, d.status, d.value, d.issue_date, c.name as customer_name
          from sales_documents d join customers c on c.id = d.customer_id
          where c.organization_id = ${ORGANIZATION_ID}
            and (d.title ilike ${pattern} or d.reference ilike ${pattern} or c.name ilike ${pattern})
          order by d.updated_at desc limit ${perType}
        `,
        sql`
          select p.id, p.name, p.status, p.progress, p.due_date, c.name as customer_name
          from projects p left join customers c on c.id = p.customer_id
          where (p.customer_id is null or c.organization_id = ${ORGANIZATION_ID}) and p.name ilike ${pattern}
          order by p.updated_at desc limit ${perType}
        `,
        sql`
          select k.id, k.title, k.category, c.name as customer_name
          from knowledge_entries k left join customers c on c.id = k.customer_id
          where k.organization_id = ${ORGANIZATION_ID}
            and (k.title ilike ${pattern} or exists (select 1 from unnest(k.tags) tag where tag ilike ${pattern}))
          order by k.updated_at desc limit ${perType}
        `,
      ]);

      return ok({
        query,
        customers: customers.map((row: any) => ({
          id: row.id, name: row.name, industry: row.industry ?? "", status: row.status,
        })),
        opportunities: opportunities.map((row: any) => ({
          id: row.id, title: row.title, customer: row.customer_name, stage: row.stage,
          value: money(row.value), dueDate: day(row.due_date),
        })),
        salesDocuments: documents.map((row: any) => ({
          id: row.id, type: row.type, reference: row.reference ?? "", title: row.title,
          customer: row.customer_name, status: row.status, value: money(row.value), issueDate: day(row.issue_date),
        })),
        projects: projects.map((row: any) => ({
          id: row.id, name: row.name, customer: row.customer_name ?? "", status: row.status,
          progress: Number(row.progress || 0), dueDate: day(row.due_date),
        })),
        knowledge: knowledge.map((row: any) => ({
          id: row.id, title: row.title, category: row.category ?? "General", customer: row.customer_name ?? "",
        })),
      });
    },
  },

  {
    name: "get_business_snapshot",
    title: "Business snapshot",
    description:
      "The current state of the business in one call: customers, open pipeline and weighted value, receivables and overdue amounts, settlements, project delivery, cleared cash, and the list of items needing attention. Use this for 'how are we doing' questions before reaching for detail.",
    readOnly: true,
    inputSchema: { type: "object", properties: {} },
    async run() {
      const snapshot = await operationsSnapshot();
      if (!snapshot) {
        return { data: null, failed: "The KretivOS database is not reachable, so there is no snapshot to report." };
      }
      return ok({
        asOf: new Date().toISOString(),
        currency: "MYR",
        ...snapshot,
        // The same figures the workspace briefing reads out, so an assistant and
        // the app cannot describe the same day differently.
        summary: snapshotLines(snapshot),
      });
    },
  },

  {
    name: "search_knowledge",
    title: "Search the knowledge library",
    description:
      "Retrieve passages from the KretivOS knowledge library — strategy, pricing, policy, client background — with their owner and review status. Answer from these passages rather than from memory, and say when a source is overdue for review.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question or topic to retrieve for." },
        limit: { type: "integer", description: "Maximum passages (1-100, default 5).", minimum: 1, maximum: 100 },
      },
      required: ["question"],
    },
    async run(args) {
      const question = text(args.question, 500);
      const matches = await searchKnowledge(question, limitOf(args.limit, 5));
      return ok({
        question,
        found: matches.length,
        note: matches.some((match) => match.freshnessStatus === "Overdue")
          ? "At least one source is overdue for review. Say so when you rely on it."
          : "",
        matches: matches.map((match) => ({
          id: match.id,
          title: match.title,
          category: match.category,
          customer: match.customerName,
          owner: match.owner,
          freshness: match.freshnessStatus,
          nextReviewAt: match.nextReviewAt,
          sections: match.sections,
          sourceUrl: match.sourceUrl,
          excerpt: match.excerpt,
        })),
      });
    },
  },

  {
    name: "list_customers",
    title: "List customers",
    description: "List customer records, optionally filtered by status or industry, newest activity first.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Lead, Active, Paused or Archived.", enum: [...CUSTOMER_STATUSES] },
        industry: { type: "string", description: "Match part of the industry name." },
        limit: { type: "integer", description: "Maximum customers (1-100, default 20).", minimum: 1, maximum: 100 },
      },
    },
    async run(args) {
      const status = oneOf(args.status, CUSTOMER_STATUSES);
      const industry = text(args.industry, 80);
      const sql = getDatabase();
      const rows = await sql`
        select c.*,
          (select count(*)::int from opportunities o where o.customer_id = c.id) as opportunity_count,
          (select count(*)::int from sales_documents d where d.customer_id = c.id) as document_count
        from customers c
        where c.organization_id = ${ORGANIZATION_ID}
          and (${status}::text = '' or c.status = ${status})
          and (${industry}::text = '' or c.industry ilike ${`%${industry}%`})
        order by c.updated_at desc
        limit ${limitOf(args.limit)}
      `;

      return ok({
        filters: { status: status || "any", industry: industry || "any" },
        count: rows.length,
        customers: rows.map((row: any) => ({
          id: row.id,
          name: row.name,
          legalName: row.legal_name ?? "",
          industry: row.industry ?? "",
          status: row.status,
          primaryContact: row.primary_contact_name ?? "",
          email: row.email ?? "",
          phone: row.phone ?? "",
          opportunities: Number(row.opportunity_count || 0),
          salesDocuments: Number(row.document_count || 0),
          updatedAt: row.updated_at,
        })),
      });
    },
  },

  {
    name: "get_customer",
    title: "Customer detail",
    description:
      "Everything on one customer: profile, contacts, brands, open opportunities, sales documents, settlements and projects. Accepts a customer id or a name.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        customer: { type: "string", description: "Customer id, or the customer name (partial names are matched)." },
      },
      required: ["customer"],
    },
    async run(args) {
      const sql = getDatabase();
      const asked = text(args.customer, 160);
      const customer = await findCustomer(sql, asked);
      if (!customer) return { data: null, failed: `No customer matched "${asked}".` };

      const [contacts, brands, opportunities, documents, settlements, projects] = await Promise.all([
        sql`select name, job_title, email, phone, is_primary from contacts where customer_id = ${customer.id} order by is_primary desc, name`,
        sql`select id, name, description, status, website_url from brands where customer_id = ${customer.id} order by name`,
        sql`select id, title, stage, value, probability, next_action, due_date
            from opportunities where customer_id = ${customer.id} order by updated_at desc limit 25`,
        sql`select id, type, reference, title, status, value, issue_date, due_date
            from sales_documents where customer_id = ${customer.id} order by updated_at desc limit 25`,
        sql`select id, period_start, period_end, units, fee_per_unit, ad_reimbursement, incentive, status, due_date
            from settlements where customer_id = ${customer.id} order by period_start desc limit 12`,
        sql`select id, name, status, progress, budget, due_date, owner
            from projects where customer_id = ${customer.id} order by updated_at desc limit 25`,
      ]);

      return ok({
        customer: {
          id: customer.id,
          name: customer.name,
          legalName: customer.legal_name ?? "",
          industry: customer.industry ?? "",
          status: customer.status,
          primaryContact: customer.primary_contact_name ?? "",
          email: customer.email ?? "",
          phone: customer.phone ?? "",
          notes: customer.notes ?? "",
          createdAt: customer.created_at,
          updatedAt: customer.updated_at,
        },
        contacts: contacts.map((row: any) => ({
          name: row.name, jobTitle: row.job_title ?? "", email: row.email ?? "",
          phone: row.phone ?? "", primary: row.is_primary === true,
        })),
        brands: brands.map((row: any) => ({
          id: row.id, name: row.name, description: row.description ?? "", status: row.status, websiteUrl: row.website_url ?? "",
        })),
        opportunities: opportunities.map((row: any) => ({
          id: row.id, title: row.title, stage: row.stage, value: money(row.value),
          probability: Number(row.probability || 0), nextAction: row.next_action ?? "", dueDate: day(row.due_date),
        })),
        salesDocuments: documents.map((row: any) => ({
          id: row.id, type: row.type, reference: row.reference ?? "", title: row.title, status: row.status,
          value: money(row.value), issueDate: day(row.issue_date), dueDate: day(row.due_date),
        })),
        settlements: settlements.map((row: any) => ({
          id: row.id, period: `${day(row.period_start)} to ${day(row.period_end)}`, units: Number(row.units || 0),
          feePerUnit: money(row.fee_per_unit), adReimbursement: money(row.ad_reimbursement),
          incentive: money(row.incentive), status: row.status, dueDate: day(row.due_date),
        })),
        projects: projects.map((row: any) => ({
          id: row.id, name: row.name, status: row.status, progress: Number(row.progress || 0),
          budget: money(row.budget), dueDate: day(row.due_date), owner: row.owner ?? "",
        })),
      });
    },
  },

  {
    name: "list_sales_documents",
    title: "List sales documents",
    description:
      "Quotations, invoices, receipts and the rest, filtered by type, status or customer. Includes the total value of the matched documents, and flags invoices that are past their due date.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Document type, e.g. Quotation or Invoice.", enum: [...DOCUMENT_TYPES] },
        status: { type: "string", description: "Draft, Sent, Approved, Paid, Overdue or Cancelled.", enum: [...DOCUMENT_STATUSES] },
        customer: { type: "string", description: "Customer id or name." },
        overdueOnly: { type: "boolean", description: "Only unpaid documents past their due date." },
        limit: { type: "integer", description: "Maximum documents (1-100, default 20).", minimum: 1, maximum: 100 },
      },
    },
    async run(args) {
      const sql = getDatabase();
      const type = oneOf(args.type, DOCUMENT_TYPES);
      const status = oneOf(args.status, DOCUMENT_STATUSES);
      const asked = text(args.customer, 160);
      const overdueOnly = args.overdueOnly === true;

      let customerId = "";
      if (asked) {
        const customer = await findCustomer(sql, asked);
        if (!customer) return { data: null, failed: `No customer matched "${asked}".` };
        customerId = customer.id;
      }

      const today = isoDate(new Date());
      const rows = await sql`
        select d.*, c.name as customer_name
        from sales_documents d join customers c on c.id = d.customer_id
        where c.organization_id = ${ORGANIZATION_ID}
          and (${type}::text = '' or d.type = ${type})
          and (${status}::text = '' or d.status = ${status})
          and (${customerId}::text = '' or d.customer_id = ${customerId})
          and (${!overdueOnly}::boolean or (d.status not in ('Paid', 'Cancelled') and d.due_date is not null and d.due_date < ${today}::date))
        order by coalesce(d.issue_date, d.created_at::date) desc, d.updated_at desc
        limit ${limitOf(args.limit)}
      `;

      const documents = rows.map((row: any) => ({
        id: row.id,
        type: row.type,
        reference: row.reference ?? "",
        title: row.title,
        customer: row.customer_name,
        status: row.status,
        value: money(row.value),
        issueDate: day(row.issue_date),
        dueDate: day(row.due_date),
        overdue: row.status !== "Paid" && row.status !== "Cancelled" && !!row.due_date && day(row.due_date) < today,
        notes: row.notes ?? "",
      }));

      return ok({
        filters: {
          type: type || "any", status: status || "any",
          customer: asked || "any", overdueOnly,
        },
        count: documents.length,
        totalValue: money(documents.reduce((sum, document) => sum + document.value, 0)),
        currency: "MYR",
        documents,
      });
    },
  },

  {
    name: "list_projects",
    title: "List projects",
    description:
      "Delivery projects with progress, owner, budget and task counts. Flags projects that are past their due date or behind on progress.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Planning, Active, Review, Completed or On hold.", enum: [...PROJECT_STATUSES] },
        customer: { type: "string", description: "Customer id or name." },
        limit: { type: "integer", description: "Maximum projects (1-100, default 20).", minimum: 1, maximum: 100 },
      },
    },
    async run(args) {
      const sql = getDatabase();
      const status = oneOf(args.status, PROJECT_STATUSES);
      const asked = text(args.customer, 160);

      let customerId = "";
      if (asked) {
        const customer = await findCustomer(sql, asked);
        if (!customer) return { data: null, failed: `No customer matched "${asked}".` };
        customerId = customer.id;
      }

      const today = isoDate(new Date());
      const rows = await sql`
        select p.*, c.name as customer_name,
          (select count(*)::int from project_tasks t where t.project_id = p.id) as task_count,
          (select count(*)::int from project_tasks t where t.project_id = p.id and t.status = 'Done') as done_count
        from projects p left join customers c on c.id = p.customer_id
        where (p.customer_id is null or c.organization_id = ${ORGANIZATION_ID})
          and (${status}::text = '' or p.status = ${status})
          and (${customerId}::text = '' or p.customer_id = ${customerId})
        order by p.updated_at desc
        limit ${limitOf(args.limit)}
      `;

      return ok({
        filters: { status: status || "any", customer: asked || "any" },
        count: rows.length,
        projects: rows.map((row: any) => ({
          id: row.id,
          name: row.name,
          customer: row.customer_name ?? "",
          status: row.status,
          progress: Number(row.progress || 0),
          budget: money(row.budget),
          owner: row.owner ?? "",
          dueDate: day(row.due_date),
          overdue: row.status !== "Completed" && !!row.due_date && day(row.due_date) < today,
          tasks: { total: Number(row.task_count || 0), done: Number(row.done_count || 0) },
          notes: row.notes ?? "",
        })),
      });
    },
  },

  {
    name: "get_brand_dna",
    title: "Brand DNA",
    description:
      "The reviewed brand profile for a customer's brand: positioning, audience, personality, tone of voice, messaging, colours, typography, photography direction, approved factual claims and the avoid list. Use it before writing anything in a client's voice, and never contradict the avoid list or invent a claim that is not in the approved list.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        brand: { type: "string", description: "Brand name or id, or the customer name." },
      },
      required: ["brand"],
    },
    async run(args) {
      const sql = getDatabase();
      const asked = text(args.brand, 160);
      const pattern = `%${asked}%`;
      const brands = await sql`
        select b.*, c.name as customer_name
        from brands b join customers c on c.id = b.customer_id
        where c.organization_id = ${ORGANIZATION_ID}
          and (b.id = ${asked} or b.name ilike ${asked} or b.name ilike ${pattern} or c.name ilike ${pattern})
        order by (b.id = ${asked}) desc, (b.name ilike ${asked}) desc, b.name
        limit 1
      `;
      const brand = brands[0] as any;
      if (!brand) return { data: null, failed: `No brand matched "${asked}".` };

      // Approved wins over a newer draft: the point of Brand DNA is that only
      // human-reviewed values speak for the client.
      const profiles = await sql`
        select * from brand_dna_profiles
        where brand_id = ${brand.id}
        order by (status = 'Approved') desc, updated_at desc
        limit 1
      `;
      const profile = profiles[0] as any;
      if (!profile) {
        return {
          data: null,
          failed: `${brand.name} has no Brand DNA profile yet. Ask the team to complete it in the Brand DNA workspace.`,
        };
      }

      return ok({
        brand: {
          id: brand.id, name: brand.name, customer: brand.customer_name,
          description: brand.description ?? "", websiteUrl: brand.website_url ?? "",
        },
        profile: {
          status: profile.status,
          reviewed: profile.status === "Approved",
          completenessScore: Number(profile.completeness_score || 0),
          positioning: profile.positioning ?? "",
          audience: profile.audience ?? "",
          personality: profile.personality ?? "",
          voice: profile.voice ?? "",
          messaging: profile.messaging ?? {},
          colours: Array.isArray(profile.colours) ? profile.colours : [],
          typography: profile.typography ?? {},
          photographyDirection: profile.photography_direction ?? "",
          approvedClaims: Array.isArray(profile.approved_claims) ? profile.approved_claims : [],
          avoidList: Array.isArray(profile.avoid_list) ? profile.avoid_list : [],
          approvedAt: profile.approved_at ?? "",
          updatedAt: profile.updated_at,
        },
        guardrail: profile.status === "Approved"
          ? "This profile is approved. Stay inside the approved claims and respect the avoid list."
          : "This profile is still a draft and has not been reviewed. Treat it as provisional and say so.",
      });
    },
  },
];

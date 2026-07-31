/**
 * Retrieval layer that grounds KretivOS AI features in real company records.
 *
 * Until now every AI route was blind: the chat was explicitly told never to claim
 * access to company records, and the generators only saw whatever the user typed
 * into a form. This module supplies two kinds of grounding:
 *
 *   1. Knowledge retrieval — full-text search over `knowledge_entries`, using the
 *      GIN index that has existed in the schema since the first migration.
 *   2. An operational snapshot — a compact roll-up of pipeline, receivables,
 *      settlements and delivery pulled straight from the shared tables.
 *
 * Both degrade to empty rather than throwing, so an AI feature still answers
 * (ungrounded, and saying so) when the database is unreachable.
 */

import { getDatabase } from "@/lib/db";

const ORGANIZATION_ID = "org-kretivco";

export type KnowledgeMatch = {
  id: string;
  title: string;
  category: string;
  customerName: string;
  excerpt: string;
  rank: number;
};

export type OperationsSnapshot = {
  customers: { total: number; active: number; leads: number };
  pipeline: { open: number; weightedValue: number; totalValue: number; stalled: number };
  receivables: { outstanding: number; overdue: number; overdueCount: number };
  settlements: { open: number; unverified: number; openValue: number };
  projects: { active: number; atRisk: number; overdue: number };
  cash: { income: number; expense: number; net: number };
  attention: string[];
};

const MAX_EXCERPT = 1200;

/** Strips markdown noise so excerpts spend their budget on words, not syntax. */
function excerpt(content: string, limit = MAX_EXCERPT) {
  const text = String(content ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** Words worth searching on, with very short tokens and noise dropped. */
function keywords(question: string) {
  const stop = new Set(["the", "and", "for", "with", "what", "when", "does", "did", "how", "our", "are", "was", "who", "why", "which", "from", "that", "this", "you", "can", "should", "about", "into", "have", "has"]);
  return Array.from(new Set(
    String(question ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stop.has(word)),
  )).slice(0, 12);
}

/**
 * Full-text search over the knowledge library. Falls back to a keyword ILIKE
 * scan when the tsquery matches nothing, which is common for short questions
 * and for proper nouns the English dictionary stems oddly.
 */
export async function searchKnowledge(question: string, limit = 5): Promise<KnowledgeMatch[]> {
  const terms = keywords(question);
  if (!terms.length) return [];

  try {
    const sql = getDatabase();

    // OR the terms rather than using websearch_to_tsquery, which ANDs them: a
    // natural-language question almost always contains at least one word absent
    // from the document ("payment" vs "payable"), and under AND that returns
    // nothing at all. ts_rank still orders by how well each entry matches.
    // Terms are already reduced to [a-z0-9] by keywords(), so this is safe input.
    const tsquery = terms.join(" | ");

    const ranked = await sql`
      select k.id, k.title, k.category, k.content, c.name as customer_name,
             ts_rank(
               to_tsvector('english', coalesce(k.title, '') || ' ' || coalesce(k.content, '')),
               to_tsquery('english', ${tsquery})
             ) as rank
      from knowledge_entries k
      left join customers c on c.id = k.customer_id
      where k.organization_id = ${ORGANIZATION_ID}
        and to_tsvector('english', coalesce(k.title, '') || ' ' || coalesce(k.content, ''))
            @@ to_tsquery('english', ${tsquery})
      order by rank desc, k.updated_at desc
      limit ${limit}
    `;

    if (ranked.length) return ranked.map(toMatch);

    // Nothing matched the parsed query, so try the raw keywords instead.
    const pattern = `%${terms.join("%")}%`;
    const loose = await sql`
      select k.id, k.title, k.category, k.content, c.name as customer_name, 0::float as rank
      from knowledge_entries k
      left join customers c on c.id = k.customer_id
      where k.organization_id = ${ORGANIZATION_ID}
        and (k.title ilike ${pattern} or k.content ilike ${pattern}
             or exists (select 1 from unnest(k.tags) tag where tag ilike any(${terms.map((term) => `%${term}%`)})))
      order by k.updated_at desc
      limit ${limit}
    `;
    return loose.map(toMatch);
  } catch (error) {
    console.error("Knowledge retrieval failed", error);
    return [];
  }
}

function toMatch(row: any): KnowledgeMatch {
  return {
    id: row.id,
    title: row.title,
    category: row.category ?? "General",
    customerName: row.customer_name ?? "",
    excerpt: excerpt(row.content),
    rank: Number(row.rank) || 0,
  };
}

const money = (value: number) => `RM${Number(value || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;

/** A single round trip that rolls up everything the AI needs to reason about the business. */
export async function operationsSnapshot(): Promise<OperationsSnapshot | null> {
  try {
    const sql = getDatabase();
    const [customers, opportunities, documents, settlements, projects, transactions] = await Promise.all([
      sql`select status from customers where organization_id = ${ORGANIZATION_ID}`,
      sql`select o.stage, o.value, o.probability, o.due_date, o.updated_at
          from opportunities o join customers c on c.id = o.customer_id
          where c.organization_id = ${ORGANIZATION_ID}`,
      sql`select d.type, d.status, d.value, d.due_date
          from sales_documents d join customers c on c.id = d.customer_id
          where c.organization_id = ${ORGANIZATION_ID}`,
      sql`select s.status, s.units, s.fee_per_unit, s.ad_reimbursement, s.incentive
          from settlements s join customers c on c.id = s.customer_id
          where c.organization_id = ${ORGANIZATION_ID}`,
      sql`select p.status, p.progress, p.due_date
          from projects p left join customers c on c.id = p.customer_id
          where p.customer_id is null or c.organization_id = ${ORGANIZATION_ID}`,
      sql`select f.type, f.amount, f.status
          from finance_transactions f left join customers c on c.id = f.customer_id
          where f.customer_id is null or c.organization_id = ${ORGANIZATION_ID}`,
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPast = (value: any) => value && new Date(value) < today;
    const staleBefore = new Date(today.getTime() - 14 * 86_400_000);

    const openOpportunities = opportunities.filter((row: any) => !["Won", "Lost"].includes(row.stage));
    const outstandingInvoices = documents.filter((row: any) => row.type === "Invoice" && ["Sent", "Approved", "Overdue"].includes(row.status));
    const overdueInvoices = outstandingInvoices.filter((row: any) => row.status === "Overdue" || isPast(row.due_date));
    const openSettlements = settlements.filter((row: any) => row.status !== "Paid");
    const income = transactions.filter((row: any) => row.type === "Income" && row.status === "Cleared").reduce((sum: number, row: any) => sum + Number(row.amount), 0);
    const expense = transactions.filter((row: any) => row.type === "Expense" && row.status === "Cleared").reduce((sum: number, row: any) => sum + Number(row.amount), 0);

    const snapshot: OperationsSnapshot = {
      customers: {
        total: customers.length,
        active: customers.filter((row: any) => row.status === "Active").length,
        leads: customers.filter((row: any) => row.status === "Lead").length,
      },
      pipeline: {
        open: openOpportunities.length,
        weightedValue: openOpportunities.reduce((sum: number, row: any) => sum + Number(row.value) * Number(row.probability) / 100, 0),
        totalValue: openOpportunities.reduce((sum: number, row: any) => sum + Number(row.value), 0),
        stalled: openOpportunities.filter((row: any) => new Date(row.updated_at) < staleBefore).length,
      },
      receivables: {
        outstanding: outstandingInvoices.reduce((sum: number, row: any) => sum + Number(row.value), 0),
        overdue: overdueInvoices.reduce((sum: number, row: any) => sum + Number(row.value), 0),
        overdueCount: overdueInvoices.length,
      },
      settlements: {
        open: openSettlements.length,
        unverified: settlements.filter((row: any) => row.status === "Draft").length,
        openValue: openSettlements.reduce((sum: number, row: any) => sum + Number(row.units) * Number(row.fee_per_unit) + Number(row.ad_reimbursement) + Number(row.incentive), 0),
      },
      projects: {
        active: projects.filter((row: any) => row.status === "Active").length,
        atRisk: projects.filter((row: any) => row.status === "Active" && Number(row.progress) < 40 && isPast(row.due_date)).length,
        overdue: projects.filter((row: any) => row.status !== "Completed" && isPast(row.due_date)).length,
      },
      cash: { income, expense, net: income - expense },
      attention: [],
    };

    // Concrete, checkable statements rather than leaving the model to infer them.
    if (snapshot.receivables.overdueCount) snapshot.attention.push(`${snapshot.receivables.overdueCount} overdue invoice(s) worth ${money(snapshot.receivables.overdue)}.`);
    if (snapshot.settlements.unverified) snapshot.attention.push(`${snapshot.settlements.unverified} settlement(s) still awaiting verification.`);
    if (snapshot.pipeline.stalled) snapshot.attention.push(`${snapshot.pipeline.stalled} opportunity(ies) untouched for over 14 days.`);
    if (snapshot.projects.overdue) snapshot.attention.push(`${snapshot.projects.overdue} project(s) past their due date.`);
    if (snapshot.cash.net < 0) snapshot.attention.push(`Cleared cash position is negative at ${money(snapshot.cash.net)}.`);

    return snapshot;
  } catch (error) {
    console.error("Operations snapshot failed", error);
    return null;
  }
}

/** Renders the snapshot as compact lines for a prompt. */
export function snapshotLines(snapshot: OperationsSnapshot) {
  return [
    `Customers: ${snapshot.customers.total} total, ${snapshot.customers.active} active, ${snapshot.customers.leads} leads.`,
    `Pipeline: ${snapshot.pipeline.open} open opportunities, ${money(snapshot.pipeline.totalValue)} total, ${money(snapshot.pipeline.weightedValue)} weighted, ${snapshot.pipeline.stalled} stalled over 14 days.`,
    `Receivables: ${money(snapshot.receivables.outstanding)} outstanding, ${money(snapshot.receivables.overdue)} overdue across ${snapshot.receivables.overdueCount} invoice(s).`,
    `Settlements: ${snapshot.settlements.open} open worth ${money(snapshot.settlements.openValue)}, ${snapshot.settlements.unverified} unverified.`,
    `Delivery: ${snapshot.projects.active} active projects, ${snapshot.projects.overdue} overdue, ${snapshot.projects.atRisk} at risk.`,
    `Cleared cash: ${money(snapshot.cash.net)} (income ${money(snapshot.cash.income)}, expense ${money(snapshot.cash.expense)}).`,
  ];
}

/**
 * Builds the grounding block injected into a prompt. Sources are numbered so the
 * model can cite them and the UI can resolve those numbers back to real records.
 */
export function buildContextBlock({ snapshot, matches }: { snapshot: OperationsSnapshot | null; matches: KnowledgeMatch[] }) {
  const sections: string[] = [];

  if (snapshot) {
    sections.push(["CURRENT OPERATIONS (live from the shared database):", ...snapshotLines(snapshot).map((line) => `- ${line}`)].join("\n"));
    if (snapshot.attention.length) {
      sections.push(["NEEDS ATTENTION:", ...snapshot.attention.map((line) => `- ${line}`)].join("\n"));
    }
  }

  if (matches.length) {
    sections.push([
      "KNOWLEDGE LIBRARY EXTRACTS (cite these by number, e.g. [1]):",
      ...matches.map((match, index) => `[${index + 1}] ${match.title}${match.customerName ? ` · ${match.customerName}` : ""} · ${match.category}\n${match.excerpt}`),
    ].join("\n\n"));
  }

  if (!sections.length) return "";
  return sections.join("\n\n");
}

/** Convenience wrapper: retrieve everything relevant to a question in parallel. */
export async function gatherContext(question: string, { knowledge = true, operations = true, limit = 5 } = {}) {
  const [matches, snapshot] = await Promise.all([
    knowledge ? searchKnowledge(question, limit) : Promise.resolve([]),
    operations ? operationsSnapshot() : Promise.resolve(null),
  ]);
  return { matches, snapshot, block: buildContextBlock({ snapshot, matches }) };
}

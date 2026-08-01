/**
 * Cross-workspace search for the command palette.
 *
 * The header search box was a link to /knowledge, so finding a customer meant
 * knowing which of the fourteen workspaces owned it. This searches the record
 * types someone actually navigates by, in one round trip, and returns each hit
 * with the route that opens it.
 *
 * Matching is deliberately plain ILIKE rather than full-text: these are names,
 * references and titles, not prose, and a palette must feel instant on a
 * prefix like "chef" rather than wait for a stemmed match.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const PER_TYPE = 5;

export type SearchHit = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
};

export async function GET(request: NextRequest) {
  const term = String(request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (term.length < 2) return NextResponse.json({ hits: [] });

  const pattern = `%${term}%`;

  try {
    const sql = getDatabase();
    const [customers, opportunities, documents, projects, knowledge] = await Promise.all([
      sql`
        select id, name, industry, status from customers
        where organization_id = ${ORGANIZATION_ID} and (name ilike ${pattern} or industry ilike ${pattern})
        order by (status = 'Active') desc, name limit ${PER_TYPE}
      `,
      sql`
        select o.id, o.title, o.stage, o.value, c.name as customer_name
        from opportunities o join customers c on c.id = o.customer_id
        where c.organization_id = ${ORGANIZATION_ID} and (o.title ilike ${pattern} or c.name ilike ${pattern})
        order by o.updated_at desc limit ${PER_TYPE}
      `,
      sql`
        select d.id, d.title, d.type, d.reference, d.status, c.name as customer_name
        from sales_documents d join customers c on c.id = d.customer_id
        where c.organization_id = ${ORGANIZATION_ID}
          and (d.title ilike ${pattern} or d.reference ilike ${pattern} or c.name ilike ${pattern})
        order by d.updated_at desc limit ${PER_TYPE}
      `,
      sql`
        select p.id, p.name, p.status, p.progress, c.name as customer_name
        from projects p left join customers c on c.id = p.customer_id
        where (p.customer_id is null or c.organization_id = ${ORGANIZATION_ID}) and p.name ilike ${pattern}
        order by p.updated_at desc limit ${PER_TYPE}
      `,
      sql`
        select k.id, k.title, k.category, c.name as customer_name
        from knowledge_entries k left join customers c on c.id = k.customer_id
        where k.organization_id = ${ORGANIZATION_ID}
          and (k.title ilike ${pattern} or exists (select 1 from unnest(k.tags) tag where tag ilike ${pattern}))
        order by k.updated_at desc limit ${PER_TYPE}
      `,
    ]);

    const hits: SearchHit[] = [
      ...customers.map((row: any) => ({
        id: `customer-${row.id}`, type: "Customer", title: row.name,
        subtitle: [row.industry, row.status].filter(Boolean).join(" · "),
        href: "/sales?tab=customers",
      })),
      ...opportunities.map((row: any) => ({
        id: `opportunity-${row.id}`, type: "Opportunity", title: row.title,
        subtitle: [row.customer_name, row.stage].filter(Boolean).join(" · "),
        href: "/sales?tab=crm",
      })),
      ...documents.map((row: any) => ({
        id: `document-${row.id}`, type: row.type || "Document", title: row.title,
        subtitle: [row.customer_name, row.reference, row.status].filter(Boolean).join(" · "),
        href: "/sales?tab=sales",
      })),
      ...projects.map((row: any) => ({
        id: `project-${row.id}`, type: "Project", title: row.name,
        subtitle: [row.customer_name || "Internal", row.status, `${row.progress}%`].filter(Boolean).join(" · "),
        href: "/sales?tab=projects",
      })),
      ...knowledge.map((row: any) => ({
        id: `knowledge-${row.id}`, type: "Knowledge", title: row.title,
        subtitle: [row.customer_name, row.category].filter(Boolean).join(" · "),
        href: `/knowledge?entry=${encodeURIComponent(row.id)}`,
      })),
    ];

    return NextResponse.json({ hits }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Search failed", error);
    // The palette still offers its static destinations, so this degrades to
    // navigation-only rather than an error state.
    return NextResponse.json({ hits: [], error: "Record search is unavailable." }, { status: 503 });
  }
}

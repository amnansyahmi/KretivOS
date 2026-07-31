import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { builtInKnowledge } from "@/lib/knowledge";
import { dispatchAutomationEvent } from "@/lib/automation-server";
// Deleting an entry drops its chunks through the foreign key cascade in 0006.
import { indexKnowledgeEntry, indexStaleEntries } from "@/lib/knowledge-chunks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";

const clean = (value: unknown) => String(value ?? "").trim();
const optional = (value: unknown) => clean(value) || null;
const stringArray = (value: unknown) => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];

function addDays(input: string, days: number) {
  const next = new Date(input);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function freshness(metadata: Record<string, any>) {
  const nextReview = clean(metadata.nextReviewAt);
  if (!nextReview) return "Unscheduled";
  const today = new Date().toISOString().slice(0, 10);
  if (nextReview < today) return "Overdue";
  return nextReview <= addDays(`${today}T00:00:00Z`, 14) ? "Review soon" : "Current";
}

function metadataFor(body: any, current: Record<string, any> = {}) {
  const interval = Math.max(7, Math.min(730, Number(body.reviewIntervalDays || current.reviewIntervalDays || 90)));
  const lastReviewedAt = clean(body.lastReviewedAt || current.lastReviewedAt) || new Date().toISOString();
  const nextReviewAt = clean(body.nextReviewAt) || clean(current.nextReviewAt) || addDays(lastReviewedAt, interval);
  return {
    ...current,
    ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
    owner: clean(body.owner || current.owner) || "Kretivco Team",
    sourceUrl: clean(body.sourceUrl || current.sourceUrl),
    reviewIntervalDays: interval,
    lastReviewedAt,
    nextReviewAt,
  };
}

function mapEntry(row: any) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    title: row.title,
    client: row.customer_name ?? "Kretivco",
    customerId: row.customer_id ?? undefined,
    brandId: row.brand_id ?? undefined,
    brandName: row.brand_name ?? undefined,
    category: row.category,
    tags: Array.isArray(row.tags) ? row.tags : [],
    content: row.content,
    filename: row.filename ?? "knowledge.md",
    source: row.source,
    owner: clean(metadata.owner) || "Kretivco Team",
    sourceUrl: clean(metadata.sourceUrl),
    reviewIntervalDays: Number(metadata.reviewIntervalDays || 90),
    lastReviewedAt: clean(metadata.lastReviewedAt),
    nextReviewAt: clean(metadata.nextReviewAt),
    freshnessStatus: freshness(metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function customerIdForName(name: string) {
  if (!name || name.toLowerCase() === "kretivco") return null;
  const sql = getDatabase();
  const rows = await sql`
    select id from customers
    where organization_id = ${ORGANIZATION_ID} and lower(name) = lower(${name})
    limit 1
  `;
  return rows[0]?.id ?? null;
}

async function verifyLinks(customerId: string | null, brandId: string | null) {
  if (!customerId && brandId) throw new Error("A brand must belong to a customer.");
  if (!customerId) return;
  const sql = getDatabase();
  const customers = await sql`
    select id from customers where id = ${customerId} and organization_id = ${ORGANIZATION_ID}
  `;
  if (!customers.length) throw new Error("Customer was not found.");
  if (brandId) {
    const brands = await sql`select id from brands where id = ${brandId} and customer_id = ${customerId}`;
    if (!brands.length) throw new Error("Brand does not belong to the selected customer.");
  }
}

async function audit(action: string, entityId: string | null, afterData?: unknown) {
  try {
    const sql = getDatabase();
    await sql`
      insert into audit_logs (organization_id, action, entity_type, entity_id, after_data, metadata)
      values (
        ${ORGANIZATION_ID}, ${action}, 'knowledge_entry', ${entityId},
        ${afterData ? JSON.stringify(afterData) : null}::jsonb,
        ${JSON.stringify({ source: "knowledge-api", authentication: "skipped" })}::jsonb
      )
    `;
  } catch {
    // Knowledge writes should not fail only because an audit entry could not be recorded.
  }
}

async function syncBuiltInKnowledge() {
  const sql = getDatabase();
  const existingRows = await sql`
    select id from knowledge_entries where organization_id = ${ORGANIZATION_ID}
  `;
  const existingIds = new Set(existingRows.map((row: any) => String(row.id)));

  for (const entry of builtInKnowledge.filter((item) => !existingIds.has(item.id))) {
    const customerId = await customerIdForName(entry.client);
    await sql`
      insert into knowledge_entries (
        id, organization_id, customer_id, brand_id, title, filename,
        category, tags, content, source, metadata, created_at, updated_at
      )
      values (
        ${entry.id}, ${ORGANIZATION_ID}, ${customerId}, null, ${entry.title}, ${entry.filename},
        ${entry.category},
        array(select jsonb_array_elements_text(${JSON.stringify(entry.tags)}::jsonb)),
        ${entry.content}, ${entry.source}, ${JSON.stringify({ seeded: true, owner: "Kretivco Team", reviewIntervalDays: 90, lastReviewedAt: entry.updatedAt, nextReviewAt: addDays(entry.updatedAt, 90) })}::jsonb,
        ${entry.createdAt}, ${entry.updatedAt}
      )
      on conflict (id) do nothing
    `;
  }

  await sql`
    update knowledge_entries
    set metadata = metadata || jsonb_build_object(
      'owner', coalesce(nullif(metadata->>'owner', ''), 'Kretivco Team'),
      'reviewIntervalDays', case when metadata->>'reviewIntervalDays' ~ '^[0-9]+$' then (metadata->>'reviewIntervalDays')::int else 90 end,
      'lastReviewedAt', coalesce(nullif(metadata->>'lastReviewedAt', ''), updated_at::text),
      'nextReviewAt', coalesce(nullif(metadata->>'nextReviewAt', ''), ((updated_at at time zone 'UTC')::date + 90)::text)
    )
    where organization_id = ${ORGANIZATION_ID}
      and (metadata->>'owner' is null or metadata->>'nextReviewAt' is null)
  `;
}

async function listEntries() {
  await syncBuiltInKnowledge();
  // Backfills the retrieval index for entries created before migration 0006, and
  // for anything edited directly in the database. Bounded so listing stays fast.
  await indexStaleEntries();
  const sql = getDatabase();
  const rows = await sql`
    select
      k.*,
      c.name as customer_name,
      b.name as brand_name
    from knowledge_entries k
    left join customers c on c.id = k.customer_id
    left join brands b on b.id = k.brand_id
    where k.organization_id = ${ORGANIZATION_ID}
    order by k.updated_at desc, k.title asc
  `;
  return rows.map(mapEntry);
}

export async function GET() {
  try {
    return NextResponse.json(
      { entries: await listEntries(), syncedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load knowledge." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const title = clean(body.title);
    const content = clean(body.content);
    if (!title || !content) return NextResponse.json({ error: "Title and content are required." }, { status: 400 });

    const customerId = optional(body.customerId) ?? await customerIdForName(clean(body.client));
    const brandId = optional(body.brandId);
    await verifyLinks(customerId, brandId);

    const id = clean(body.id) || randomUUID();
    const tags = stringArray(body.tags);
    const sql = getDatabase();
    const rows = await sql`
      insert into knowledge_entries (
        id, organization_id, customer_id, brand_id, title, filename,
        category, tags, content, source, metadata
      )
      values (
        ${id}, ${ORGANIZATION_ID}, ${customerId}, ${brandId}, ${title},
        ${optional(body.filename)}, ${clean(body.category) || "General"},
        array(select jsonb_array_elements_text(${JSON.stringify(tags)}::jsonb)),
        ${content}, ${clean(body.source) || "editor"},
        ${JSON.stringify(metadataFor(body))}::jsonb
      )
      returning *
    `;

    const resultRows = await sql`
      select k.*, c.name as customer_name, b.name as brand_name
      from knowledge_entries k
      left join customers c on c.id = k.customer_id
      left join brands b on b.id = k.brand_id
      where k.id = ${id} and k.organization_id = ${ORGANIZATION_ID}
    `;
    const entry = mapEntry(resultRows[0] ?? rows[0]);
    await indexKnowledgeEntry(id, content);
    await audit("create", id, entry);
    try {
      await dispatchAutomationEvent("knowledge.created", "knowledge", id, entry, "detected", "created");
    } catch (error) {
      console.error("Knowledge automation dispatch failed", error);
    }
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create knowledge." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = clean(body.id);
    const title = clean(body.title);
    const content = clean(body.content);
    if (!id || !title || !content) return NextResponse.json({ error: "ID, title and content are required." }, { status: 400 });

    const customerId = optional(body.customerId) ?? await customerIdForName(clean(body.client));
    const brandId = optional(body.brandId);
    await verifyLinks(customerId, brandId);

    const tags = stringArray(body.tags);
    const sql = getDatabase();
    const currentRows = await sql`select metadata from knowledge_entries where id = ${id} and organization_id = ${ORGANIZATION_ID}`;
    const metadata = metadataFor(body, (currentRows[0]?.metadata as Record<string, any>) || {});
    const rows = await sql`
      update knowledge_entries
      set
        customer_id = ${customerId},
        brand_id = ${brandId},
        title = ${title},
        filename = ${optional(body.filename)},
        category = ${clean(body.category) || "General"},
        tags = array(select jsonb_array_elements_text(${JSON.stringify(tags)}::jsonb)),
        content = ${content},
        source = ${clean(body.source) || "editor"},
        metadata = ${JSON.stringify(metadata)}::jsonb
      where id = ${id} and organization_id = ${ORGANIZATION_ID}
      returning id
    `;
    if (!rows.length) return NextResponse.json({ error: "Knowledge record was not found." }, { status: 404 });

    const resultRows = await sql`
      select k.*, c.name as customer_name, b.name as brand_name
      from knowledge_entries k
      left join customers c on c.id = k.customer_id
      left join brands b on b.id = k.brand_id
      where k.id = ${id} and k.organization_id = ${ORGANIZATION_ID}
    `;
    const entry = mapEntry(resultRows[0]);
    await indexKnowledgeEntry(id, content);
    await audit("update", id, entry);
    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update knowledge." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = clean(new URL(request.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "Knowledge ID is required." }, { status: 400 });
    const sql = getDatabase();
    const rows = await sql`
      delete from knowledge_entries
      where id = ${id} and organization_id = ${ORGANIZATION_ID}
      returning id
    `;
    if (!rows.length) return NextResponse.json({ error: "Knowledge record was not found." }, { status: 404 });
    await audit("delete", id);
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete knowledge." },
      { status: 500 },
    );
  }
}

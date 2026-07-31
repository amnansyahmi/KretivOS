/**
 * Shared Content Planner.
 *
 * Replaces the `content-planner` localStorage key, which gave every team member
 * their own private calendar for what is meant to be an agreed publishing plan.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const STATUSES = new Set(["Planned", "Review", "Approved"]);
const clean = (value: unknown, max = 2000) => String(value ?? "").trim().slice(0, max);

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

function mapRow(row: any) {
  return {
    id: row.id,
    date: typeof row.slot_date === "string" ? row.slot_date.slice(0, 10) : new Date(row.slot_date).toISOString().slice(0, 10),
    title: row.title,
    channel: row.channel || "",
    status: row.status,
    notes: row.notes || "",
    customerId: row.customer_id || "",
    updatedAt: row.updated_at,
  };
}

function failure(error: unknown) {
  console.error("Planner request failed", error);
  const message = error instanceof Error ? error.message : "Planner is unavailable.";
  return NextResponse.json(
    {
      error: /planner_entries/i.test(message)
        ? "The planner table is not ready. Apply db/migrations/0007_shared_planner_projection.sql to the Neon database."
        : message,
      entries: [],
    },
    { status: 503 },
  );
}

/** Returns the entries in a date window, defaulting to the current week. */
export async function GET(request: NextRequest) {
  try {
    const from = clean(request.nextUrl.searchParams.get("from"), 10);
    const to = clean(request.nextUrl.searchParams.get("to"), 10);
    const sql = getDatabase();

    const rows = isDate(from) && isDate(to)
      ? await sql`
          select * from planner_entries
          where organization_id = ${ORGANIZATION_ID} and slot_date between ${from} and ${to}
          order by slot_date
        `
      : await sql`
          select * from planner_entries
          where organization_id = ${ORGANIZATION_ID}
            and slot_date >= current_date - interval '30 days'
          order by slot_date
        `;

    return NextResponse.json({ entries: rows.map(mapRow) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

/**
 * Upserts one day's slot. An empty title clears the slot, which is how the grid
 * deletes: the operator empties the box rather than hunting for a delete control.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const date = clean(body.date, 10);
    if (!isDate(date)) return NextResponse.json({ error: "A valid date is required." }, { status: 400 });

    const title = clean(body.title, 600);
    const sql = getDatabase();

    if (!title) {
      await sql`delete from planner_entries where organization_id = ${ORGANIZATION_ID} and slot_date = ${date}`;
      return NextResponse.json({ entry: null, cleared: true });
    }

    const status = STATUSES.has(clean(body.status)) ? clean(body.status) : "Planned";
    const rows = await sql`
      insert into planner_entries (organization_id, slot_date, title, channel, status, notes, customer_id)
      values (
        ${ORGANIZATION_ID}, ${date}, ${title}, ${clean(body.channel, 80)},
        ${status}, ${clean(body.notes, 2000)}, ${clean(body.customerId, 100) || null}
      )
      on conflict (organization_id, slot_date) do update set
        title = excluded.title,
        channel = excluded.channel,
        status = excluded.status,
        notes = excluded.notes,
        customer_id = excluded.customer_id
      returning *
    `;
    return NextResponse.json({ entry: mapRow(rows[0]) });
  } catch (error) {
    return failure(error);
  }
}

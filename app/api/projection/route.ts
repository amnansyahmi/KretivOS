/**
 * Shared financial projection scenario.
 *
 * The company share and headcount inputs were held in `ca-company-pct` and
 * `ca-members` localStorage keys, so two people could read different per-person
 * figures off the same screen. The scenario is now one shared row.
 *
 * This is deliberately still a forecast: it is stored apart from sales,
 * settlements and finance transactions and is never reconciled against them.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";

const number = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function mapRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    companyPct: Number(row.company_pct),
    members: Number(row.members),
    totalFees: Number(row.total_fees),
    totalIncentive: Number(row.total_incentive),
    rows: Array.isArray(row.rows) ? row.rows : [],
    updatedAt: row.updated_at,
  };
}

function failure(error: unknown) {
  console.error("Projection request failed", error);
  const message = error instanceof Error ? error.message : "Projection is unavailable.";
  return NextResponse.json(
    {
      error: /projection_scenarios/i.test(message)
        ? "The projection table is not ready. Apply db/migrations/0007_shared_planner_projection.sql to the Neon database."
        : message,
      scenario: null,
    },
    { status: 503 },
  );
}

export async function GET() {
  try {
    const sql = getDatabase();
    const rows = await sql`
      select * from projection_scenarios
      where organization_id = ${ORGANIZATION_ID}
      order by is_default desc, updated_at desc
      limit 1
    `;
    if (!rows.length) return NextResponse.json({ scenario: null });
    return NextResponse.json({ scenario: mapRow(rows[0]) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const sql = getDatabase();

    const current = await sql`
      select * from projection_scenarios where organization_id = ${ORGANIZATION_ID}
      order by is_default desc, updated_at desc limit 1
    `;
    if (!current.length) {
      return NextResponse.json(
        { error: "No projection scenario exists. Apply db/migrations/0007_shared_planner_projection.sql." },
        { status: 404 },
      );
    }

    const existing = mapRow(current[0]);
    const companyPct = clamp(number(body.companyPct, existing.companyPct), 0, 100);
    const members = Math.round(clamp(number(body.members, existing.members), 1, 50));

    const rows = await sql`
      update projection_scenarios
      set company_pct = ${companyPct},
          members = ${members},
          total_fees = ${number(body.totalFees, existing.totalFees)},
          total_incentive = ${number(body.totalIncentive, existing.totalIncentive)}
      where id = ${existing.id} and organization_id = ${ORGANIZATION_ID}
      returning *
    `;
    return NextResponse.json({ scenario: mapRow(rows[0]) });
  } catch (error) {
    return failure(error);
  }
}

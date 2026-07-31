import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const clean = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

function href(entityType: string) {
  return ({
    hr_leave: "/hr?section=leave",
    hr_claim: "/hr?section=claims",
    hr_attendance_correction: "/hr?section=attendance",
    hr_payroll: "/hr?section=payslips",
    hr_lifecycle: "/hr?section=lifecycle",
    employee: "/hr?section=people",
  } as Record<string, string>)[entityType] || "/hr";
}

function mapRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    body: row.body || "",
    type: row.type,
    status: row.status,
    read: row.status === "Read",
    entityType: row.entity_type,
    entityId: row.entity_id,
    href: href(row.entity_type),
    createdAt: row.created_at,
  };
}

export async function GET() {
  try {
    const session = await requireHRSession();
    const sql = getDatabase();
    let rows: any[];
    if (["hr_admin", "manager"].includes(session.role)) {
      rows = await sql`select * from notifications where organization_id = ${ORGANIZATION_ID} and type = 'hr' and status <> 'Archived' order by created_at desc limit 100`;
    } else if (session.role === "finance") {
      rows = await sql`select * from notifications where organization_id = ${ORGANIZATION_ID} and type = 'hr' and status <> 'Archived' and (user_id = ${session.userId} or entity_type in ('hr_claim', 'hr_payroll')) order by created_at desc limit 100`;
    } else {
      rows = await sql`select * from notifications where organization_id = ${ORGANIZATION_ID} and type = 'hr' and status <> 'Archived' and user_id = ${session.userId} order by created_at desc limit 100`;
    }
    const notifications = rows.map(mapRow);
    return NextResponse.json({ notifications, unread: notifications.filter((item) => !item.read).length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load HR notifications." }, { status: error instanceof HRAuthError ? error.status : 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireHRSession();
    const body = object(await request.json());
    const operation = clean(body.operation);
    const id = clean(body.id);
    const sql = getDatabase();
    const canManageAll = ["hr_admin", "manager"].includes(session.role);

    if (operation === "mark_read" && id) {
      if (canManageAll) await sql`update notifications set status = 'Read', read_at = now() where id = ${id} and organization_id = ${ORGANIZATION_ID} and type = 'hr'`;
      else await sql`update notifications set status = 'Read', read_at = now() where id = ${id} and organization_id = ${ORGANIZATION_ID} and type = 'hr' and user_id = ${session.userId}`;
    } else if (operation === "mark_all_read") {
      if (canManageAll) await sql`update notifications set status = 'Read', read_at = now() where organization_id = ${ORGANIZATION_ID} and type = 'hr' and status = 'Unread'`;
      else await sql`update notifications set status = 'Read', read_at = now() where organization_id = ${ORGANIZATION_ID} and type = 'hr' and status = 'Unread' and user_id = ${session.userId}`;
    } else if (operation === "archive_read") {
      if (canManageAll) await sql`update notifications set status = 'Archived' where organization_id = ${ORGANIZATION_ID} and type = 'hr' and status = 'Read'`;
      else await sql`update notifications set status = 'Archived' where organization_id = ${ORGANIZATION_ID} and type = 'hr' and status = 'Read' and user_id = ${session.userId}`;
    } else throw new Error("Unsupported notification operation.");

    return GET();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update HR notifications." }, { status: error instanceof HRAuthError ? error.status : 400 });
  }
}

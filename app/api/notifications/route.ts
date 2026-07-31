/**
 * Company-wide notification feed for the header bell.
 *
 * The automation engine has been writing reminders into `notifications` since
 * the cron route was added — overdue invoices, settlements awaiting
 * verification, projects approaching their date, knowledge past review — but
 * nothing in the app ever read them, so the bell in the header was a button with
 * no handler. This exposes exactly the shared rows: `user_id is null`.
 *
 * Rows with a `user_id` are personal HR notifications and stay behind the HR
 * session check in /api/hr/notifications; they are deliberately not returned here.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const clean = (value: unknown) => String(value ?? "").trim();

/** Resolves a notification to the workspace that can act on it. */
function href(entityType: string, entityId: string) {
  const routes: Record<string, string> = {
    invoice: "/business?tab=sales",
    sales: "/business?tab=sales",
    settlement: "/business?tab=settlements",
    project: "/business?tab=projects",
    opportunity: "/business?tab=crm",
    customer: "/business?tab=customers",
    onboarding: "/business?tab=onboarding",
    knowledge: "/knowledge",
    automation: "/automations",
    approval: "/approvals",
    document: "/documents",
    funnel: "/funnels",
    brand: "/brands",
  };
  const base = routes[entityType];
  if (!base) return "/approvals";
  // Knowledge entries are addressable, so deep-link straight to the record.
  return entityType === "knowledge" && entityId ? `${base}?entry=${encodeURIComponent(entityId)}` : base;
}

function mapRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    body: row.body || "",
    type: row.type,
    read: row.status === "Read",
    entityType: row.entity_type || "",
    entityId: row.entity_id || "",
    href: href(row.entity_type || "", row.entity_id || ""),
    dueAt: row.due_at,
    createdAt: row.created_at,
  };
}

function failure(error: unknown) {
  console.error("Notification request failed", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unable to load notifications.", notifications: [], unread: 0 },
    { status: 503 },
  );
}

export async function GET() {
  try {
    const sql = getDatabase();
    const rows = await sql`
      select * from notifications
      where organization_id = ${ORGANIZATION_ID} and user_id is null
      order by (status = 'Unread') desc, coalesce(due_at, created_at) desc
      limit 40
    `;
    const notifications = rows.map(mapRow);
    return NextResponse.json(
      { notifications, unread: notifications.filter((item) => !item.read).length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

/** Marks one notification, or every unread shared notification, as read. */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = clean(body.id);
    const sql = getDatabase();

    if (clean(body.action) === "read_all") {
      await sql`
        update notifications set status = 'Read', read_at = now()
        where organization_id = ${ORGANIZATION_ID} and user_id is null and status = 'Unread'
      `;
      return NextResponse.json({ ok: true });
    }

    if (!id) return NextResponse.json({ error: "A notification ID is required." }, { status: 400 });
    const rows = await sql`
      update notifications set status = 'Read', read_at = now()
      where id = ${id} and organization_id = ${ORGANIZATION_ID} and user_id is null
      returning id
    `;
    if (!rows.length) return NextResponse.json({ error: "Notification was not found." }, { status: 404 });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return failure(error);
  }
}

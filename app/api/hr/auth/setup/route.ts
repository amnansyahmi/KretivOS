import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { createHRSession, createPinCredential, HR_AUTH_ENABLED, HRAuthError, HR_SESSION_COOKIE, publicSession, roleFromMetadata, sessionCookieOptions } from "@/lib/hr-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clean = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

export async function POST(request: NextRequest) {
  try {
    if (!HR_AUTH_ENABLED) throw new HRAuthError("HRMS setup is temporarily disabled. Open /hr directly.", 503);
    const body = object(await request.json());
    const expectedSetupKey = clean(process.env.HRMS_SETUP_KEY);
    if (!expectedSetupKey) throw new HRAuthError("HRMS_SETUP_KEY is not configured.", 503);
    if (clean(body.setupKey) !== expectedSetupKey) throw new HRAuthError("Invalid setup key.", 403);

    const name = clean(body.name);
    const email = clean(body.email).toLowerCase();
    const pin = clean(body.pin);
    if (!name || !email || !email.includes("@")) throw new HRAuthError("Name and a valid work email are required.", 400);

    const sql = getDatabase();
    const configured = await sql`
      select count(*)::int as count from users
      where organization_id = 'org-kretivco' and coalesce(metadata->'auth'->>'pinHash', '') <> ''
    `;
    if (Number(configured[0]?.count || 0) > 0) throw new HRAuthError("Initial HRMS setup has already been completed.", 409);

    let rows = await sql`
      select * from users
      where organization_id = 'org-kretivco'
        and (lower(display_name) = lower(${name}) or lower(email) = lower(${email}))
      order by created_at asc limit 1
    `;
    if (!rows.length) {
      rows = await sql`
        insert into users (id, organization_id, email, display_name, status, metadata)
        values (${randomUUID()}, 'org-kretivco', ${email}, ${name}, 'active', '{}'::jsonb)
        returning *
      `;
    }

    const user = rows[0];
    const credential = createPinCredential(pin);
    const metadata = object(user.metadata);
    const nextMetadata = {
      ...metadata,
      emailPlaceholder: false,
      auth: {
        ...object(metadata.auth),
        ...credential,
        role: "hr_admin",
        configuredAt: new Date().toISOString(),
      },
    };
    const updated = await sql`
      update users set email = ${email}, display_name = ${name}, status = 'active', metadata = ${JSON.stringify(nextMetadata)}::jsonb
      where id = ${user.id} and organization_id = 'org-kretivco'
      returning *
    `;
    const role = roleFromMetadata(updated[0].metadata);
    const created = await createHRSession(user.id, role, request);
    const session = {
      sessionId: "new",
      userId: user.id,
      organizationId: "org-kretivco",
      name,
      email,
      role,
      expiresAt: created.expiresAt.toISOString(),
    };
    await sql`
      insert into audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
      values ('org-kretivco', ${user.id}, 'hr.auth.initial_setup', 'hr_auth', ${user.id}, ${JSON.stringify({ source: "hr-auth-setup" })}::jsonb)
    `;
    const response = NextResponse.json({ ok: true, session: publicSession(session) });
    response.cookies.set(HR_SESSION_COOKIE, created.token, sessionCookieOptions(created.expiresAt));
    return response;
  } catch (error) {
    const status = error instanceof HRAuthError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to set up HRMS." }, { status });
  }
}

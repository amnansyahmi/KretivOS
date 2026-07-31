import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { createHRSession, HR_AUTH_ENABLED, HRAuthError, HR_SESSION_COOKIE, publicSession, roleFromMetadata, sessionCookieOptions, verifyPin } from "@/lib/hr-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clean = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function POST(request: NextRequest) {
  try {
    if (!HR_AUTH_ENABLED) throw new HRAuthError("HRMS login is temporarily disabled. Open /hr directly.", 503);
    const body = object(await request.json());
    const identifier = clean(body.identifier).toLowerCase();
    const pin = clean(body.pin);
    if (!identifier || !pin) throw new HRAuthError("Enter your work email or name and PIN.", 400);

    const sql = getDatabase();
    const ip = clean(request.headers.get("x-forwarded-for")).split(",")[0].trim() || "unknown";
    const identifierHash = hash(identifier);
    const ipHash = hash(ip);
    const recentFailures = await sql`
      select count(*)::int as count from hr_login_attempts
      where organization_id = 'org-kretivco' and succeeded = false
        and created_at > now() - interval '15 minutes'
        and (identifier_hash = ${identifierHash} or ip_hash = ${ipHash})
    `;
    if (Number(recentFailures[0]?.count || 0) >= 5) throw new HRAuthError("Too many sign-in attempts. Try again in 15 minutes.", 429);
    const rows = await sql`
      select * from users
      where organization_id = 'org-kretivco' and status = 'active'
        and (lower(email) = ${identifier} or lower(display_name) = ${identifier})
      limit 1
    `;
    const user = rows[0];
    const auth = object(object(user?.metadata).auth);
    if (!user || !verifyPin(pin, clean(auth.salt), clean(auth.pinHash))) {
      await sql`insert into hr_login_attempts (organization_id, identifier_hash, ip_hash, succeeded) values ('org-kretivco', ${identifierHash}, ${ipHash}, false)`;
      throw new HRAuthError("Email/name or PIN is incorrect.", 401);
    }

    const role = roleFromMetadata(user.metadata);
    await sql`insert into hr_login_attempts (organization_id, identifier_hash, ip_hash, succeeded) values ('org-kretivco', ${identifierHash}, ${ipHash}, true)`;
    const created = await createHRSession(user.id, role, request);
    await sql`
      insert into audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
      values ('org-kretivco', ${user.id}, 'hr.auth.login', 'hr_auth', ${user.id}, ${JSON.stringify({ source: "hr-auth-login" })}::jsonb)
    `;
    const response = NextResponse.json({ ok: true, session: publicSession({
      sessionId: "new", userId: user.id, organizationId: "org-kretivco",
      name: user.display_name, email: user.email, role, expiresAt: created.expiresAt.toISOString(),
    }) });
    response.cookies.set(HR_SESSION_COOKIE, created.token, sessionCookieOptions(created.expiresAt));
    return response;
  } catch (error) {
    const status = error instanceof HRAuthError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to sign in." }, { status });
  }
}

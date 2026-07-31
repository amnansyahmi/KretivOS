import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/db";

export const HR_SESSION_COOKIE = "kretivos_hr_session";
export const HR_SESSION_DAYS = 7;
export const HR_AUTH_ENABLED = process.env.HRMS_AUTH_ENABLED === "true";
export type HRRole = "hr_admin" | "manager" | "employee" | "finance";

export type HRSession = {
  sessionId: string;
  userId: string;
  organizationId: string;
  name: string;
  email: string;
  role: HRRole;
  expiresAt: string;
  authEnabled?: boolean;
};

export class HRAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

const clean = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createPinCredential(pin: string) {
  if (pin.length < 6 || pin.length > 64) throw new HRAuthError("PIN must contain at least 6 characters.", 400);
  const salt = randomBytes(16).toString("hex");
  const pinHash = scryptSync(pin, salt, 64).toString("hex");
  return { salt, pinHash };
}

export function verifyPin(pin: string, salt: string, expected: string) {
  if (!pin || !salt || !expected) return false;
  try {
    const actual = scryptSync(pin, salt, 64);
    const target = Buffer.from(expected, "hex");
    return actual.length === target.length && timingSafeEqual(actual, target);
  } catch {
    return false;
  }
}

export function roleFromMetadata(metadata: unknown): HRRole {
  const value = clean(object(metadata).auth?.role || object(metadata).role);
  return ["hr_admin", "manager", "employee", "finance"].includes(value) ? value as HRRole : "employee";
}

export async function createHRSession(userId: string, role: HRRole, request: NextRequest) {
  if (!HR_AUTH_ENABLED) throw new HRAuthError("HRMS login is temporarily disabled.", 503);
  const sql = getDatabase();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + HR_SESSION_DAYS * 24 * 60 * 60 * 1000);
  const forwarded = clean(request.headers.get("x-forwarded-for")).split(",")[0].trim();
  await sql`
    insert into hr_sessions (organization_id, user_id, token_hash, role, user_agent, ip_address, expires_at)
    values (
      'org-kretivco', ${userId}, ${tokenHash(token)}, ${role},
      ${clean(request.headers.get("user-agent")).slice(0, 500) || null},
      ${forwarded.slice(0, 100) || null}, ${expiresAt.toISOString()}
    )
  `;
  return { token, expiresAt };
}

export const sessionCookieOptions = (expires: Date) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  expires,
});

export async function getHRSession(tokenOverride?: string): Promise<HRSession | null> {
  if (!HR_AUTH_ENABLED) {
    const sql = getDatabase();
    let rows = await sql`
      select id, display_name, email from users
      where organization_id = 'org-kretivco' and status = 'active'
      order by created_at asc limit 1
    `;
    if (!rows.length) {
      rows = await sql`
        insert into users (id, organization_id, email, display_name, status, metadata)
        values (
          ${randomUUID()}, 'org-kretivco', 'amirul.hafiz@team.kretivco.local', 'Amirul Hafiz', 'active',
          ${JSON.stringify({ emailPlaceholder: true, title: "Kretivco Team", department: "Leadership", employmentType: "Core Team", workMode: "Hybrid", annualLeaveBalance: 14, medicalLeaveBalance: 14, skills: [] })}::jsonb
        )
        on conflict (organization_id, email) do update set status = 'active'
        returning id, display_name, email
      `;
    }
    const user = rows[0];
    return {
      sessionId: "shared-workspace",
      userId: user.id,
      organizationId: "org-kretivco",
      name: "Kretivco Team",
      email: user.email,
      role: "hr_admin",
      expiresAt: "2099-12-31T23:59:59.000Z",
      authEnabled: false,
    };
  }
  const token = tokenOverride || (await cookies()).get(HR_SESSION_COOKIE)?.value || "";
  if (!token) return null;
  const sql = getDatabase();
  const rows = await sql`
    select s.id as session_id, s.user_id, s.organization_id, s.role, s.expires_at,
           u.display_name, u.email, u.status, u.metadata
    from hr_sessions s
    join users u on u.id = s.user_id and u.organization_id = s.organization_id
    where s.token_hash = ${tokenHash(token)} and s.expires_at > now() and u.status = 'active'
    limit 1
  `;
  if (!rows.length) return null;
  const row = rows[0];
  const metadataRole = roleFromMetadata(row.metadata);
  const role = row.role === metadataRole ? row.role as HRRole : metadataRole;
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    organizationId: row.organization_id,
    name: row.display_name,
    email: row.email,
    role,
    expiresAt: new Date(row.expires_at).toISOString(),
    authEnabled: true,
  };
}

export async function requireHRSession(allowed?: HRRole[]) {
  const session = await getHRSession();
  if (!session) throw new HRAuthError("Sign in to continue.", 401);
  if (allowed && !allowed.includes(session.role)) throw new HRAuthError("You do not have permission for this HRMS action.", 403);
  return session;
}

export async function deleteHRSession(token: string) {
  if (!token) return;
  const sql = getDatabase();
  await sql`delete from hr_sessions where token_hash = ${tokenHash(token)}`;
}

export function publicSession(session: HRSession) {
  return { userId: session.userId, name: session.name, email: session.email, role: session.role, expiresAt: session.expiresAt, authEnabled: session.authEnabled ?? HR_AUTH_ENABLED };
}

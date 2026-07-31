import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getHRSession, HR_AUTH_ENABLED, publicSession } from "@/lib/hr-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const sql = getDatabase();
    const rows = await sql`
      select count(*)::int as count
      from users
      where organization_id = 'org-kretivco'
        and coalesce(metadata->'auth'->>'pinHash', '') <> ''
    `;
    const session = await getHRSession();
    return NextResponse.json({
      authEnabled: HR_AUTH_ENABLED,
      configured: HR_AUTH_ENABLED && Number(rows[0]?.count || 0) > 0,
      setupAvailable: HR_AUTH_ENABLED && Boolean(process.env.HRMS_SETUP_KEY),
      session: session ? publicSession(session) : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check HRMS authentication.";
    const migrationMissing = /hr_sessions|does not exist/i.test(message);
    return NextResponse.json({
      error: migrationMissing ? "Apply db/migrations/0005_hrms_security.sql before opening HRMS." : message,
      migrationRequired: migrationMissing,
    }, { status: 500 });
  }
}

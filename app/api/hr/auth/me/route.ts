import { NextResponse } from "next/server";
import { HRAuthError, publicSession, requireHRSession } from "@/lib/hr-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ session: publicSession(await requireHRSession()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof HRAuthError ? error.status : 401;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized." }, { status });
  }
}

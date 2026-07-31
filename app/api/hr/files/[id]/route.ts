import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const clean = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

async function loadAsset(id: string) {
  const sql = getDatabase();
  const rows = await sql`select * from assets where id = ${id} and organization_id = ${ORGANIZATION_ID} and asset_type = 'hr_secure_file' limit 1`;
  return rows[0] || null;
}

function assertAccess(asset: any, session: Awaited<ReturnType<typeof requireHRSession>>) {
  const metadata = object(asset.metadata);
  if (["hr_admin", "manager", "finance"].includes(session.role)) return;
  if (clean(metadata.audience) === "company") return;
  if (clean(metadata.employeeId) !== session.userId && clean(metadata.uploadedBy) !== session.userId) throw new HRAuthError("You cannot access this HR file.", 403);
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireHRSession();
    const { id } = await context.params;
    const asset = await loadAsset(id);
    if (!asset) return NextResponse.json({ error: "HR file was not found." }, { status: 404 });
    assertAccess(asset, session);
    const match = String(asset.storage_url || "").match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error("Stored HR file is invalid.");
    const bytes = Buffer.from(match[2], "base64");
    return new NextResponse(bytes, { headers: {
      "Content-Type": clean(asset.mime_type) || match[1], "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${clean(asset.name).replace(/["\\]/g, "_") || "hr-file"}"`,
      "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load HR file." }, { status: error instanceof HRAuthError ? error.status : 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireHRSession();
    const { id } = await context.params;
    const asset = await loadAsset(id);
    if (!asset) return NextResponse.json({ error: "HR file was not found." }, { status: 404 });
    const metadata = object(asset.metadata);
    if (session.role !== "hr_admin" && clean(metadata.uploadedBy) !== session.userId) throw new HRAuthError("You cannot delete this HR file.", 403);
    const sql = getDatabase();
    await sql`delete from assets where id = ${id} and organization_id = ${ORGANIZATION_ID}`;
    await sql`insert into audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata) values (${ORGANIZATION_ID}, ${session.userId}, 'hr.file.deleted', 'hr_secure_file', ${id}, ${JSON.stringify({ private: true, purpose: asset.category })}::jsonb)`;
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete HR file." }, { status: error instanceof HRAuthError ? error.status : 500 });
  }
}

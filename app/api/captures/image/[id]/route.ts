/**
 * Serves a captured document image.
 *
 * Returned as bytes rather than as the stored data URL so the review screen can
 * show it in an <img> without pushing several megabytes of base64 through the
 * JSON payload of the queue listing.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireHRSession(["hr_admin", "finance"]);
    const { id } = await context.params;
    const sql = getDatabase();
    const rows = await sql`
      select storage_url, mime_type from assets
      where id = ${id} and organization_id = ${ORGANIZATION_ID} and asset_type = 'finance_document'
      limit 1
    `;
    if (!rows.length) return NextResponse.json({ error: "Document was not found." }, { status: 404 });

    const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(rows[0].storage_url || ""));
    if (!match) return NextResponse.json({ error: "Stored document is unreadable." }, { status: 500 });

    const bytes = Buffer.from(match[2], "base64");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": String(rows[0].mime_type || match[1]),
        "Content-Length": String(bytes.length),
        // Financial evidence: never cached by a shared proxy.
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data:",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Capture image failed", error);
    if (error instanceof HRAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to load the document." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const sql = getDatabase();
    const rows = await sql`
      select storage_url, mime_type
      from assets
      where id = ${id}
        and organization_id = ${ORGANIZATION_ID}
        and asset_type = 'hr_attendance_photo'
      limit 1
    `;
    if (!rows.length) return NextResponse.json({ error: "Attendance photo was not found." }, { status: 404 });

    const dataUrl = String(rows[0].storage_url || "");
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return NextResponse.json({ error: "Attendance photo is invalid." }, { status: 500 });

    const mimeType = String(rows[0].mime_type || match[1]);
    const bytes = Buffer.from(match[2], "base64");
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data:",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load attendance photo." },
      { status: 500 },
    );
  }
}

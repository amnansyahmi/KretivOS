import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const MAX_DATA_URL_CHARACTERS = 2_850_000;
const ALLOWED_PURPOSES = new Set(["claim_receipt", "leave_attachment", "hr_document"]);
const clean = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

function parseFile(value: unknown) {
  const dataUrl = clean(value);
  if (!dataUrl || dataUrl.length > MAX_DATA_URL_CHARACTERS) throw new Error("File is missing or exceeds the 2 MB limit.");
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("File must be a PDF, JPG, PNG or WebP.");
  const size = Math.floor(match[2].length * 0.75);
  if (size > 2 * 1024 * 1024) throw new Error("File exceeds the 2 MB limit.");
  return { dataUrl, mimeType: match[1], size };
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireHRSession();
    const body = object(await request.json());
    const purpose = clean(body.purpose);
    if (!ALLOWED_PURPOSES.has(purpose)) throw new Error("Unsupported HR file purpose.");
    if (purpose === "hr_document" && session.role !== "hr_admin") throw new HRAuthError("Only HR Admin can upload HR documents.", 403);
    const file = parseFile(body.dataUrl);
    const id = randomUUID();
    const filename = clean(body.filename).slice(0, 180) || `HR file ${id}`;
    const requestedEmployeeId = clean(body.employeeId);
    const companyWide = purpose === "hr_document" && !requestedEmployeeId;
    const employeeId = session.role === "employee" ? session.userId : requestedEmployeeId || session.userId;
    const sql = getDatabase();
    await sql`
      insert into assets (id, organization_id, name, asset_type, category, storage_url, mime_type, file_size, metadata)
      values (${id}, ${ORGANIZATION_ID}, ${filename}, 'hr_secure_file', ${purpose}, ${file.dataUrl}, ${file.mimeType}, ${file.size},
        ${JSON.stringify({ purpose, employeeId, audience: companyWide ? "company" : "employee", uploadedBy: session.userId, uploadedAt: new Date().toISOString(), private: true })}::jsonb)
    `;
    await sql`
      insert into audit_logs (organization_id, user_id, action, entity_type, entity_id, after_data, metadata)
      values (${ORGANIZATION_ID}, ${session.userId}, 'hr.file.uploaded', 'hr_secure_file', ${id},
        ${JSON.stringify({ filename, purpose, employeeId, mimeType: file.mimeType, fileSize: file.size })}::jsonb,
        ${JSON.stringify({ source: "hr-files-api", authenticated: true, private: true })}::jsonb)
    `;
    return NextResponse.json({ id, filename, purpose, mimeType: file.mimeType, fileSize: file.size, url: `/api/hr/files/${id}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload HR file.";
    return NextResponse.json({ error: message }, { status: error instanceof HRAuthError ? error.status : 400 });
  }
}

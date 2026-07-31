import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const SCOPE = "hr-operations-v1";
const MAX_PHOTO_CHARACTERS = 500_000;

const clean = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const array = (value: unknown) => Array.isArray(value) ? value : [];

function photoPayload(value: unknown) {
  const dataUrl = clean(value);
  if (!dataUrl || dataUrl.length > MAX_PHOTO_CHARACTERS) throw new Error("Replacement photo is missing or too large.");
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Replacement photo must be a JPEG, PNG or WEBP image.");
  return { dataUrl, mimeType: match[1], estimatedBytes: Math.floor(match[2].length * 0.75) };
}

async function loadAsset(id: string) {
  const sql = getDatabase();
  const rows = await sql`
    select id, storage_url, mime_type, file_size, metadata, category
    from assets
    where id = ${id}
      and organization_id = ${ORGANIZATION_ID}
      and asset_type = 'hr_attendance_photo'
    limit 1
  `;
  return rows[0] || null;
}

async function loadOperations() {
  const sql = getDatabase();
  const rows = await sql`
    select data from workspace_state
    where organization_id = ${ORGANIZATION_ID} and scope = ${SCOPE}
    limit 1
  `;
  return rows.length ? object(rows[0].data) : null;
}

async function saveOperations(data: Record<string, any>) {
  const sql = getDatabase();
  await sql`
    update workspace_state
    set data = ${JSON.stringify(data)}::jsonb, version = version + 1, updated_at = now()
    where organization_id = ${ORGANIZATION_ID} and scope = ${SCOPE}
  `;
}

async function audit(action: string, entityId: string, payload: unknown) {
  try {
    const sql = getDatabase();
    await sql`
      insert into audit_logs (organization_id, action, entity_type, entity_id, after_data, metadata)
      values (
        ${ORGANIZATION_ID}, ${action}, 'hr_attendance_photo', ${entityId},
        ${JSON.stringify(payload)}::jsonb,
        ${JSON.stringify({ source: "attendance-evidence-api", authentication: "skipped", attendanceTimePreserved: true })}::jsonb
      )
    `;
  } catch {}
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const asset = await loadAsset(id);
    if (!asset) return NextResponse.json({ error: "Attendance photo was not found." }, { status: 404 });

    if (request.nextUrl.searchParams.get("meta") === "1") {
      return NextResponse.json({
        id: asset.id,
        mimeType: asset.mime_type,
        fileSize: asset.file_size,
        category: asset.category,
        metadata: object(asset.metadata),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const dataUrl = String(asset.storage_url || "");
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return NextResponse.json({ error: "Attendance photo is invalid." }, { status: 500 });

    const mimeType = String(asset.mime_type || match[1]);
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

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const asset = await loadAsset(id);
    if (!asset) return NextResponse.json({ error: "Attendance photo was not found." }, { status: 404 });

    const body = object(await request.json());
    const photo = photoPayload(body.photoDataUrl);
    const metadata = object(asset.metadata);
    const replacedAt = new Date().toISOString();
    const replacementHistory = array(metadata.replacementHistory);
    const nextMetadata = {
      ...metadata,
      replacementHistory: [
        ...replacementHistory,
        {
          replacedAt,
          previousMimeType: asset.mime_type,
          previousFileSize: asset.file_size,
          replacementSource: clean(body.replacementSource) || "admin_photo_evidence",
        },
      ],
      lastReplacedAt: replacedAt,
      replacementNote: clean(body.note) || null,
    };

    const sql = getDatabase();
    await sql`
      update assets
      set storage_url = ${photo.dataUrl}, mime_type = ${photo.mimeType}, file_size = ${photo.estimatedBytes},
          metadata = ${JSON.stringify(nextMetadata)}::jsonb, updated_at = now()
      where id = ${id} and organization_id = ${ORGANIZATION_ID}
    `;
    await audit("hr.attendance.photo_replaced", id, {
      attendanceId: metadata.attendanceId,
      action: metadata.action,
      replacedAt,
      attendanceTimePreserved: true,
    });

    return NextResponse.json({ ok: true, id, replacedAt, attendanceTimePreserved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to replace attendance photo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const asset = await loadAsset(id);
    if (!asset) return NextResponse.json({ error: "Attendance photo was not found." }, { status: 404 });

    const metadata = object(asset.metadata);
    const attendanceId = clean(metadata.attendanceId);
    const action = clean(metadata.action || asset.category);
    const deletedAt = new Date().toISOString();

    const operations = await loadOperations();
    if (operations && attendanceId) {
      const records = array(operations.attendance);
      operations.attendance = records.map((record: any) => {
        if (record.id !== attendanceId) return record;
        if (action === "check_in") {
          return {
            ...record,
            checkInPhotoId: null,
            checkInPhotoDeletedAt: deletedAt,
            updatedAt: deletedAt,
          };
        }
        return {
          ...record,
          checkOutPhotoId: null,
          checkOutPhotoDeletedAt: deletedAt,
          updatedAt: deletedAt,
        };
      });
      await saveOperations(operations);
    }

    const sql = getDatabase();
    await sql`delete from assets where id = ${id} and organization_id = ${ORGANIZATION_ID}`;
    await audit("hr.attendance.photo_deleted", id, {
      attendanceId,
      action,
      deletedAt,
      attendanceTimePreserved: true,
    });

    return NextResponse.json({ ok: true, id, attendanceId, action, deletedAt, attendanceTimePreserved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete attendance photo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

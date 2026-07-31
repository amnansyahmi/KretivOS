import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const SCOPE = "hr-operations-v1";
const clean = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const array = (value: unknown) => Array.isArray(value) ? value : [];

export async function POST(request: NextRequest) {
  try {
    const body = object(await request.json());
    const employeeId = clean(body.employeeId);
    const date = clean(body.date);
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Employee and a valid date are required." }, { status: 400 });
    }

    const sql = getDatabase();
    const rows = await sql`
      select data from workspace_state
      where organization_id = ${ORGANIZATION_ID} and scope = ${SCOPE}
      limit 1
    `;
    if (!rows.length) return NextResponse.json({ error: "HR attendance workspace was not found." }, { status: 404 });

    const state = object(rows[0].data);
    const records = array(state.attendance);
    const record = records.find((item: any) => item.employeeId === employeeId && item.date === date);
    if (!record) return NextResponse.json({ error: "No attendance record found for this employee and date." }, { status: 404 });

    const resetAt = new Date().toISOString();
    state.attendance = records.filter((item: any) => item.id !== record.id);
    state.attendanceResetArchive = [
      { ...record, resetAt, resetReason: clean(body.reason) || "Temporary testing reset" },
      ...array(state.attendanceResetArchive),
    ].slice(0, 100);

    await sql`
      update workspace_state
      set data = ${JSON.stringify(state)}::jsonb, version = version + 1, updated_at = now()
      where organization_id = ${ORGANIZATION_ID} and scope = ${SCOPE}
    `;

    await sql`
      insert into audit_logs (organization_id, action, entity_type, entity_id, before_data, after_data, metadata)
      values (
        ${ORGANIZATION_ID}, 'hr.attendance.temporary_reset', 'hr_attendance', ${record.id},
        ${JSON.stringify(record)}::jsonb, null,
        ${JSON.stringify({ authentication: "skipped", temporaryTestingTool: true, reversibleArchive: true, employeeId, date, resetAt })}::jsonb
      )
    `;

    return NextResponse.json({ ok: true, employeeId, date, resetAt, archived: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reset attendance." }, { status: 500 });
  }
}

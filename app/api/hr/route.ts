import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const SCOPE = "hr-operations-v1";

const clean = (value: unknown) => String(value ?? "").trim();
const optional = (value: unknown) => clean(value) || null;
const number = (value: unknown) => Number(value || 0);
const bool = (value: unknown) => Boolean(value);
const array = (value: unknown) => Array.isArray(value) ? value : [];
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

const starterNames = [
  "Amirul Hafiz",
  "Nurfadilah (Ila)",
  "Muhammad Afiq",
  "Amnan",
  "Ajam (Multazam)",
];

const defaultOnboarding = () => [
  { id: randomUUID(), label: "Personal and contact details", done: false },
  { id: randomUUID(), label: "Employment terms acknowledged", done: false },
  { id: randomUUID(), label: "KretivOS and work tools access", done: false },
  { id: randomUUID(), label: "Company policies reviewed", done: false },
  { id: randomUUID(), label: "Role expectations and goals", done: false },
  { id: randomUUID(), label: "First-week check-in", done: false },
];

const defaultOperations = {
  leaveRequests: [] as any[],
  attendance: [] as any[],
  goals: [] as any[],
  learning: [] as any[],
  settings: {
    departments: ["Leadership", "Marketing", "Creative", "Technology", "Finance", "Operations"],
    leaveTypes: ["Annual Leave", "Medical Leave", "Emergency Leave", "Unpaid Leave", "Replacement Leave"],
    workModes: ["Office", "Remote", "Hybrid", "Client Site"],
  },
};

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "team.member";
}

function mapEmployee(row: any) {
  const metadata = object(row.metadata);
  const placeholderEmail = bool(metadata.emailPlaceholder);
  return {
    id: row.id,
    name: row.display_name,
    email: placeholderEmail ? "" : row.email,
    internalEmail: row.email,
    status: row.status,
    title: clean(metadata.title),
    department: clean(metadata.department) || "Leadership",
    employmentType: clean(metadata.employmentType) || "Core Team",
    workMode: clean(metadata.workMode) || "Hybrid",
    location: clean(metadata.location),
    startDate: clean(metadata.startDate),
    phone: clean(metadata.phone),
    emergencyContact: clean(metadata.emergencyContact),
    annualLeaveBalance: number(metadata.annualLeaveBalance || 14),
    medicalLeaveBalance: number(metadata.medicalLeaveBalance || 14),
    skills: array(metadata.skills).map(clean).filter(Boolean),
    notes: clean(metadata.notes),
    onboarding: array(metadata.onboarding).length ? metadata.onboarding : defaultOnboarding(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function seedEmployees() {
  const sql = getDatabase();
  const countRows = await sql`select count(*)::int as count from users where organization_id = ${ORGANIZATION_ID}`;
  if (Number(countRows[0]?.count || 0) > 0) return;

  for (const name of starterNames) {
    const email = `${slug(name)}@team.kretivco.local`;
    await sql`
      insert into users (id, organization_id, email, display_name, status, metadata)
      values (
        ${randomUUID()}, ${ORGANIZATION_ID}, ${email}, ${name}, 'active',
        ${JSON.stringify({
          emailPlaceholder: true,
          title: "Kretivco Team",
          department: "Leadership",
          employmentType: "Core Team",
          workMode: "Hybrid",
          annualLeaveBalance: 14,
          medicalLeaveBalance: 14,
          skills: [],
          onboarding: defaultOnboarding(),
        })}::jsonb
      )
      on conflict (organization_id, email) do nothing
    `;
  }
}

async function loadOperations() {
  const sql = getDatabase();
  const rows = await sql`
    select data, version from workspace_state
    where organization_id = ${ORGANIZATION_ID} and scope = ${SCOPE}
    limit 1
  `;
  if (rows.length) {
    const data = { ...defaultOperations, ...object(rows[0].data) };
    data.settings = { ...defaultOperations.settings, ...object(data.settings) };
    return { data, version: Number(rows[0].version || 1) };
  }

  const created = await sql`
    insert into workspace_state (organization_id, scope, version, data)
    values (${ORGANIZATION_ID}, ${SCOPE}, 1, ${JSON.stringify(defaultOperations)}::jsonb)
    returning data, version
  `;
  return { data: created[0].data, version: Number(created[0].version) };
}

async function saveOperations(data: Record<string, any>) {
  const sql = getDatabase();
  const rows = await sql`
    insert into workspace_state (organization_id, scope, version, data)
    values (${ORGANIZATION_ID}, ${SCOPE}, 1, ${JSON.stringify(data)}::jsonb)
    on conflict (organization_id, scope)
    do update set data = excluded.data, version = workspace_state.version + 1, updated_at = now()
    returning version
  `;
  return Number(rows[0].version);
}

async function audit(action: string, entityType: string, entityId: string | null, afterData?: unknown) {
  try {
    const sql = getDatabase();
    await sql`
      insert into audit_logs (organization_id, action, entity_type, entity_id, after_data, metadata)
      values (
        ${ORGANIZATION_ID}, ${action}, ${entityType}, ${entityId},
        ${afterData ? JSON.stringify(afterData) : null}::jsonb,
        ${JSON.stringify({ source: "hr-api", authentication: "skipped", containsSensitiveData: false })}::jsonb
      )
    `;
  } catch {}
}

async function notify(title: string, body: string, entityType: string, entityId: string) {
  try {
    const sql = getDatabase();
    await sql`
      insert into notifications (organization_id, title, body, type, status, entity_type, entity_id)
      values (${ORGANIZATION_ID}, ${title}, ${body}, 'hr', 'Unread', ${entityType}, ${entityId})
    `;
  } catch {}
}

async function snapshot() {
  await seedEmployees();
  const sql = getDatabase();
  const [employeeRows, operations] = await Promise.all([
    sql`select * from users where organization_id = ${ORGANIZATION_ID} order by status asc, display_name asc`,
    loadOperations(),
  ]);
  return {
    employees: employeeRows.map(mapEmployee),
    ...operations.data,
    version: operations.version,
    syncedAt: new Date().toISOString(),
  };
}

function businessDays(start: string, end: string) {
  if (!start || !end) return 0;
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  let count = 0;
  while (cursor <= last) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function leaveDates(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export async function GET() {
  try {
    return NextResponse.json(await snapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load HR data." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const operation = clean(body.operation);
    const resource = clean(body.resource);
    const id = clean(body.id);
    const data = object(body.data);
    const action = clean(body.action);
    const sql = getDatabase();

    if (resource === "employees") {
      if (operation === "create") {
        const employeeId = clean(data.id) || randomUUID();
        const name = clean(data.name);
        if (!name) throw new Error("Employee name is required.");
        const suppliedEmail = clean(data.email);
        const email = suppliedEmail || `${slug(name)}.${employeeId.slice(0, 5)}@team.kretivco.local`;
        const metadata = {
          emailPlaceholder: !suppliedEmail,
          title: clean(data.title),
          department: clean(data.department) || "Leadership",
          employmentType: clean(data.employmentType) || "Core Team",
          workMode: clean(data.workMode) || "Hybrid",
          location: clean(data.location),
          startDate: clean(data.startDate),
          phone: clean(data.phone),
          emergencyContact: clean(data.emergencyContact),
          annualLeaveBalance: number(data.annualLeaveBalance || 14),
          medicalLeaveBalance: number(data.medicalLeaveBalance || 14),
          skills: array(data.skills).map(clean).filter(Boolean),
          notes: clean(data.notes),
          onboarding: array(data.onboarding).length ? data.onboarding : defaultOnboarding(),
        };
        const rows = await sql`
          insert into users (id, organization_id, email, display_name, status, metadata)
          values (${employeeId}, ${ORGANIZATION_ID}, ${email}, ${name}, ${clean(data.status) || "active"}, ${JSON.stringify(metadata)}::jsonb)
          returning *
        `;
        const record = mapEmployee(rows[0]);
        await audit("hr.employee.created", "employee", employeeId, record);
      } else if (operation === "update") {
        const existing = await sql`select * from users where id = ${id} and organization_id = ${ORGANIZATION_ID}`;
        if (!existing.length) throw new Error("Employee was not found.");
        const current = mapEmployee(existing[0]);
        const name = clean(data.name) || current.name;
        const suppliedEmail = clean(data.email);
        const email = suppliedEmail || existing[0].email;
        const metadata = {
          ...object(existing[0].metadata),
          emailPlaceholder: suppliedEmail ? false : bool(object(existing[0].metadata).emailPlaceholder),
          title: clean(data.title),
          department: clean(data.department),
          employmentType: clean(data.employmentType),
          workMode: clean(data.workMode),
          location: clean(data.location),
          startDate: clean(data.startDate),
          phone: clean(data.phone),
          emergencyContact: clean(data.emergencyContact),
          annualLeaveBalance: number(data.annualLeaveBalance),
          medicalLeaveBalance: number(data.medicalLeaveBalance),
          skills: array(data.skills).map(clean).filter(Boolean),
          notes: clean(data.notes),
          onboarding: array(data.onboarding).length ? data.onboarding : current.onboarding,
        };
        const rows = await sql`
          update users set display_name = ${name}, email = ${email}, status = ${clean(data.status) || current.status}, metadata = ${JSON.stringify(metadata)}::jsonb
          where id = ${id} and organization_id = ${ORGANIZATION_ID}
          returning *
        `;
        await audit("hr.employee.updated", "employee", id, mapEmployee(rows[0]));
      } else if (operation === "delete") {
        await sql`delete from users where id = ${id} and organization_id = ${ORGANIZATION_ID}`;
        const operations = await loadOperations();
        const next = {
          ...operations.data,
          leaveRequests: array(operations.data.leaveRequests).filter((item: any) => item.employeeId !== id),
          attendance: array(operations.data.attendance).filter((item: any) => item.employeeId !== id),
          goals: array(operations.data.goals).filter((item: any) => item.employeeId !== id),
          learning: array(operations.data.learning).filter((item: any) => item.employeeId !== id),
        };
        await saveOperations(next);
        await audit("hr.employee.deleted", "employee", id);
      }
      return NextResponse.json(await snapshot());
    }

    const operations = await loadOperations();
    const state = operations.data;
    const keyMap: Record<string, keyof typeof defaultOperations> = {
      leave: "leaveRequests",
      attendance: "attendance",
      goals: "goals",
      learning: "learning",
    };
    const key = keyMap[resource];
    if (!key) throw new Error("Unsupported HR resource.");
    const list = array(state[key]);

    if (operation === "create") {
      const recordId = clean(data.id) || randomUUID();
      let record: any = { ...data, id: recordId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      if (resource === "leave") {
        record = {
          ...record,
          employeeId: clean(data.employeeId),
          type: clean(data.type) || "Annual Leave",
          startDate: clean(data.startDate),
          endDate: clean(data.endDate),
          days: businessDays(clean(data.startDate), clean(data.endDate)),
          status: "Pending",
          reason: clean(data.reason),
          approverNote: "",
        };
        if (!record.employeeId || !record.startDate || !record.endDate) throw new Error("Employee and leave dates are required.");
        await notify("New leave request", `${record.type} request requires review.`, "hr_leave", recordId);
      }
      state[key] = [record, ...list] as any;
      await saveOperations(state);
      await audit(`hr.${resource}.created`, `hr_${resource}`, recordId, record);
    } else if (operation === "update") {
      const updated = { ...data, id, updatedAt: new Date().toISOString() };
      state[key] = list.map((item: any) => item.id === id ? { ...item, ...updated } : item) as any;
      await saveOperations(state);
      await audit(`hr.${resource}.updated`, `hr_${resource}`, id, updated);
    } else if (operation === "delete") {
      state[key] = list.filter((item: any) => item.id !== id) as any;
      await saveOperations(state);
      await audit(`hr.${resource}.deleted`, `hr_${resource}`, id);
    } else if (operation === "action" && resource === "leave") {
      const leave = list.find((item: any) => item.id === id);
      if (!leave) throw new Error("Leave request was not found.");
      if (!["approve", "reject", "cancel"].includes(action)) throw new Error("Unsupported leave action.");
      const status = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Cancelled";
      const updated = { ...leave, status, approverNote: clean(data.approverNote), updatedAt: new Date().toISOString() };
      state.leaveRequests = list.map((item: any) => item.id === id ? updated : item);

      if (action === "approve") {
        const existing = array(state.attendance);
        const generated = leaveDates(leave.startDate, leave.endDate).map((date) => ({
          id: `leave-${id}-${date}`,
          employeeId: leave.employeeId,
          date,
          status: "Leave",
          checkIn: "",
          checkOut: "",
          note: `${leave.type} · generated from approved leave`,
          sourceId: id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        const generatedIds = new Set(generated.map((item) => item.id));
        state.attendance = [...generated, ...existing.filter((item: any) => !generatedIds.has(item.id))];
      }

      await saveOperations(state);
      await audit(`hr.leave.${action}d`, "hr_leave", id, updated);
      await notify(`Leave ${status.toLowerCase()}`, `${leave.type} request is now ${status.toLowerCase()}.`, "hr_leave", id);
    } else if (operation === "action" && resource === "attendance") {
      const employeeId = clean(data.employeeId);
      const date = clean(data.date) || new Date().toISOString().slice(0, 10);
      if (!employeeId) throw new Error("Employee is required.");
      const existing = list.find((item: any) => item.employeeId === employeeId && item.date === date);
      const now = new Date().toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: false });
      const record = existing
        ? { ...existing, checkIn: action === "check_in" ? (existing.checkIn || now) : existing.checkIn, checkOut: action === "check_out" ? now : existing.checkOut, status: existing.status || "Present", updatedAt: new Date().toISOString() }
        : { id: randomUUID(), employeeId, date, status: "Present", checkIn: action === "check_in" ? now : "", checkOut: action === "check_out" ? now : "", note: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      state.attendance = existing ? list.map((item: any) => item.id === existing.id ? record : item) : [record, ...list];
      await saveOperations(state);
      await audit(`hr.attendance.${action}`, "hr_attendance", record.id, record);
    }

    return NextResponse.json(await snapshot());
  } catch (error) {
    const message = error instanceof Error ? error.message : "HR operation failed.";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
  }
}

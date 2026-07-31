import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const SCOPE = "hr-operations-v1";
const DEFAULT_TIMEZONE = "Asia/Kuala_Lumpur";
const MAX_PHOTO_CHARACTERS = 500_000;
const MAX_CLOCK_DRIFT_SECONDS = 5 * 60;

const clean = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const array = (value: unknown) => Array.isArray(value) ? value : [];
const finiteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const defaultOperations = {
  leaveRequests: [] as any[],
  attendance: [] as any[],
  goals: [] as any[],
  learning: [] as any[],
  settings: {
    departments: ["Leadership", "Marketing", "Creative", "Technology", "Finance", "Operations"],
    leaveTypes: ["Annual Leave", "Medical Leave", "Emergency Leave", "Unpaid Leave", "Replacement Leave"],
    workModes: ["Office", "Remote", "Hybrid", "Client Site"],
    attendance: { timezone: DEFAULT_TIMEZONE, shiftStart: "09:00", graceMinutes: 15 },
  },
};

async function loadOperations() {
  const sql = getDatabase();
  const rows = await sql`select data, version from workspace_state where organization_id = ${ORGANIZATION_ID} and scope = ${SCOPE} limit 1`;
  if (!rows.length) {
    const created = await sql`
      insert into workspace_state (organization_id, scope, version, data)
      values (${ORGANIZATION_ID}, ${SCOPE}, 1, ${JSON.stringify(defaultOperations)}::jsonb)
      returning data, version
    `;
    return { data: created[0].data, version: Number(created[0].version) };
  }
  const data = { ...defaultOperations, ...object(rows[0].data) };
  data.settings = { ...defaultOperations.settings, ...object(data.settings) };
  data.settings.attendance = { ...defaultOperations.settings.attendance, ...object(data.settings.attendance) };
  return { data, version: Number(rows[0].version || 1) };
}

async function saveOperations(data: Record<string, any>) {
  const sql = getDatabase();
  await sql`
    insert into workspace_state (organization_id, scope, version, data)
    values (${ORGANIZATION_ID}, ${SCOPE}, 1, ${JSON.stringify(data)}::jsonb)
    on conflict (organization_id, scope)
    do update set data = excluded.data, version = workspace_state.version + 1, updated_at = now()
  `;
}

function zonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    timestampLabel: `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

function minutesFromClock(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
}

function photoPayload(value: unknown) {
  const dataUrl = clean(value);
  if (!dataUrl || dataUrl.length > MAX_PHOTO_CHARACTERS) throw new Error("Attendance photo is missing or too large.");
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Attendance photo must be a JPEG, PNG or WEBP image.");
  return { dataUrl, mimeType: match[1], estimatedBytes: Math.floor(match[2].length * 0.75) };
}

function locationPayload(value: unknown) {
  const source = object(value);
  const latitude = finiteNumber(source.latitude);
  const longitude = finiteNumber(source.longitude);
  const accuracy = finiteNumber(source.accuracy);
  const capturedAt = clean(source.capturedAt);
  const status = clean(source.status) || (latitude !== null && longitude !== null ? "captured" : "unavailable");
  if (latitude === null || longitude === null) return { status, latitude: null, longitude: null, accuracy: null, capturedAt: capturedAt || null };
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return { status: "invalid", latitude: null, longitude: null, accuracy: null, capturedAt: capturedAt || null };
  return { status: "captured", latitude, longitude, accuracy: accuracy !== null ? Math.max(0, Math.round(accuracy)) : null, capturedAt: capturedAt || null };
}

function firstAddressPart(address: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = clean(address[key]);
    if (value) return value;
  }
  return "";
}

async function resolveLocation(location: ReturnType<typeof locationPayload>) {
  if (location.status !== "captured" || location.latitude === null || location.longitude === null) return location;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(location.latitude),
      lon: String(location.longitude),
      zoom: "16",
      addressdetails: "1",
      "accept-language": "ms,en",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: {
        "User-Agent": "KretivOS-Attendance/1.0 (kretivco@gmail.com)",
        "Accept-Language": "ms,en;q=0.8",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Reverse geocoding failed: ${response.status}`);
    const result = object(await response.json());
    const address = object(result.address);
    const locality = firstAddressPart(address, ["neighbourhood", "suburb", "quarter", "city_district", "hamlet", "residential"]);
    const city = firstAddressPart(address, ["city", "town", "municipality", "village", "county"]);
    const state = firstAddressPart(address, ["state", "region"]);
    const country = clean(address.country);
    const postcode = clean(address.postcode);
    const road = firstAddressPart(address, ["road", "pedestrian", "service"]);
    const headline = locality || city || state || "Location captured";
    const cityLine = [city && city !== headline ? city : "", state].filter(Boolean).join(", ");
    const formattedAddress = [headline, cityLine, country].filter(Boolean).join(", ");
    return {
      ...location,
      locality: locality || null,
      city: city || null,
      state: state || null,
      country: country || null,
      postcode: postcode || null,
      road: road || null,
      headline,
      cityLine: cityLine || null,
      formattedAddress,
      geocodingStatus: "resolved",
      geocodingProvider: "OpenStreetMap Nominatim",
      geocodedAt: new Date().toISOString(),
    };
  } catch {
    return { ...location, headline: "Location captured", cityLine: null, formattedAddress: null, geocodingStatus: "unresolved" };
  } finally {
    clearTimeout(timeout);
  }
}

async function audit(action: string, entityId: string, afterData: unknown) {
  try {
    const sql = getDatabase();
    const safeData = { ...object(afterData) };
    delete safeData.photoDataUrl;
    await sql`
      insert into audit_logs (organization_id, action, entity_type, entity_id, after_data, metadata)
      values (${ORGANIZATION_ID}, ${action}, 'hr_attendance', ${entityId}, ${JSON.stringify(safeData)}::jsonb,
        ${JSON.stringify({ source: "photo-attendance-api", authentication: "skipped", containsBiometricLikePhoto: true, containsLocation: true })}::jsonb)
    `;
  } catch {}
}

async function insertPhoto(params: any) {
  const sql = getDatabase();
  const id = randomUUID();
  await sql`
    insert into assets (id, organization_id, name, asset_type, category, storage_url, mime_type, file_size, metadata)
    values (${id}, ${ORGANIZATION_ID}, ${`Attendance ${params.action} ${params.employeeId} ${params.officialAt}`},
      'hr_attendance_photo', ${params.action}, ${params.photoDataUrl}, ${params.mimeType}, ${params.fileSize},
      ${JSON.stringify({
        attendanceId: params.attendanceId, employeeId: params.employeeId, action: params.action,
        capturedAtDevice: params.capturedAtDevice, officialAt: params.officialAt,
        serverReceivedAt: params.serverReceivedAt, timezone: params.timezone,
        captureMethod: params.captureMethod, verification: params.verification,
        driftSeconds: params.driftSeconds, location: params.location,
      })}::jsonb)
  `;
  return id;
}

export async function POST(request: NextRequest) {
  let insertedPhotoId = "";
  try {
    const body = object(await request.json());
    const employeeId = clean(body.employeeId);
    const action = clean(body.action);
    const workMode = clean(body.workMode) || "Office";
    const note = clean(body.note);
    const captureMethod = clean(body.captureMethod) || "live_camera";
    const timezone = clean(body.timezone) || DEFAULT_TIMEZONE;
    const location = await resolveLocation(locationPayload(body.location));

    if (!employeeId) throw new Error("Select a team member.");
    if (!["check_in", "check_out"].includes(action)) throw new Error("Unsupported attendance action.");

    const sql = getDatabase();
    const employees = await sql`select id, display_name from users where id = ${employeeId} and organization_id = ${ORGANIZATION_ID} and status = 'active' limit 1`;
    if (!employees.length) throw new Error("Active team member was not found.");

    const photo = photoPayload(body.photoDataUrl);
    const serverReceivedAt = new Date();
    const suppliedCapture = new Date(clean(body.capturedAtDevice));
    const captureIsValid = Number.isFinite(suppliedCapture.getTime());
    const capturedAtDevice = captureIsValid ? suppliedCapture : serverReceivedAt;
    const driftSeconds = Math.round(Math.abs(serverReceivedAt.getTime() - capturedAtDevice.getTime()) / 1000);
    const verification = captureIsValid && driftSeconds <= MAX_CLOCK_DRIFT_SECONDS ? "device_capture_verified" : "server_adjusted";
    const officialDate = verification === "device_capture_verified" ? capturedAtDevice : serverReceivedAt;
    const officialAt = officialDate.toISOString();
    const local = zonedParts(officialDate, timezone);

    const operations = await loadOperations();
    const state = operations.data;
    const list = array(state.attendance);
    const settings = { ...defaultOperations.settings.attendance, ...object(state.settings?.attendance) };
    const existing = list.find((item: any) => item.employeeId === employeeId && item.date === local.date);

    if (existing?.status === "Leave") throw new Error("This team member is recorded as on leave today.");
    if (action === "check_in" && (existing?.checkInAt || existing?.checkIn)) throw new Error("This team member has already clocked in today.");
    if (action === "check_out" && (!existing?.checkInAt && !existing?.checkIn)) throw new Error("Clock in is required before clock out.");
    if (action === "check_out" && (existing?.checkOutAt || existing?.checkOut)) throw new Error("This team member has already clocked out today.");

    const attendanceId = existing?.id || randomUUID();
    insertedPhotoId = await insertPhoto({ attendanceId, employeeId, action, photoDataUrl: photo.dataUrl, mimeType: photo.mimeType,
      fileSize: photo.estimatedBytes, capturedAtDevice: capturedAtDevice.toISOString(), officialAt,
      serverReceivedAt: serverReceivedAt.toISOString(), timezone, captureMethod, verification, driftSeconds, location });

    const nowIso = serverReceivedAt.toISOString();
    let record: any;
    if (action === "check_in") {
      const lateAfter = minutesFromClock(clean(settings.shiftStart) || "09:00") + Number(settings.graceMinutes || 0);
      const lateMinutes = Math.max(0, minutesFromClock(local.time) - lateAfter);
      const status = workMode === "Remote" || workMode === "WFH" ? "WFH" : workMode === "Client Site" ? "Client Site" : "Present";
      record = { ...(existing || {}), id: attendanceId, employeeId, date: local.date, status, workMode,
        checkIn: local.time, checkInAt: officialAt, checkInDeviceAt: capturedAtDevice.toISOString(),
        checkInServerAt: serverReceivedAt.toISOString(), checkInPhotoId: insertedPhotoId,
        checkInVerification: verification, checkInDriftSeconds: driftSeconds, checkInLocation: location,
        checkOut: existing?.checkOut || "", note, lateMinutes, createdAt: existing?.createdAt || nowIso, updatedAt: nowIso };
    } else {
      const checkInAt = new Date(clean(existing.checkInAt) || `${existing.date}T${existing.checkIn}:00+08:00`);
      const durationMinutes = Number.isFinite(checkInAt.getTime()) ? Math.max(0, Math.round((officialDate.getTime() - checkInAt.getTime()) / 60_000)) : 0;
      record = { ...existing, workMode: existing.workMode || workMode, checkOut: local.time, checkOutAt: officialAt,
        checkOutDeviceAt: capturedAtDevice.toISOString(), checkOutServerAt: serverReceivedAt.toISOString(),
        checkOutPhotoId: insertedPhotoId, checkOutVerification: verification, checkOutDriftSeconds: driftSeconds,
        checkOutLocation: location, durationMinutes, note: note || existing.note || "", updatedAt: nowIso };
    }

    state.attendance = existing ? list.map((item: any) => item.id === attendanceId ? record : item) : [record, ...list];
    await saveOperations(state);
    await audit(`hr.attendance.photo_${action}`, attendanceId, { ...record, employeeName: employees[0].display_name, photoId: insertedPhotoId, timestampLabel: local.timestampLabel });

    return NextResponse.json({ ok: true, record, employeeName: employees[0].display_name, officialTime: local.time,
      officialDate: local.date, verification, driftSeconds, location, photoUrl: `/api/hr/attendance/photo/${insertedPhotoId}` },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (insertedPhotoId) {
      try { const sql = getDatabase(); await sql`delete from assets where id = ${insertedPhotoId} and organization_id = ${ORGANIZATION_ID}`; } catch {}
    }
    const message = error instanceof Error ? error.message : "Attendance capture failed.";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
  }
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Camera, ChevronRight, Clock3,
  Eye, Filter, ImageOff, RefreshCw, Search, ShieldCheck, UserRound, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateInput } from "@/components/date-input";
import { getPermittedHRMSNavigation, HRMSShell, type HRMSSession } from "@/components/hrms-shell";
import { cn } from "@/lib/utils";

type Employee = {
  id: string;
  name: string;
  title?: string;
  department?: string;
  status: string;
};

type AttendanceRecord = {
  id: string;
  employeeId: string;
  date: string;
  status: string;
  workMode?: string;
  checkIn?: string;
  checkOut?: string;
  checkInAt?: string;
  checkOutAt?: string;
  checkInDeviceAt?: string;
  checkOutDeviceAt?: string;
  checkInServerAt?: string;
  checkOutServerAt?: string;
  checkInPhotoId?: string;
  checkOutPhotoId?: string;
  checkInVerification?: string;
  checkOutVerification?: string;
  checkInDriftSeconds?: number;
  checkOutDriftSeconds?: number;
  durationMinutes?: number;
  lateMinutes?: number;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

type Snapshot = {
  employees: Employee[];
  attendance: AttendanceRecord[];
  syncedAt?: string;
};

type ReviewFilter = "all" | "verified" | "review" | "missing_photo";

const emptySnapshot: Snapshot = { employees: [], attendance: [] };

function malaysiaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function displayDate(value?: string) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function displayTimestamp(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function durationLabel(minutes?: number) {
  if (minutes === undefined || minutes === null) return "In progress";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? `${hours}h ${remaining}m` : `${remaining} min`;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function needsReview(record: AttendanceRecord) {
  const adjusted = record.checkInVerification === "server_adjusted" || record.checkOutVerification === "server_adjusted";
  const missingExpectedPhoto = (Boolean(record.checkIn || record.checkInAt) && !record.checkInPhotoId)
    || (Boolean(record.checkOut || record.checkOutAt) && !record.checkOutPhotoId);
  return adjusted || missingExpectedPhoto;
}

function fullyVerified(record: AttendanceRecord) {
  const inVerified = (!record.checkIn && !record.checkInAt) || record.checkInVerification === "device_capture_verified";
  const outVerified = (!record.checkOut && !record.checkOutAt) || record.checkOutVerification === "device_capture_verified";
  return inVerified && outVerified && !needsReview(record);
}

function verificationLabel(value?: string) {
  if (value === "device_capture_verified") return "Device capture verified";
  if (value === "server_adjusted") return "Server time used";
  return "Manual / legacy record";
}

async function requestSnapshot() {
  const response = await fetch("/api/hr", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load attendance records.");
  return data as Snapshot;
}

export function HRMSAttendanceReview({ session }: { session: HRMSSession }) {
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [employeeId, setEmployeeId] = useState("all");
  const [review, setReview] = useState<ReviewFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(malaysiaDate());

  async function load() {
    setLoading(true);
    setError("");
    try {
      const snapshot = await requestSnapshot();
      setData(snapshot);
      setSelected((current) => current ? snapshot.attendance.find((item) => item.id === current.id) || null : null);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load attendance records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const employeeMap = useMemo(() => new Map(data.employees.map((employee) => [employee.id, employee])), [data.employees]);
  const employeeName = (id: string) => employeeMap.get(id)?.name || "Unknown team member";

  const records = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...data.attendance]
      .filter((record) => {
        if (employeeId !== "all" && record.employeeId !== employeeId) return false;
        if (dateFrom && record.date < dateFrom) return false;
        if (dateTo && record.date > dateTo) return false;
        if (review === "verified" && !fullyVerified(record)) return false;
        if (review === "review" && !needsReview(record)) return false;
        if (review === "missing_photo") {
          const missing = (Boolean(record.checkIn || record.checkInAt) && !record.checkInPhotoId)
            || (Boolean(record.checkOut || record.checkOutAt) && !record.checkOutPhotoId);
          if (!missing) return false;
        }
        if (term && ![
          employeeName(record.employeeId), record.date, record.status, record.workMode,
          record.checkIn, record.checkOut, record.note,
        ].some((value) => String(value || "").toLowerCase().includes(term))) return false;
        return true;
      })
      .sort((a, b) => {
        const left = a.checkInAt || `${a.date}T${a.checkIn || "00:00"}:00+08:00`;
        const right = b.checkInAt || `${b.date}T${b.checkIn || "00:00"}:00+08:00`;
        return right.localeCompare(left);
      });
  }, [data.attendance, employeeId, dateFrom, dateTo, review, query, employeeMap]);

  const stats = useMemo(() => ({
    total: data.attendance.length,
    withPhotos: data.attendance.filter((record) => record.checkInPhotoId || record.checkOutPhotoId).length,
    verified: data.attendance.filter(fullyVerified).length,
    review: data.attendance.filter(needsReview).length,
  }), [data.attendance]);

  return <HRMSShell
    activeId="attendance"
    title="Attendance Review"
    description="Photo evidence and timestamp verification"
    navigation={getPermittedHRMSNavigation(session)}
    session={session}
    actions={<>
      <Button asChild variant="outline" size="icon" className="bg-card sm:w-auto sm:px-4" aria-label="Back"><a href="/hr?section=attendance" aria-label="Back to attendance"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Attendance</span></a></Button>
      <Button variant="outline" size="icon" aria-label="Refresh" className="bg-card sm:w-auto sm:px-4" onClick={load} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /><span className="hidden sm:inline">Refresh</span></Button>
    </>}
  >
    <div className="space-y-5">
      <Card className="border-emerald-200 bg-emerald-50/80"><CardContent className="flex items-start gap-3 p-4 text-xs leading-5 text-emerald-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>Attendance evidence is private and available only to HR Admin or Manager. Replacing or removing a photo preserves the official attendance timestamp and writes an audit entry.</span></CardContent></Card>

      {error && <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="All records" value={stats.total} note="Shared HR attendance history" icon={Clock3} />
        <Stat label="With evidence" value={stats.withPhotos} note="Clock-in or clock-out photo" icon={Camera} />
        <Stat label="Verified" value={stats.verified} note="Capture timestamp matched server" icon={ShieldCheck} />
        <Stat label="Needs review" value={stats.review} note="Adjusted time or missing photo" icon={AlertTriangle} />
      </div>

      <Card className="border-black/8 bg-white/90"><CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Filter className="h-4 w-4 text-accent" />Filters</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="kretivos-search-control h-11 w-full rounded-xl border bg-card pl-11 pr-3 text-sm outline-none focus:border-accent" placeholder="Search staff, date, note…" /></label>
          <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="h-11 rounded-xl border bg-card px-3 text-sm outline-none"><option value="all">All staff</option>{data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>
          <select value={review} onChange={(event) => setReview(event.target.value as ReviewFilter)} className="h-11 rounded-xl border bg-card px-3 text-sm outline-none"><option value="all">All verification</option><option value="verified">Verified</option><option value="review">Needs review</option><option value="missing_photo">Missing photo</option></select>
          <DateInput value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Date from" />
          <DateInput value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Date to" />
        </div>
      </CardContent></Card>

      <div className="flex items-center justify-between gap-3">
        <div><h2 className="font-semibold">Attendance records</h2><p className="mt-1 text-xs text-muted-foreground">{records.length} record{records.length === 1 ? "" : "s"}. Select a row to view both images and timestamp details.</p></div>
      </div>

      <Card className="hidden overflow-hidden border-black/8 bg-white/90 lg:block">
        <div className="grid grid-cols-[1.45fr_.8fr_.72fr_.72fr_.78fr_.7fr_.52fr] gap-3 border-b bg-background px-5 py-3 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
          <div>Staff</div><div>Date</div><div>Clock in</div><div>Clock out</div><div>Duration</div><div>Verification</div><div />
        </div>
        {records.map((record) => {
          const employee = employeeMap.get(record.employeeId);
          const flagged = needsReview(record);
          return <button key={record.id} onClick={() => setSelected(record)} className="grid w-full grid-cols-[1.45fr_.8fr_.72fr_.72fr_.78fr_.7fr_.52fr] items-center gap-3 border-b px-5 py-4 text-left transition last:border-b-0 hover:bg-card">
            <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-xs font-semibold text-white">{initials(employee?.name || "U")}</div><div className="min-w-0"><div className="truncate text-sm font-semibold">{employee?.name || "Unknown"}</div><div className="mt-1 truncate text-[10px] text-muted-foreground">{record.workMode || record.status} · {employee?.department || "Team"}</div></div></div>
            <div className="text-xs">{displayDate(record.date)}</div>
            <TimeCell time={record.checkIn} hasPhoto={Boolean(record.checkInPhotoId)} />
            <TimeCell time={record.checkOut} hasPhoto={Boolean(record.checkOutPhotoId)} />
            <div className="text-xs font-medium">{durationLabel(record.durationMinutes)}</div>
            <ReviewBadge flagged={flagged} />
            <div className="flex justify-end"><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>
          </button>;
        })}
        {!loading && !records.length && <Empty />}
        {loading && !data.attendance.length && <div className="p-12 text-center text-sm text-muted-foreground">Loading attendance records…</div>}
      </Card>

      <div className="space-y-3 lg:hidden">
        {records.map((record) => {
          const employee = employeeMap.get(record.employeeId);
          return <button key={record.id} onClick={() => setSelected(record)} className="w-full rounded-2xl border border-black/8 bg-white/90 p-4 text-left shadow-sm">
            <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-xs font-semibold text-white">{initials(employee?.name || "U")}</div><div className="min-w-0 flex-1"><div className="truncate font-semibold">{employee?.name || "Unknown"}</div><div className="mt-1 text-xs text-muted-foreground">{displayDate(record.date)} · {record.workMode || record.status}</div></div><ReviewBadge flagged={needsReview(record)} /></div>
            <div className="mt-4 grid grid-cols-3 gap-2"><Mini label="Clock in" value={record.checkIn || "—"} photo={Boolean(record.checkInPhotoId)} /><Mini label="Clock out" value={record.checkOut || "—"} photo={Boolean(record.checkOutPhotoId)} /><Mini label="Duration" value={durationLabel(record.durationMinutes)} /></div>
          </button>;
        })}
        {!loading && !records.length && <Empty />}
      </div>
    </div>

    {selected && <AttendanceDetail
      record={selected}
      employee={employeeMap.get(selected.employeeId)}
      onClose={() => setSelected(null)}
    />}
  </HRMSShell>;
}

function Stat({ label, value, note, icon: Icon }: { label: string; value: number; note: string; icon: any }) {
  return <Card className="border-black/8 bg-white/90"><CardContent className="p-4"><div className="flex items-center justify-between"><div className="text-xs text-muted-foreground">{label}</div><Icon className="h-4 w-4 text-accent" /></div><div className="mt-2 text-2xl font-semibold">{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{note}</div></CardContent></Card>;
}

function ReviewBadge({ flagged }: { flagged: boolean }) {
  return <span className={cn("inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium", flagged ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
    {flagged ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
    {flagged ? "Review" : "Verified"}
  </span>;
}

function TimeCell({ time, hasPhoto }: { time?: string; hasPhoto: boolean }) {
  return <div><div className="text-xs font-semibold">{time || "—"}</div><div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">{hasPhoto ? <><Camera className="h-3 w-3" />Photo</> : <><ImageOff className="h-3 w-3" />No photo</>}</div></div>;
}

function Mini({ label, value, photo }: { label: string; value: string; photo?: boolean }) {
  return <div className="rounded-xl bg-background p-3"><div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground"><span>{label}</span>{photo && <Camera className="h-3 w-3" />}</div><div className="mt-1 truncate text-xs font-semibold">{value}</div></div>;
}

function Empty() {
  return <div className="p-12 text-center"><Clock3 className="mx-auto h-7 w-7 text-muted-foreground" /><div className="mt-3 font-semibold">No matching attendance records</div><p className="mt-1 text-xs text-muted-foreground">Change the filters or create the first photo attendance record.</p></div>;
}

function AttendanceDetail({ record, employee, onClose }: { record: AttendanceRecord; employee?: Employee; onClose: () => void }) {
  return <div className="fixed inset-0 z-[180] bg-black/55" onClick={onClose}>
    <div className="absolute inset-x-0 bottom-0 max-h-[94dvh] overflow-y-auto rounded-t-3xl bg-background shadow-2xl md:inset-y-0 md:left-auto md:w-[min(760px,92vw)] md:rounded-none" onClick={(event) => event.stopPropagation()}>
      <div className="sticky top-0 z-20 flex items-start justify-between border-b bg-background/95 p-4 backdrop-blur sm:p-6">
        <div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-accent">Attendance details</div><h2 className="mt-1 truncate text-xl font-semibold">{employee?.name || "Unknown team member"}</h2><p className="mt-1 text-xs text-muted-foreground">{displayDate(record.date)} · {record.workMode || record.status}</p></div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-4"><Mini label="Clock in" value={record.checkIn || "—"} photo={Boolean(record.checkInPhotoId)} /><Mini label="Clock out" value={record.checkOut || "—"} photo={Boolean(record.checkOutPhotoId)} /><Mini label="Duration" value={durationLabel(record.durationMinutes)} /><Mini label="Punctuality" value={Number(record.lateMinutes || 0) > 0 ? `${record.lateMinutes} min late` : "On time"} /></div>

        <div className="grid gap-4 xl:grid-cols-2">
          <EvidencePanel title="Clock in evidence" photoId={record.checkInPhotoId} time={record.checkIn} verification={record.checkInVerification} drift={record.checkInDriftSeconds} deviceAt={record.checkInDeviceAt} serverAt={record.checkInServerAt} officialAt={record.checkInAt} />
          <EvidencePanel title="Clock out evidence" photoId={record.checkOutPhotoId} time={record.checkOut} verification={record.checkOutVerification} drift={record.checkOutDriftSeconds} deviceAt={record.checkOutDeviceAt} serverAt={record.checkOutServerAt} officialAt={record.checkOutAt} />
        </div>

        <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-accent" /><h3 className="font-semibold">Record information</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Detail label="Employee" value={employee?.name || "Unknown"} /><Detail label="Department" value={employee?.department || "—"} /><Detail label="Attendance status" value={record.status || "—"} /><Detail label="Work mode" value={record.workMode || "—"} /><Detail label="Record created" value={displayTimestamp(record.createdAt)} /><Detail label="Last updated" value={displayTimestamp(record.updatedAt)} /></div>{record.note && <div className="mt-4 rounded-xl bg-background p-4"><div className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">Note</div><p className="mt-2 text-sm leading-6">{record.note}</p></div>}</CardContent></Card>
      </div>
    </div>
  </div>;
}

function EvidencePanel({ title, photoId, time, verification, drift, deviceAt, serverAt, officialAt }: {
  title: string;
  photoId?: string;
  time?: string;
  verification?: string;
  drift?: number;
  deviceAt?: string;
  serverAt?: string;
  officialAt?: string;
}) {
  const flagged = verification === "server_adjusted" || Boolean(time) && !photoId;
  return <Card className="overflow-hidden border-black/8 bg-white/90">
    <div className="flex items-center justify-between border-b px-4 py-3"><div><div className="font-semibold">{title}</div><div className="mt-1 text-xs text-muted-foreground">{time || "No time recorded"}</div></div><ReviewBadge flagged={flagged} /></div>
    {photoId ? <a href={`/api/hr/attendance/photo/${photoId}`} target="_blank" rel="noreferrer" className="group relative block bg-black"><img src={`/api/hr/attendance/photo/${photoId}`} alt={title} className="h-[320px] w-full object-contain" /><span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100"><Eye className="h-3.5 w-3.5" />Open full image</span></a> : <div className="flex h-[260px] flex-col items-center justify-center bg-muted text-center"><ImageOff className="h-8 w-8 text-muted-foreground" /><div className="mt-3 text-sm font-semibold">No photo evidence</div><p className="mt-1 max-w-xs text-xs text-muted-foreground">This may be a manual, leave or legacy attendance record.</p></div>}
    <CardContent className="grid gap-3 p-4 sm:grid-cols-2"><Detail label="Official timestamp" value={displayTimestamp(officialAt)} /><Detail label="Verification" value={verificationLabel(verification)} /><Detail label="Device capture" value={displayTimestamp(deviceAt)} /><Detail label="Server received" value={displayTimestamp(serverAt)} /><Detail label="Clock drift" value={typeof drift === "number" ? `${drift} seconds` : "—"} /><Detail label="Evidence ID" value={photoId || "—"} /></CardContent>
  </Card>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-background p-3"><div className="text-[10px] text-muted-foreground">{label}</div><div className="mt-1 break-words text-xs font-medium">{value}</div></div>;
}

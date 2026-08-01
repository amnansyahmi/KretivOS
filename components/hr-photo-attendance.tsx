"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Clock3, Eye, LogIn, LogOut, MapPin, RefreshCw, RotateCcw, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Employee = { id: string; name: string; status: string; workMode?: string; title?: string };
type Geo = { status?: string; latitude?: number | null; longitude?: number | null; accuracy?: number | null; capturedAt?: string | null };
type Attendance = { id: string; employeeId: string; date: string; status: string; workMode?: string; checkIn?: string; checkOut?: string; checkInAt?: string; checkOutAt?: string; checkInPhotoId?: string; checkOutPhotoId?: string; checkInVerification?: string; checkOutVerification?: string; checkInDriftSeconds?: number; checkOutDriftSeconds?: number; checkInLocation?: Geo; checkOutLocation?: Geo; durationMinutes?: number; lateMinutes?: number; note?: string };
type Action = "check_in" | "check_out";
type Props = { employees: Employee[]; attendance: Attendance[]; query?: string; onRefresh: () => Promise<void> | void; onNotice: (message: string) => void; onError: (message: string) => void };
type Evidence = { photoId: string; employeeName: string; action: Action; time: string; date: string; verification?: string; driftSeconds?: number; geo?: Geo };

const dateMY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const displayDate = (value: string) => new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" });
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const geoLabel = (geo?: Geo) => geo?.status === "captured" && typeof geo.latitude === "number" && typeof geo.longitude === "number" ? `${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}${geo.accuracy ? ` · ±${geo.accuracy}m` : ""}` : geo?.status === "denied" ? "Location permission denied" : geo?.status === "timeout" ? "Location timed out" : "Location unavailable";
const verifyLabel = (value?: string) => value === "device_capture_verified" ? "Capture time verified" : value === "server_adjusted" ? "Server time used" : "Manual / legacy";
const duration = (minutes?: number) => minutes === undefined ? "In progress" : `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h ` : ""}${minutes % 60}m`;

function getGeo(): Promise<Geo> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ status: "unsupported", capturedAt: new Date().toISOString() });
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ status: "captured", latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: Math.round(position.coords.accuracy), capturedAt: new Date(position.timestamp || Date.now()).toISOString() }),
      (error) => resolve({ status: error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable", capturedAt: new Date().toISOString() }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}

export function HRPhotoAttendance({ employees, attendance, query = "", onRefresh, onNotice, onError }: Props) {
  const active = useMemo(() => employees.filter((employee) => employee.status === "active"), [employees]);
  const [employeeId, setEmployeeId] = useState("");
  const [camera, setCamera] = useState<{ employee: Employee; action: Action } | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const today = dateMY();
  useEffect(() => { if (!active.some((employee) => employee.id === employeeId)) setEmployeeId(active[0]?.id || ""); }, [active, employeeId]);
  const selected = active.find((employee) => employee.id === employeeId);
  const todayRecord = attendance.find((record) => record.employeeId === employeeId && record.date === today);
  const next: Action | null = !todayRecord?.checkIn && !todayRecord?.checkInAt ? "check_in" : !todayRecord?.checkOut && !todayRecord?.checkOutAt ? "check_out" : null;
  const employeeName = (id: string) => employees.find((employee) => employee.id === id)?.name || "Unknown team member";
  const term = query.trim().toLowerCase();
  const filtered = attendance.filter((record) => !term || [employeeName(record.employeeId), record.date, record.status, record.workMode, record.note].some((value) => String(value || "").toLowerCase().includes(term)));
  const todayRows = attendance.filter((record) => record.date === today);

  function inspect(record: Attendance, action: Action) {
    const photoId = action === "check_in" ? record.checkInPhotoId : record.checkOutPhotoId;
    if (!photoId) return;
    setEvidence({ photoId, employeeName: employeeName(record.employeeId), action, date: record.date, time: action === "check_in" ? record.checkIn || "—" : record.checkOut || "—", verification: action === "check_in" ? record.checkInVerification : record.checkOutVerification, driftSeconds: action === "check_in" ? record.checkInDriftSeconds : record.checkOutDriftSeconds, geo: action === "check_in" ? record.checkInLocation : record.checkOutLocation });
  }

  return <div className="space-y-5">
    <Card className="overflow-hidden bg-[#26342b] text-white"><CardContent className="p-0"><div className="grid lg:grid-cols-2"><div className="p-5 sm:p-7"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#efb99f]"><Camera className="h-4 w-4" />Photo attendance</div><h2 className="mt-3 text-2xl font-semibold">Clock in or out with photo and GPS</h2><p className="mt-2 text-sm text-white/55">Photo, official time and GPS evidence are stored separately.</p><div className="mt-6 grid grid-cols-3 gap-3"><StatDark label="Clocked in" value={`${todayRows.filter((row) => row.checkIn).length}/${active.length}`} /><StatDark label="Completed" value={todayRows.filter((row) => row.checkOut).length} /><StatDark label="Late" value={todayRows.filter((row) => Number(row.lateMinutes || 0) > 0).length} /></div></div><div className="border-t border-white/10 bg-black/10 p-5 sm:p-7 lg:border-l lg:border-t-0"><label className="text-xs text-white/70">Team member</label><select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white">{active.map((employee) => <option key={employee.id} value={employee.id} className="text-black">{employee.name}</option>)}</select>{selected && <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-xs font-bold text-[#26342b]">{initials(selected.name)}</div><div><div className="font-semibold">{selected.name}</div><div className="text-[11px] text-white/45">{selected.title || "Kretivco team"}</div></div></div><div className="mt-4 grid grid-cols-2 gap-2"><MiniDark label="Clock in" value={todayRecord?.checkIn || "Not yet"} /><MiniDark label="Clock out" value={todayRecord?.checkOut || "Not yet"} /></div>{next ? <Button className="mt-4 h-12 w-full bg-[#ef7f5f]" onClick={() => setCamera({ employee: selected, action: next })}>{next === "check_in" ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}Take photo & {next === "check_in" ? "clock in" : "clock out"}</Button> : <div className="mt-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500/15 text-sm font-semibold text-emerald-200"><CheckCircle2 className="h-4 w-4" />Completed today</div>}</div>}</div></div></CardContent></Card>

    <div><h2 className="font-semibold">Attendance history</h2><p className="mt-1 text-xs text-muted-foreground">Tap a photo time to view or manage evidence.</p></div>
    <div className="space-y-3">{filtered.map((record) => <Card key={record.id} className="bg-white/90"><CardContent className="p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="flex flex-1 items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#202c25] text-xs font-semibold text-white">{initials(employeeName(record.employeeId))}</div><div><div className="font-semibold">{employeeName(record.employeeId)}</div><div className="text-xs text-muted-foreground">{displayDate(record.date)} · {record.workMode || record.status}</div></div></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[520px]"><EvidenceCell label="Clock in" value={record.checkIn || "—"} enabled={Boolean(record.checkInPhotoId)} onClick={() => inspect(record, "check_in")} /><EvidenceCell label="Clock out" value={record.checkOut || "—"} enabled={Boolean(record.checkOutPhotoId)} onClick={() => inspect(record, "check_out")} /><Info label="Duration" value={duration(record.durationMinutes)} /><Info label="Punctuality" value={Number(record.lateMinutes || 0) ? `${record.lateMinutes} min late` : "On time"} /></div></div></CardContent></Card>)}{!filtered.length && <div className="rounded-2xl border border-dashed p-10 text-center"><Clock3 className="mx-auto h-7 w-7 text-muted-foreground" /><div className="mt-3 font-semibold">No attendance records</div></div>}</div>

    {camera && <CaptureDialog employee={camera.employee} action={camera.action} onClose={() => setCamera(null)} onDone={async (result) => { setCamera(null); await onRefresh(); onNotice(`${result.employeeName} ${camera.action === "check_in" ? "clocked in" : "clocked out"} at ${result.officialTime}.`); }} onError={onError} />}
    {evidence && <EvidenceDialog evidence={evidence} onClose={() => setEvidence(null)} onChanged={async (message) => { setEvidence(null); await onRefresh(); onNotice(message); }} onError={onError} />}
  </div>;
}

function StatDark({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-white/10 bg-white/5 p-3"><div className="text-[10px] text-white/40">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>; }
function MiniDark({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-black/15 p-3 text-xs"><div className="text-white/40">{label}</div><div className="mt-1 font-semibold">{value}</div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[#f7f4ed] p-3"><div className="text-[10px] text-muted-foreground">{label}</div><div className="mt-1 text-xs font-semibold">{value}</div></div>; }
function EvidenceCell({ label, value, enabled, onClick }: { label: string; value: string; enabled: boolean; onClick: () => void }) { return <button disabled={!enabled} onClick={onClick} className={cn("rounded-xl p-3 text-left", enabled ? "bg-[#f1ece2]" : "bg-[#f7f4ed]")}><div className="flex justify-between text-[10px] text-muted-foreground">{label}{enabled && <Eye className="h-3.5 w-3.5" />}</div><div className="mt-1 text-xs font-semibold">{value}</div></button>; }

function CaptureDialog({ employee, action, onClose, onDone, onError }: { employee: Employee; action: Action; onClose: () => void; onDone: (result: any) => Promise<void> | void; onError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(true);
  const [geo, setGeo] = useState<Geo>({ status: "requesting" });
  const [workMode, setWorkMode] = useState(employee.workMode === "Remote" ? "Remote" : employee.workMode === "Client Site" ? "Client Site" : "Office");
  const [note, setNote] = useState("");
  const [now, setNow] = useState(new Date());

  async function startCamera() {
    setError("");
    stream.current?.getTracks().forEach((track) => track.stop());
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera is unavailable.");
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } } });
      stream.current = nextStream;
      if (video.current) { video.current.srcObject = nextStream; await video.current.play(); }
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to open camera."); }
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    startCamera();
    getGeo().then((value) => { setGeo(value); setGeoBusy(false); });
    return () => { window.clearInterval(timer); stream.current?.getTracks().forEach((track) => track.stop()); };
  }, []);

  function makeImage(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, capturedAt: Date, mirror: boolean) {
    const scale = Math.min(640 / sourceWidth, 800 / sourceHeight, 1);
    const width = Math.max(320, Math.round(sourceWidth * scale));
    const height = Math.max(400, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Unable to prepare photo.");
    context.save(); if (mirror) { context.translate(width, 0); context.scale(-1, 1); } context.drawImage(source, 0, 0, width, height); context.restore();
    const gradient = context.createLinearGradient(0, height - 140, 0, height); gradient.addColorStop(0, "rgba(0,0,0,0)"); gradient.addColorStop(1, "rgba(0,0,0,.85)"); context.fillStyle = gradient; context.fillRect(0, height - 150, width, 150);
    const timestamp = capturedAt.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    context.fillStyle = "white"; context.font = "700 18px Arial"; context.fillText(`${action === "check_in" ? "CLOCK IN" : "CLOCK OUT"} · ${employee.name}`, 20, height - 48); context.font = "500 14px Arial"; context.fillStyle = "rgba(255,255,255,.82)"; context.fillText(`${timestamp} · ${workMode}`, 20, height - 22);
    return canvas.toDataURL("image/jpeg", .62);
  }

  async function send(photoDataUrl: string, capturedAt: Date, method: string) {
    setBusy(true); setGeoBusy(true);
    try {
      const latestGeo = await getGeo(); setGeo(latestGeo); setGeoBusy(false);
      const response = await fetch("/api/hr/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: employee.id, action, workMode, note, photoDataUrl, capturedAtDevice: capturedAt.toISOString(), captureMethod: method, location: latestGeo, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kuala_Lumpur" }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Attendance submission failed."); await onDone(result);
    } catch (value) { const message = value instanceof Error ? value.message : "Attendance submission failed."; setError(message); onError(message); }
    finally { setBusy(false); setGeoBusy(false); }
  }

  async function capture() { if (!video.current?.videoWidth || !video.current.videoHeight) return setError("Camera is still loading."); const capturedAt = new Date(); await send(makeImage(video.current, video.current.videoWidth, video.current.videoHeight, capturedAt, true), capturedAt, "live_camera"); }
  async function fallback(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; const url = URL.createObjectURL(file); try { const image = new Image(); await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Unable to read image.")); image.src = url; }); const capturedAt = file.lastModified ? new Date(file.lastModified) : new Date(); await send(makeImage(image, image.naturalWidth, image.naturalHeight, capturedAt, false), capturedAt, "camera_file_fallback"); } finally { URL.revokeObjectURL(url); } }

  return <div className="fixed inset-0 z-[170] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"><div className="max-h-[96dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[#111814] text-white sm:rounded-3xl"><div className="sticky top-0 z-20 flex justify-between border-b border-white/10 bg-[#111814]/95 p-4"><div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#ef9a79]">{action === "check_in" ? "Clock in" : "Clock out"}</div><h2 className="mt-1 text-xl font-semibold">{employee.name}</h2></div><button onClick={onClose}><X className="h-5 w-5" /></button></div><div className="p-4 sm:p-5"><div className="relative aspect-[3/4] max-h-[58dvh] overflow-hidden rounded-2xl bg-black"><video ref={video} muted playsInline className="h-full w-full scale-x-[-1] object-cover" /><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-16"><div className="font-semibold">{employee.name}</div><div className="mt-1 font-mono text-xs text-white/70">{now.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour12: false })}</div><div className="mt-1 flex items-center gap-1 text-[10px] text-white/60"><MapPin className="h-3 w-3" />{geoBusy ? "Detecting location…" : geoLabel(geo)}</div></div>{error && <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-6 text-center"><AlertTriangle className="h-8 w-8 text-amber-400" /><p className="mt-3 text-xs text-white/60">{error}</p><label className="mt-4 inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black"><Camera className="h-4 w-4" />Camera fallback<input type="file" accept="image/*" capture="user" className="hidden" onChange={fallback} /></label></div>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-white/65">Work location<select value={workMode} onChange={(event) => setWorkMode(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/12 bg-white/8 px-3"><option className="text-black">Office</option><option className="text-black">Remote</option><option className="text-black">Client Site</option></select></label><label className="text-xs text-white/65">Note<input value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/12 bg-white/8 px-3" placeholder="Optional" /></label></div><div className="mt-4 flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] text-white/55"><ShieldCheck className="h-4 w-4 shrink-0" />GPS and photo changes never modify official attendance time.</div><div className="mt-4 grid grid-cols-[auto_1fr] gap-2"><Button variant="outline" size="icon" className="h-12 border-white/15 bg-white/5 text-white" onClick={startCamera} aria-label="Reset"><RotateCcw className="h-4 w-4" /></Button><Button className="h-12 bg-[#ef7f5f]" disabled={busy || Boolean(error)} onClick={capture}>{busy ? <><RefreshCw className="h-4 w-4 animate-spin" />{geoBusy ? "Detecting GPS…" : "Submitting…"}</> : <><Camera className="h-4 w-4" />Capture & {action === "check_in" ? "clock in" : "clock out"}</>}</Button></div></div></div></div>;
}

function EvidenceDialog({ evidence, onClose, onChanged, onError }: { evidence: Evidence; onClose: () => void; onChanged: (message: string) => Promise<void> | void; onError: (message: string) => void }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  async function update(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setBusy(true); try { const photoDataUrl = await replacement(file, evidence); const response = await fetch(`/api/hr/attendance/photo/${evidence.photoId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoDataUrl, replacementSource: "photo_evidence_dialog" }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to update image."); await onChanged("Photo evidence updated. Attendance time was preserved."); } catch (value) { onError(value instanceof Error ? value.message : "Unable to update image."); } finally { setBusy(false); } }
  async function remove() { if (!await confirm({ title: "Delete this image?", description: "The attendance time itself is unchanged.", destructive: true })) return; setBusy(true); try { const response = await fetch(`/api/hr/attendance/photo/${evidence.photoId}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to delete image."); await onChanged("Photo evidence deleted. Attendance time was preserved."); } catch (value) { onError(value instanceof Error ? value.message : "Unable to delete image."); } finally { setBusy(false); } }
  const mapReady = evidence.geo?.status === "captured" && typeof evidence.geo.latitude === "number" && typeof evidence.geo.longitude === "number";
  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/75 p-4" onClick={onClose}><div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white" onClick={(event) => event.stopPropagation()}><div className="flex justify-between border-b p-4"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ba5c42]">Photo evidence</div><h2 className="mt-1 font-semibold">{evidence.employeeName} · {evidence.action === "check_in" ? "Clock in" : "Clock out"}</h2></div><button onClick={onClose}><X className="h-4 w-4" /></button></div><img src={`/api/hr/attendance/photo/${evidence.photoId}`} alt="Attendance evidence" className="max-h-[52dvh] w-full bg-black object-contain" /><div className="grid gap-2 p-4 sm:grid-cols-3"><Info label="Attendance time" value={`${displayDate(evidence.date)} · ${evidence.time}`} /><Info label="Verification" value={verifyLabel(evidence.verification)} /><Info label="Clock drift" value={typeof evidence.driftSeconds === "number" ? `${evidence.driftSeconds}s` : "—"} /></div><div className="mx-4 mb-4 rounded-xl bg-[#f7f4ed] p-3"><div className="flex items-center gap-2 text-[10px] text-muted-foreground"><MapPin className="h-3.5 w-3.5" />Captured location</div><div className="mt-1 text-xs font-semibold">{geoLabel(evidence.geo)}</div>{mapReady && <a href={`https://www.google.com/maps?q=${evidence.geo?.latitude},${evidence.geo?.longitude}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-[#ba5c42]">Open in Maps</a>}</div><div className="flex flex-wrap gap-2 border-t p-4"><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-medium"><Upload className="h-4 w-4" />Update image<input type="file" accept="image/*" className="hidden" disabled={busy} onChange={update} /></label><Button variant="outline" className="text-red-600" disabled={busy} onClick={remove}><Trash2 className="h-4 w-4" />Delete image</Button><span className="ml-auto self-center text-[10px] text-muted-foreground">Time will not change</span></div></div></div>;
}

async function replacement(file: File, evidence: Evidence) { const url = URL.createObjectURL(file); try { const image = new Image(); await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Unable to read image.")); image.src = url; }); const scale = Math.min(640 / image.naturalWidth, 800 / image.naturalHeight, 1); const width = Math.max(320, Math.round(image.naturalWidth * scale)); const height = Math.max(400, Math.round(image.naturalHeight * scale)); const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d"); if (!context) throw new Error("Unable to prepare image."); context.drawImage(image, 0, 0, width, height); const gradient = context.createLinearGradient(0, height - 140, 0, height); gradient.addColorStop(0, "rgba(0,0,0,0)"); gradient.addColorStop(1, "rgba(0,0,0,.85)"); context.fillStyle = gradient; context.fillRect(0, height - 150, width, 150); context.fillStyle = "white"; context.font = "700 18px Arial"; context.fillText(`${evidence.action === "check_in" ? "CLOCK IN" : "CLOCK OUT"} · ${evidence.employeeName}`, 20, height - 48); context.font = "500 14px Arial"; context.fillStyle = "rgba(255,255,255,.82)"; context.fillText(`${displayDate(evidence.date)} · ${evidence.time} · REPLACEMENT EVIDENCE`, 20, height - 22); return canvas.toDataURL("image/jpeg", .62); } finally { URL.revokeObjectURL(url); } }

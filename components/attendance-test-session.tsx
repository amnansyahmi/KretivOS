"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { FlaskConical, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm";
import { DateInput } from "@/components/date-input";

type Employee = { id: string; name: string; status: string };
type Attendance = { id: string; employeeId: string; date: string; checkIn?: string; checkOut?: string };

function todayMY() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function AttendanceTestSession() {
  const confirm = useConfirm();
  const pathname = usePathname();
  const visible = pathname === "/hr" || pathname.startsWith("/hr/attendance");
  const [admin, setAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<Attendance[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(todayMY());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const response = await fetch("/api/hr", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load attendance data.");
    const active = (result.employees || []).filter((employee: Employee) => employee.status === "active");
    setEmployees(active);
    setRecords(result.attendance || []);
    setEmployeeId((current) => active.some((employee: Employee) => employee.id === current) ? current : active[0]?.id || "");
  }

  useEffect(() => {
    if (visible && open) load().catch((value) => setError(value instanceof Error ? value.message : "Unable to load attendance data."));
  }, [visible, open]);

  useEffect(() => {
    if (!visible) return;
    fetch("/api/hr/auth/status", { cache: "no-store" }).then((response) => response.json()).then((result) => setAdmin(result.session?.role === "hr_admin")).catch(() => setAdmin(false));
  }, [visible]);

  const employee = employees.find((item) => item.id === employeeId);
  const record = useMemo(() => records.find((item) => item.employeeId === employeeId && item.date === date), [records, employeeId, date]);

  async function startNewSession() {
    if (!employee || !record) return;
    const confirmed = await confirm({
      title: `Start a fresh testing session for ${employee.name}?`,
      description: `The attendance already recorded for ${date} is archived, not deleted.`,
      confirmLabel: "Archive and restart",
    });
    if (!confirmed) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/hr/attendance/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, date, reason: "Temporary attendance testing session" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to start a new testing session.");
      setNotice(`${employee.name} can now clock in again. The earlier record remains archived.`);
      await load();
      window.dispatchEvent(new CustomEvent("kretivos-hr-attendance-reset"));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to start a new testing session.");
    } finally {
      setBusy(false);
    }
  }

  if (!visible || !admin) return null;

  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-[86] flex min-h-11 items-center gap-2 rounded-full border border-amber-300 bg-amber-100 px-4 text-xs font-semibold text-amber-950 shadow-xl sm:bottom-5 sm:right-5">
      <FlaskConical className="h-4 w-4" />Test reset
    </button>

    {open && <div className="fixed inset-0 z-[195] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg rounded-t-3xl bg-[#f7f4ed] p-5 shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-amber-700">Temporary testing</div><h2 className="mt-1 text-xl font-semibold">Start New Attendance Session</h2></div>
          <button onClick={() => setOpen(false)} className="rounded-xl p-2 hover:bg-black/5"><X className="h-4 w-4" /></button>
        </div>

        <p className="mt-3 text-xs leading-5 text-muted-foreground">The current record is moved to a recovery archive. The staff can then perform a fresh Clock In without permanently deleting the earlier timestamps or photo references.</p>

        {notice && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted-foreground">Staff<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm text-foreground">{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-xs font-medium text-muted-foreground">Date<span className="mt-2 block"><DateInput value={date} onChange={(event) => setDate(event.target.value)} /></span></label>
        </div>

        <div className="mt-4 rounded-xl bg-white p-4"><div className="text-[10px] uppercase tracking-[.14em] text-muted-foreground">Current session</div><div className="mt-2 text-sm font-semibold">{record ? `${record.checkIn || "—"} – ${record.checkOut || "—"}` : "No attendance record found"}</div></div>

        <Button className="mt-5 h-12 w-full bg-amber-600 text-white hover:bg-amber-700" disabled={!record || busy} onClick={startNewSession}>
          {busy ? <><RefreshCw className="h-4 w-4 animate-spin" />Preparing…</> : <><FlaskConical className="h-4 w-4" />Start fresh testing session</>}
        </Button>
      </div>
    </div>}
  </>;
}

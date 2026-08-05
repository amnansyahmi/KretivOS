"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Pencil, Plus, Printer, Trash2, Users, X } from "lucide-react";
import { HRMSAIInsight } from "@/components/hrms-ai-insight";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateInput, MonthInput } from "@/components/date-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/badge";
import { classifyDay, hourlyRate, multiplierFor, overtimeStatusOf, toOvertimeRules } from "@/lib/overtime";
import { DEFAULT_REST_DAYS } from "@/lib/work-calendar";
import { cn } from "@/lib/utils";

type View = "today" | "timesheet" | "shifts" | "overtime" | "lateness";
const views: { id: View; label: string }[] = [{ id: "today", label: "Today" }, { id: "timesheet", label: "Timesheet" }, { id: "shifts", label: "Shift planner" }, { id: "overtime", label: "Overtime" }, { id: "lateness", label: "Lateness" }];
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const localDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const parseDate = (value: string) => new Date(`${value}T00:00:00+08:00`);
const addDays = (value: string, count: number) => { const date = parseDate(value); date.setDate(date.getDate() + count); return localDate(date); };
const monday = (value: string) => { const date = parseDate(value); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); return localDate(date); };
const display = (value: string) => parseDate(value).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short" });
const duration = (value: unknown) => { const minutes = Math.max(0, Number(value || 0)); return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; };
const active = (employees: any[]) => employees.filter((item) => item.status === "active");

export function HRMSAttendanceWorkbench({ employees, attendance, leaveRequests, shifts, payroll, settings, publicHolidays, role, query, todayContent, correctionsContent, onCreateShift, onUpdateShift, onDeleteShift, onReviewOvertime }: any) {
  const [view, setView] = useState<View>("today");
  const today = localDate(); const current = attendance.filter((item: any) => item.date === today); const team = active(employees);
  const present = new Set(current.filter((item: any) => item.checkIn || ["Present", "WFH", "Client Site"].includes(item.status)).map((item: any) => item.employeeId)).size;
  const leave = new Set([...current.filter((item: any) => item.status === "Leave").map((item: any) => item.employeeId), ...leaveRequests.filter((item: any) => item.status === "Approved" && item.startDate <= today && item.endDate >= today).map((item: any) => item.employeeId)]).size;
  return <div className="space-y-4"><div className="overflow-x-auto rounded-2xl border bg-card p-1.5 shadow-sm"><div className="flex min-w-max gap-1">{views.map((item) => <button key={item.id} onClick={() => setView(item.id)} className={cn("rounded-xl px-4 py-2.5 text-xs font-semibold sm:text-sm", view === item.id ? "bg-foreground text-white" : "text-muted-foreground hover:bg-background")}>{item.label}</button>)}</div></div>
    {view === "today" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Team members" value={team.length} icon={Users} /><Stat label="Clocked in" value={present} icon={Clock3} /><Stat label="Not clocked" value={Math.max(0, team.length - present - leave)} icon={Clock3} /><Stat label="On leave" value={leave} icon={CalendarDays} /></div>{todayContent}{correctionsContent}</div>}
    {view === "overtime" && <OvertimeReview employees={employees} attendance={attendance} payroll={payroll} settings={settings} publicHolidays={publicHolidays} canReview={["hr_admin", "manager"].includes(role)} onReview={onReviewOvertime} />}
    {(["timesheet", "lateness"] as View[]).includes(view) && <AttendanceReport mode={view} employees={employees} attendance={attendance} query={query} role={role} />}
    {view === "shifts" && <ShiftPlanner employees={employees} shifts={shifts} settings={settings} canManage={["hr_admin", "manager"].includes(role)} onCreate={onCreateShift} onUpdate={onUpdateShift} onDelete={onDeleteShift} />}
  </div>;
}

function Stat({ label, value, icon: Icon }: any) { return <Card className="border-black/8 bg-white/90"><CardContent className="flex items-center gap-4 p-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-accent"><Icon className="h-5 w-5" /></div><div><div className="text-2xl font-semibold">{value}</div><div className="text-[11px] text-muted-foreground">{label}</div></div></CardContent></Card>; }

function AttendanceReport({ mode, employees, attendance, query, role }: any) {
  const [month, setMonth] = useState(localDate().slice(0, 7)); const [department, setDepartment] = useState(""); const [employeeId, setEmployeeId] = useState("");
  const departments = [...new Set(employees.map((item: any) => item.department).filter(Boolean))] as string[];
  const rows = useMemo(() => active(employees).filter((employee: any) => (!department || employee.department === department) && (!employeeId || employee.id === employeeId) && (!query || `${employee.name} ${employee.department}`.toLowerCase().includes(String(query).toLowerCase()))).map((employee: any, index: number) => { const records = attendance.filter((item: any) => item.employeeId === employee.id && String(item.date).startsWith(month)); return { label: `Employee ${index + 1}`, name: employee.name, department: employee.department, present: records.filter((item: any) => item.checkIn || ["Present", "WFH", "Client Site"].includes(item.status)).length, leave: records.filter((item: any) => item.status === "Leave").length, worked: records.reduce((sum: number, item: any) => sum + Number(item.durationMinutes || 0), 0), overtime: records.reduce((sum: number, item: any) => sum + Number(item.overtimeMinutes || 0), 0), late: records.reduce((sum: number, item: any) => sum + Number(item.lateMinutes || 0), 0) }; }), [attendance, department, employeeId, employees, month, query]);
  const aiRows = rows.map(({ label, department, present, leave, worked, overtime, late }: any) => ({ label, department, presentDays: present, leaveDays: leave, workedMinutes: worked, overtimeMinutes: overtime, lateMinutes: late }));
  return <div className="space-y-4"><Card className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-end gap-3"><div className="flex-1"><h2 className="font-semibold">{mode === "timesheet" ? "Monthly timesheet" : mode === "overtime" ? "Overtime report" : "Lateness report"}</h2><p className="mt-1 text-xs text-muted-foreground">Derived from verified attendance records.</p></div><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button></div><div className="mt-5 grid gap-3 md:grid-cols-3"><Field label="Month"><MonthInput value={month} onChange={(e) => setMonth(e.target.value)} /></Field><Field label="Department"><Select value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">All departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Team member"><Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">All team members</option>{active(employees).map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field></div></CardContent></Card>{["hr_admin", "manager"].includes(role) && <HRMSAIInsight task="attendance_review" period={month} metrics={aiRows} context={`Report view: ${mode}`} label="Analyse attendance" />}<Card className="overflow-hidden border-black/8 bg-white/90"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-background"><tr><th className="p-4">Team member</th><th className="p-4">Department</th><th className="p-4">Present</th><th className="p-4">Worked</th><th className="p-4">Overtime</th><th className="p-4">Late</th></tr></thead><tbody>{rows.map((row: any) => <tr key={row.name} className="border-t"><td className="p-4 font-semibold">{row.name}</td><td className="p-4 text-muted-foreground">{row.department}</td><td className="p-4">{row.present} days</td><td className="p-4">{duration(row.worked)}</td><td className="p-4">{duration(row.overtime)}</td><td className="p-4">{duration(row.late)}</td></tr>)}{!rows.length && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">No matching records.</td></tr>}</tbody></table></div></CardContent></Card></div>;
}

/**
 * Overtime waiting to be reviewed, and what it will cost once it is.
 *
 * The report this replaced totalled overtime minutes per employee, which was
 * information without a decision attached — you could see that somebody worked
 * forty hours of overtime and do nothing about it from that screen. Since those
 * minutes now become money, the screen that shows them is the screen that
 * approves them, and the amount is shown before the decision rather than
 * discovered on the payslip.
 */
function OvertimeReview({ employees, attendance, payroll, settings, publicHolidays, canReview, onReview }: any) {
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [status, setStatus] = useState("Pending");
  const nameOf = (id: string) => employees.find((item: any) => item.id === id)?.name || "Unknown";
  /*
   * That month's payroll first, since it is what was actually paid; then the
   * agreed salary on the employee record, because overtime is usually reviewed
   * before the period exists; then the most recent earlier month. A manager
   * sees neither their colleagues' payroll nor their salary, so for them this
   * comes back as nothing and the amount column shows a dash rather than a
   * figure they are not entitled to.
   */
  const wageOf = (id: string, forMonth: string) => {
    const exact = (payroll || []).find((item: any) => item.employeeId === id && item.period === forMonth);
    if (exact) return Number(exact.basicSalary || 0);
    // The agreed salary on the employee record, which is what a month with no
    // payroll line yet would be paid from.
    const agreed = Number(employees.find((item: any) => item.id === id)?.basicSalary || 0);
    if (agreed > 0) return agreed;
    const earlier = (payroll || [])
      .filter((item: any) => item.employeeId === id && String(item.period || "") <= forMonth)
      .sort((a: any, b: any) => String(b.period).localeCompare(String(a.period)))[0];
    return Number(earlier?.basicSalary || 0);
  };

  const rules = toOvertimeRules(settings?.overtime);
  const restDays = settings?.restDays?.length ? settings.restDays : DEFAULT_REST_DAYS;
  const holidays = useMemo(() => new Set<string>((publicHolidays || []).map((item: any) => String(item.date))), [publicHolidays]);

  const rows = useMemo(() => attendance
    .filter((item: any) => String(item.date || "").startsWith(month) && Number(item.overtimeMinutes || 0) > 0 && item.status !== "Leave")
    .map((item: any) => {
      const kind = classifyDay(String(item.date), { restDays, holidays });
      const hours = Math.round(Number(item.overtimeMinutes) / 60 * 100) / 100;
      // Priced from the employee's own basic salary, which is on the employee
      // record rather than the payroll line — a period may not exist yet.
      const rate = hourlyRate(wageOf(item.employeeId, month), rules);
      return {
        ...item,
        overtimeStatus: overtimeStatusOf(item),
        kind, hours,
        amount: rate > 0 ? Math.round(hours * rate * multiplierFor(kind, rules) * 100) / 100 : null,
      };
    })
    .filter((item: any) => status === "All" || item.overtimeStatus === status)
    .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date))), [attendance, month, status, restDays, holidays, employees, payroll]);

  const pendingCost = rows.filter((row: any) => row.overtimeStatus === "Pending").reduce((sum: number, row: any) => sum + (row.amount ?? 0), 0);
  const label = { normal: "Working day", rest_day: "Rest day", public_holiday: "Public holiday" } as Record<string, string>;

  return <div className="space-y-4">
    <Card className="border-black/8 bg-white/90"><CardContent className="p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h2 className="font-semibold">Overtime review</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Payroll pays approved overtime only. Anything left pending is worked but unpaid, and is reported on the payroll line rather than dropped.</p>
        </div>
        <Field label="Month"><MonthInput value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)}>{["Pending", "Approved", "Rejected", "All"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      </div>
      {pendingCost > 0 && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">RM {pendingCost.toFixed(2)} of overtime is waiting for a decision this month.</p>}
    </CardContent></Card>

    <Card className="overflow-hidden border-black/8 bg-white/90"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs">
      <thead className="bg-background"><tr><th className="p-4">Date</th><th className="p-4">Team member</th><th className="p-4">Kind of day</th><th className="p-4">Hours</th><th className="p-4">Amount</th><th className="p-4">Status</th>{canReview && <th className="p-4">Review</th>}</tr></thead>
      <tbody>{rows.map((row: any) => <tr key={row.id} className="border-t">
        <td className="p-4">{display(row.date)}</td>
        <td className="p-4 font-semibold">{nameOf(row.employeeId)}</td>
        <td className="p-4 text-muted-foreground">{label[row.kind]} × {multiplierFor(row.kind, rules)}</td>
        <td className="p-4">{row.hours}h</td>
        <td className="p-4 tabular-nums">{row.amount === null ? "—" : `RM ${row.amount.toFixed(2)}`}</td>
        <td className="p-4"><StatusBadge value={row.overtimeStatus} /></td>
        {canReview && <td className="p-4"><div className="flex gap-2">
          {row.overtimeStatus !== "Approved" && <Button size="sm" onClick={() => onReview(row.id, "approve_overtime")}>Approve</Button>}
          {row.overtimeStatus !== "Rejected" && <Button size="sm" variant="outline" onClick={() => onReview(row.id, "reject_overtime")}>Reject</Button>}
        </div></td>}
      </tr>)}
      {!rows.length && <tr><td colSpan={canReview ? 7 : 6} className="p-10 text-center text-muted-foreground">No overtime {status === "All" ? "" : status.toLowerCase()} this month.</td></tr>}</tbody>
    </table></div></CardContent></Card>
  </div>;
}

function ShiftPlanner({ employees, shifts, settings, canManage, onCreate, onUpdate, onDelete }: any) {
  const [weekStart, setWeekStart] = useState(monday(localDate())); const [editing, setEditing] = useState<any>(null); const week = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)); const rows = active(employees);
  const blank = () => ({ employeeId: rows[0]?.id || "", label: "Standard shift", startDate: weekStart, endDate: addDays(weekStart, 4), startTime: settings?.shiftStart || "09:00", endTime: settings?.shiftEnd || "18:00", daysOfWeek: [1, 2, 3, 4, 5], status: "Scheduled", notes: "" });
  const match = (employeeId: string, date: string) => shifts.find((item: any) => item.employeeId === employeeId && item.startDate <= date && item.endDate >= date && (item.daysOfWeek || [1, 2, 3, 4, 5]).includes(parseDate(date).getDay()));
  const coverage = week.map((date) => ({ date, scheduled: rows.filter((employee: any) => match(employee.id, date)?.status === "Scheduled").length, teamSize: rows.length }));
  async function save() { if (!editing) return; if (editing.id) await onUpdate(editing); else await onCreate(editing); setEditing(null); }
  return <div className="space-y-4"><Card className="border-black/8 bg-white/90"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="flex-1"><h2 className="font-semibold">Weekly shift planner</h2><p className="mt-1 text-xs text-muted-foreground">Reusable date ranges and weekdays, designed for mobile and desktop.</p></div>{canManage && <Button onClick={() => setEditing(blank())}><Plus className="h-4 w-4" />Assign shift</Button>}<Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button></CardContent></Card>{canManage && <HRMSAIInsight task="shift_review" period={`${weekStart} to ${addDays(weekStart, 6)}`} metrics={coverage} context="Check coverage gaps only; availability was not supplied." label="Review coverage" />}<div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" onClick={() => setWeekStart(monday(localDate()))}>{display(weekStart)} – {display(addDays(weekStart, 6))}</Button><Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button></div><Card className="overflow-hidden border-black/8 bg-white/90"><CardContent className="p-0"><div className="overflow-x-auto"><table className="min-w-[1050px] text-xs"><thead className="bg-background"><tr><th className="sticky left-0 z-10 w-56 bg-background p-4 text-left">Team member</th>{week.map((date) => <th key={date} className="w-28 p-3">{days[parseDate(date).getDay()]}<div className="mt-1 text-muted-foreground">{display(date)}</div></th>)}</tr></thead><tbody>{rows.map((employee: any) => <tr key={employee.id} className="border-t"><td className="sticky left-0 z-10 bg-card p-4 text-left"><b>{employee.name}</b><div className="mt-1 text-[10px] text-muted-foreground">{employee.department}</div></td>{week.map((date) => { const shift = match(employee.id, date); return <td key={date} className="p-2">{shift ? <button onClick={() => canManage && setEditing({ ...shift })} className={cn("w-full rounded-xl p-2", shift.status === "Off" ? "bg-muted" : "bg-foreground-soft text-white")}><b>{shift.status === "Off" ? "Off" : shift.label}</b>{shift.status !== "Off" && <div className="mt-1 text-[9px] opacity-70">{shift.startTime}–{shift.endTime}</div>}</button> : <div className="rounded-xl border border-dashed p-3 text-muted-foreground">—</div>}</td>; })}</tr>)}</tbody></table></div></CardContent></Card>{editing && <ShiftDialog draft={editing} setDraft={setEditing} employees={employees} onClose={() => setEditing(null)} onSave={save} onDelete={editing.id ? async () => { await onDelete(editing.id); setEditing(null); } : undefined} />}</div>;
}

function ShiftDialog({ draft, setDraft, employees, onClose, onSave, onDelete }: any) {
  const update = (key: string, value: any) => setDraft({ ...draft, [key]: value });
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 sm:items-center sm:p-4"><Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-b-none bg-background sm:rounded-2xl"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><h2 className="text-xl font-semibold">{draft.id ? "Edit shift" : "Assign shift"}</h2><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close shift editor"><X className="h-4 w-4" /></Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Team member"><Select value={draft.employeeId} onChange={(e) => update("employeeId", e.target.value)}>{active(employees).map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="Label"><Input value={draft.label} onChange={(e) => update("label", e.target.value)} /></Field><Field label="Start date"><DateInput value={draft.startDate} onChange={(e) => update("startDate", e.target.value)} /></Field><Field label="End date"><DateInput value={draft.endDate} onChange={(e) => update("endDate", e.target.value)} /></Field><Field label="Start"><Input type="time" value={draft.startTime} onChange={(e) => update("startTime", e.target.value)} /></Field><Field label="End"><Input type="time" value={draft.endTime} onChange={(e) => update("endTime", e.target.value)} /></Field><Field label="Status"><Select value={draft.status} onChange={(e) => update("status", e.target.value)}><option>Scheduled</option><option>Off</option></Select></Field><Field label="Notes"><Textarea value={draft.notes} onChange={(e) => update("notes", e.target.value)} /></Field></div><div className="mt-4 flex flex-wrap gap-2">{days.map((label, day) => <label key={label} className={cn("cursor-pointer rounded-xl border px-3 py-2 text-xs", draft.daysOfWeek.includes(day) && "bg-foreground text-white")}><input type="checkbox" className="sr-only" checked={draft.daysOfWeek.includes(day)} onChange={() => update("daysOfWeek", draft.daysOfWeek.includes(day) ? draft.daysOfWeek.filter((item: number) => item !== day) : [...draft.daysOfWeek, day])} />{label}</label>)}</div><div className="mt-6 flex gap-2">{onDelete && <Button variant="outline" onClick={onDelete}><Trash2 className="h-4 w-4 text-red-500" />Delete</Button>}<div className="flex-1" /><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSave}>Save shift</Button></div></CardContent></Card></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-xs font-medium text-foreground-soft"><span className="mb-2 block">{label}</span>{children}</label>; }

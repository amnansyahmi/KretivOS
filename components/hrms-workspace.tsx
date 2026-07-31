"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { isValidElement, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck, CalendarCheck, Check, ChevronRight, Clock3, FileText, GraduationCap,
  Pencil, Plus, RefreshCw, Search, Settings2, ShieldCheck, Trash2, UserPlus, WalletCards, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AIWritingButton } from "@/components/ai-writing-button";
import { DateInput } from "@/components/date-input";
import { HRPhotoAttendance } from "@/components/hr-photo-attendance";
import { HRMSNotificationCenter } from "@/components/hrms-notification-center";
import {
  getPermittedHRMSNavigation,
  HRMS_NAV_ITEMS,
  HRMSShell,
  type HRMSRole as Role,
  type HRMSSession as Session,
  type HRMSTab as Tab,
} from "@/components/hrms-shell";
import {
  HRAttendanceCorrections,
  HRClaims,
  HRLifecycle,
  HRPayroll,
  HRSelfService,
} from "@/components/hrms-extended-sections";
import { cn } from "@/lib/utils";

type Resource = "employees" | "leave" | "attendance" | "attendance_corrections" | "goals" | "learning" | "documents" | "claims" | "payroll" | "lifecycle";
type Editor = { resource: Resource; record: any; isNew: boolean } | null;

type Snapshot = {
  employees: any[];
  leaveRequests: any[];
  attendance: any[];
  attendanceCorrections: any[];
  goals: any[];
  learning: any[];
  documents: any[];
  claims: any[];
  payroll: any[];
  lifecycle: any[];
  settings: {
    departments: string[];
    leaveTypes: string[];
    workModes: string[];
    attendance?: { timezone?: string; shiftStart?: string; shiftEnd?: string; graceMinutes?: number; overtimeAfterMinutes?: number };
    leavePolicy?: { annualAccrual?: string; carryForwardDays?: number; carryForwardExpiryMonth?: number; prorateNewJoiner?: boolean };
    publicHolidays?: { date: string; name: string }[];
    statutoryProfiles?: any[];
  };
  session?: Session;
  version: number;
  syncedAt: string;
};

const emptySnapshot: Snapshot = {
  employees: [], leaveRequests: [], attendance: [], attendanceCorrections: [], goals: [], learning: [], documents: [], claims: [], payroll: [], lifecycle: [],
  settings: { departments: [], leaveTypes: [], workModes: [] }, version: 0, syncedAt: "",
};

const tabs = HRMS_NAV_ITEMS;

function validTab(value?: string): Tab {
  return tabs.some((item) => item.id === value) ? value as Tab : "self";
}

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function uid() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(`${value.length === 10 ? `${value}T00:00:00+08:00` : value}`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" });
}
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export function HRMSWorkspace({ initialTab, session }: { initialTab?: string; session: Session }) {
  const router = useRouter();
  const permittedTabs = getPermittedHRMSNavigation(session);
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  const [tab, setTab] = useState<Tab>(validTab(initialTab || (session.authEnabled === false ? "overview" : "self")));
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<Editor>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { setData(await requestJson("/api/hr")); }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to load HR."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const requested = validTab(initialTab || (session.authEnabled === false ? "overview" : "self"));
    setTab(permittedTabs.some((item) => item.id === requested) ? requested : permittedTabs[0]?.id || "overview");
  }, [initialTab, session.role, session.authEnabled]);

  function changeTab(next: Tab) {
    if (!permittedTabs.some((item) => item.id === next)) next = permittedTabs[0]?.id || "overview";
    setTab(next);
    setQuery("");
    router.replace(next === (session.authEnabled === false ? "overview" : "self") ? "/hr" : `/hr?section=${next}`, { scroll: false });
  }

  const employeeName = (id: string) => data.employees.find((item) => item.id === id)?.name || "Unknown team member";
  const term = query.trim().toLowerCase();
  const matches = (...values: unknown[]) => !term || values.some((value) => String(value ?? "").toLowerCase().includes(term));

  const stats = useMemo(() => ({
    active: data.employees.filter((item) => item.status === "active").length,
    pendingLeave: data.leaveRequests.filter((item) => item.status === "Pending").length,
    presentToday: data.attendance.filter((item) => item.date === today() && ["Present", "WFH", "Client Site"].includes(item.status)).length,
    openGoals: data.goals.filter((item) => !["Completed", "Cancelled"].includes(item.status)).length,
    activeLearning: data.learning.filter((item) => ["Planned", "In progress"].includes(item.status)).length,
  }), [data]);

  function openCreate(resource: Resource, employeeIdOverride?: string) {
    const firstEmployee = employeeIdOverride || data.employees[0]?.id || "";
    const common = { id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const defaults: Record<Resource, any> = {
      employees: {
        ...common, name: "", email: "", title: "", department: data.settings.departments[0] || "Leadership",
        employmentType: "Core Team", workMode: data.settings.workModes[0] || "Hybrid", location: "", startDate: today(),
        phone: "", emergencyContact: "", annualLeaveBalance: 14, medicalLeaveBalance: 14, carryForwardLeaveBalance: 0, role: "employee", skills: [], notes: "",
        status: "active", onboarding: [
          { id: uid(), label: "Personal and contact details", done: false },
          { id: uid(), label: "Employment terms acknowledged", done: false },
          { id: uid(), label: "KretivOS and work tools access", done: false },
          { id: uid(), label: "Company policies reviewed", done: false },
          { id: uid(), label: "Role expectations and goals", done: false },
          { id: uid(), label: "First-week check-in", done: false },
        ],
      },
      leave: { ...common, employeeId: firstEmployee, type: data.settings.leaveTypes[0] || "Annual Leave", startDate: today(), endDate: today(), reason: "", status: "Pending" },
      attendance: { ...common, employeeId: firstEmployee, date: today(), status: "Present", workMode: "Office", checkIn: "", checkOut: "", note: "" },
      attendance_corrections: { ...common, employeeId: firstEmployee, attendanceId: "", date: today(), requestedCheckIn: "", requestedCheckOut: "", reason: "", status: "Pending" },
      goals: { ...common, employeeId: firstEmployee, title: "", period: "Q3 2026", dueDate: today(), progress: 0, status: "Not started", notes: "" },
      learning: { ...common, employeeId: firstEmployee, title: "", provider: "", status: "Planned", progress: 0, dueDate: today(), certification: "", notes: "" },
      documents: { ...common, title: "", category: "Policy", employeeId: "", reference: "", expiryDate: "", status: "Active", notes: "" },
      claims: { ...common, employeeId: firstEmployee, claimDate: today(), category: "General", amount: 0, description: "", receiptAssetId: "", status: "Pending" },
      payroll: { ...common, employeeId: firstEmployee, period: today().slice(0, 7), basicSalary: 0, allowances: 0, overtime: 0, bonus: 0, epfEmployee: 0, epfEmployer: 0, socsoEmployee: 0, socsoEmployer: 0, eisEmployee: 0, eisEmployer: 0, pcb: 0, otherDeductions: 0, statutoryProfileId: "my-default", verificationNote: "", status: "Draft" },
      lifecycle: { ...common, employeeId: firstEmployee, type: "Probation", title: "Probation review", dueDate: today(), status: "Open", notes: "", tasks: [{ id: uid(), label: "Manager review completed", done: false }, { id: uid(), label: "Confirmation decision recorded", done: false }] },
    };
    setEditor({ resource, record: defaults[resource], isNew: true });
  }

  function openEdit(resource: Resource, record: any) {
    setEditor({ resource, record: JSON.parse(JSON.stringify(record)), isNew: false });
  }

  async function saveEditor() {
    if (!editor || saving) return;
    if (editor.resource === "employees" && !String(editor.record.name || "").trim()) { setError("Employee name is required."); return; }
    if (editor.resource === "documents" && !String(editor.record.title || "").trim()) { setError("Document title is required."); return; }
    if (!['employees', 'documents'].includes(editor.resource) && !editor.record.employeeId) { setError("Select a team member."); return; }
    setSaving(true); setError("");
    try {
      let next = await requestJson("/api/hr", {
        method: "POST",
        body: JSON.stringify({ operation: editor.isNew ? "create" : "update", resource: editor.resource, id: editor.record.id, data: editor.record }),
      });
      if (editor.resource === "employees" && editor.record.newPin) {
        next = await requestJson("/api/hr", { method: "POST", body: JSON.stringify({ operation: "set_access", resource: "employees", id: editor.record.id, data: { email: editor.record.email, role: editor.record.role, pin: editor.record.newPin } }) });
      }
      setData(next); setEditor(null); setNotice(editor.isNew ? "Record created." : "Record updated.");
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to save record."); }
    finally { setSaving(false); }
  }

  async function deleteRecord(resource: Resource, id: string) {
    if (!window.confirm("Delete this record? This cannot be undone.")) return;
    setSaving(true); setError("");
    try {
      setData(await requestJson("/api/hr", { method: "POST", body: JSON.stringify({ operation: "delete", resource, id }) }));
      setNotice("Record deleted.");
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to delete record."); }
    finally { setSaving(false); }
  }

  async function leaveAction(id: string, action: "approve" | "reject" | "cancel") {
    const note = action === "approve" ? "Approved by Kretivco team" : action === "reject" ? window.prompt("Reason for rejection:") || "" : "Cancelled";
    setSaving(true); setError("");
    try {
      setData(await requestJson("/api/hr", { method: "POST", body: JSON.stringify({ operation: "action", resource: "leave", id, action, data: { approverNote: note } }) }));
      setNotice(`Leave request ${action === "approve" ? "approved" : action === "reject" ? "rejected" : "cancelled"}.`);
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to update leave."); }
    finally { setSaving(false); }
  }

  async function recordAction(resource: "claims" | "attendance_corrections" | "payroll", id: string, action: string) {
    const note = ["reject", "approve"].includes(action) ? window.prompt("Optional review note:") || "" : "";
    setSaving(true); setError("");
    try {
      setData(await requestJson("/api/hr", { method: "POST", body: JSON.stringify({ operation: "action", resource, id, action, data: { approverNote: note, reviewerNote: note } }) }));
      setNotice("HRMS record updated.");
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to update HRMS record."); }
    finally { setSaving(false); }
  }

  async function toggleOnboarding(employee: any, itemId: string) {
    const onboarding = (employee.onboarding || []).map((item: any) => item.id === itemId ? { ...item, done: !item.done } : item);
    setSaving(true); setError("");
    try {
      setData(await requestJson("/api/hr", { method: "POST", body: JSON.stringify({ operation: "update", resource: "employees", id: employee.id, data: { ...employee, onboarding } }) }));
      setNotice("Onboarding checklist updated.");
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to update onboarding."); }
    finally { setSaving(false); }
  }

  async function saveSettings(settings: Snapshot["settings"]) {
    setSaving(true); setError("");
    try {
      setData(await requestJson("/api/hr", { method: "POST", body: JSON.stringify({ operation: "update", resource: "settings", data: settings }) }));
      setNotice("HRMS settings saved.");
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to save HRMS settings."); }
    finally { setSaving(false); }
  }

  const actionResource: Partial<Record<Tab, Resource | undefined>> = {
    people: session.role === "hr_admin" ? "employees" : undefined,
    leave: "leave", goals: ["hr_admin", "manager"].includes(session.role) ? "goals" : undefined,
    learning: ["hr_admin", "manager"].includes(session.role) ? "learning" : undefined,
    claims: "claims", payslips: ["hr_admin", "finance"].includes(session.role) ? "payroll" : undefined,
    lifecycle: ["hr_admin", "manager"].includes(session.role) ? "lifecycle" : undefined,
    documents: session.role === "hr_admin" ? "documents" : undefined,
  };
  const currentTab = tabs.find((item) => item.id === tab) || tabs[0];

  return (
    <HRMSShell
      activeId={tab}
      title={currentTab.label}
      description={currentTab.description}
      navigation={permittedTabs}
      session={session}
      onNavigate={changeTab}
      actions={<>
        <Button variant="outline" size="icon" className="hidden bg-white sm:inline-flex" onClick={load} disabled={loading} aria-label="Refresh HRMS"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Button>
        <HRMSNotificationCenter />
        {actionResource[tab] && <Button size="icon" className="sm:w-auto sm:px-4" onClick={() => openCreate(actionResource[tab]!)} aria-label={`Add ${currentTab.label} record`}><Plus className="h-4 w-4" /><span className="hidden sm:inline">Add record</span></Button>}
        {tab === "overview" && session.role === "hr_admin" && <Button size="icon" className="sm:w-auto sm:px-4" onClick={() => { changeTab("people"); openCreate("employees"); }} aria-label="Add person"><UserPlus className="h-4 w-4" /><span className="hidden sm:inline">Add person</span></Button>}
      </>}
    >
        {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}
        {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}

        {loading && !data.employees.length ? <div className="rounded-2xl border bg-white p-12 text-center text-sm text-muted-foreground">Loading HR workspace…</div> : (
          <>
            {!(["self", "overview", "payslips", "settings"] as Tab[]).includes(tab) && <div className="mb-4 flex h-11 items-center gap-2 rounded-xl border bg-white px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={`Search ${tabs.find((item) => item.id === tab)?.label.toLowerCase()}...`} /></div>}

            {tab === "self" && <HRSelfService session={session} employee={data.employees.find((item) => item.id === session.userId)} leave={data.leaveRequests.filter((item) => item.employeeId === session.userId)} attendance={data.attendance.filter((item) => item.employeeId === session.userId)} claims={data.claims.filter((item) => item.employeeId === session.userId)} payroll={data.payroll.filter((item) => item.employeeId === session.userId)} onEdit={(employee: any) => openEdit("employees", employee)} onCreate={(resource: Resource) => openCreate(resource, session.userId)} onNavigate={changeTab} />}

            {tab === "overview" && <Overview data={data} stats={stats} employeeName={employeeName} setTab={changeTab} />}

            {tab === "people" && (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.employees.filter((item) => matches(item.name, item.title, item.department, item.skills?.join(" "))).map((employee) => {
                  const completed = employee.onboarding?.filter((item: any) => item.done).length || 0;
                  const total = employee.onboarding?.length || 0;
                  return <Card key={employee.id} className="border-black/8 bg-white/90 shadow-sm"><CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#202c25] text-sm font-semibold text-white">{initials(employee.name)}</div><Status value={employee.status} /></div>
                    <h2 className="mt-4 text-lg font-semibold">{employee.name}</h2><p className="mt-1 text-xs text-muted-foreground">{employee.title || "Role not set"} · {employee.department}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2"><Mini label="Work mode" value={employee.workMode} /><Mini label="Employment" value={employee.employmentType} /><Mini label="Annual leave" value={`${employee.annualLeaveBalance} days`} /><Mini label="Medical leave" value={`${employee.medicalLeaveBalance} days`} /></div>
                    <div className="mt-4 rounded-xl bg-[#f7f4ed] p-3"><div className="flex justify-between text-[11px]"><span className="font-medium">Onboarding</span><span className="text-muted-foreground">{completed}/{total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-[#ba5c42]" style={{ width: `${total ? completed / total * 100 : 0}%` }} /></div></div>
                    {(session.role === "hr_admin" || employee.id === session.userId) && <div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => openEdit("employees", employee)}><Pencil className="h-4 w-4" />Edit</Button>{session.role === "hr_admin" && <Button variant="outline" size="icon" onClick={() => deleteRecord("employees", employee.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>}</div>}
                  </CardContent></Card>;
                })}
              </div>
            )}

            {tab === "onboarding" && <div className="grid gap-4 xl:grid-cols-2">
              {data.employees.filter((employee) => matches(employee.name, employee.title, employee.department)).map((employee) => {
                const checklist = employee.onboarding || [];
                const done = checklist.filter((item: any) => item.done).length;
                const progress = checklist.length ? Math.round(done / checklist.length * 100) : 0;
                return <Card key={employee.id} className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#202c25] text-xs font-semibold text-white">{initials(employee.name)}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{employee.name}</h2><p className="mt-1 text-xs text-muted-foreground">{employee.title || "Role not set"} · Started {formatDate(employee.startDate)}</p></div><Status value={progress === 100 ? "Completed" : `${progress}% ready`} /></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-[#ba5c42]" style={{ width: `${progress}%` }} /></div></div></div><div className="mt-5 space-y-2">{checklist.map((item: any) => <button key={item.id} disabled={saving} onClick={() => toggleOnboarding(employee, item.id)} className="flex w-full items-center gap-3 rounded-xl border bg-[#fbfaf7] p-3 text-left text-sm transition hover:border-[#ba5c42]/40 disabled:opacity-60"><span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", item.done ? "border-[#202c25] bg-[#202c25] text-white" : "bg-white")}>{item.done && <Check className="h-3.5 w-3.5" />}</span><span className={cn(item.done && "text-muted-foreground line-through")}>{item.label}</span></button>)}</div><Button variant="outline" className="mt-4 w-full" onClick={() => openEdit("employees", employee)}><Pencil className="h-4 w-4" />Edit profile and checklist</Button></CardContent></Card>;
              })}
              {!data.employees.length && <Empty icon={BookOpenCheck} title="No employee onboarding" note="Add the first employee to start an onboarding checklist." action={() => { changeTab("people"); openCreate("employees"); }} />}
            </div>}

            {tab === "leave" && (
              <div className="space-y-3">
                {data.leaveRequests.filter((item) => matches(employeeName(item.employeeId), item.type, item.status, item.reason)).map((item) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f1ece2]"><CalendarCheck className="h-5 w-5 text-[#ba5c42]" /></div>
                  <div className="min-w-0 flex-1"><div className="font-semibold">{employeeName(item.employeeId)}</div><div className="mt-1 text-xs text-muted-foreground">{item.type} · {formatDate(item.startDate)} – {formatDate(item.endDate)} · {item.days} working day{item.days === 1 ? "" : "s"}{typeof item.balanceAfterRequest === "number" ? ` · ${item.balanceAfterRequest} days remaining` : ""}</div><p className="mt-2 text-xs leading-5 text-[#667067]">{item.reason || "No reason provided."}</p>{item.attachmentId && <a href={`/api/hr/files/${item.attachmentId}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#ba5c42]"><FileText className="h-3.5 w-3.5" />View attachment</a>}</div>
                  <Status value={item.status} />
                  <div className="flex flex-wrap gap-2">{item.status === "Pending" && ["hr_admin", "manager"].includes(session.role) && <><Button size="sm" variant="outline" onClick={() => leaveAction(item.id, "reject")}>Reject</Button><Button size="sm" onClick={() => leaveAction(item.id, "approve")}><Check className="h-3.5 w-3.5" />Approve</Button></>}{item.status === "Pending" && item.employeeId === session.userId && <Button size="sm" variant="outline" onClick={() => leaveAction(item.id, "cancel")}>Cancel</Button>}{(["Pending", "Rejected"].includes(item.status) && item.employeeId === session.userId) || ["hr_admin", "manager"].includes(session.role) ? <Button variant="outline" size="icon" onClick={() => openEdit("leave", item)}><Pencil className="h-4 w-4" /></Button> : null}{(session.role === "hr_admin" || (item.employeeId === session.userId && ["Pending", "Rejected"].includes(item.status))) && <Button variant="outline" size="icon" onClick={() => deleteRecord("leave", item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>}</div>
                </CardContent></Card>)}
                {!data.leaveRequests.length && <Empty icon={CalendarCheck} title="No leave requests" note="Create the first leave request for a team member." action={() => openCreate("leave")} />}
              </div>
            )}

            {tab === "attendance" && <div className="space-y-4"><div className="flex justify-end">{["hr_admin", "manager"].includes(session.role) && <Button asChild variant="outline" className="bg-white"><Link href="/hr/attendance-review"><ShieldCheck className="h-4 w-4" />Review attendance evidence</Link></Button>}</div><HRPhotoAttendance employees={session.role === "employee" ? data.employees.filter((item) => item.id === session.userId) : data.employees} attendance={data.attendance} query={query} onRefresh={load} onNotice={setNotice} onError={setError} /><HRAttendanceCorrections records={data.attendanceCorrections.filter((item) => matches(employeeName(item.employeeId), item.date, item.status, item.reason))} employeeName={employeeName} canReview={["hr_admin", "manager"].includes(session.role)} onCreate={() => openCreate("attendance_corrections")} onEdit={(item: any) => openEdit("attendance_corrections", item)} onDelete={(id: string) => deleteRecord("attendance_corrections", id)} onAction={(id: string, action: string) => recordAction("attendance_corrections", id, action)} /></div>}
            {tab === "payslips" && <HRPayroll records={data.payroll} employeeName={employeeName} canManage={["hr_admin", "finance"].includes(session.role)} onCreate={() => openCreate("payroll")} onEdit={(item: any) => openEdit("payroll", item)} onAction={(id: string, action: string) => recordAction("payroll", id, action)} />}

            {tab === "claims" && <HRClaims claims={data.claims.filter((item) => matches(employeeName(item.employeeId), item.category, item.description, item.status, item.financeStatus))} employeeName={employeeName} canReview={["hr_admin", "manager"].includes(session.role)} canPay={["hr_admin", "finance"].includes(session.role)} onCreate={() => openCreate("claims")} onEdit={(item: any) => openEdit("claims", item)} onDelete={(id: string) => deleteRecord("claims", id)} onAction={(id: string, action: string) => recordAction("claims", id, action)} />}

            {tab === "lifecycle" && <HRLifecycle records={data.lifecycle.filter((item) => matches(employeeName(item.employeeId), item.type, item.title, item.status))} employeeName={employeeName} onCreate={() => openCreate("lifecycle")} onEdit={(item: any) => openEdit("lifecycle", item)} onDelete={(id: string) => deleteRecord("lifecycle", id)} />}

            {tab === "goals" && <div className="grid gap-4 md:grid-cols-2">{data.goals.filter((item) => matches(employeeName(item.employeeId), item.title, item.period, item.status)).map((item) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[.16em] text-[#ba5c42]">{item.period}</div><h2 className="mt-2 font-semibold">{item.title}</h2><p className="mt-1 text-xs text-muted-foreground">{employeeName(item.employeeId)} · Due {formatDate(item.dueDate)}</p></div><Status value={item.status} /></div><div className="mt-5"><div className="flex justify-between text-xs"><span>Progress</span><span className="font-semibold">{item.progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-[#ba5c42]" style={{ width: `${item.progress}%` }} /></div></div><p className="mt-4 min-h-10 text-xs leading-5 text-muted-foreground">{item.notes || "No notes."}</p><div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => openEdit("goals", item)}><Pencil className="h-4 w-4" />Update</Button><Button variant="outline" size="icon" onClick={() => deleteRecord("goals", item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>)}</div>}

            {tab === "learning" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.learning.filter((item) => matches(employeeName(item.employeeId), item.title, item.provider, item.status)).map((item) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f1ece2]"><GraduationCap className="h-5 w-5 text-[#ba5c42]" /></div><Status value={item.status} /></div><h2 className="mt-4 font-semibold">{item.title}</h2><p className="mt-1 text-xs text-muted-foreground">{item.provider || "Provider not set"}</p><div className="mt-4 text-xs">{employeeName(item.employeeId)} · {item.progress}%</div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-[#202c25]" style={{ width: `${item.progress}%` }} /></div><div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => openEdit("learning", item)}><Pencil className="h-4 w-4" />Edit</Button><Button variant="outline" size="icon" onClick={() => deleteRecord("learning", item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>)}</div>}

            {tab === "documents" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.documents.filter((item) => matches(item.title, item.category, item.reference, item.status, item.notes, employeeName(item.employeeId))).map((item) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f1ece2]"><FileText className="h-5 w-5 text-[#ba5c42]" /></div><Status value={item.status} /></div><h2 className="mt-4 font-semibold">{item.title}</h2><p className="mt-1 text-xs text-muted-foreground">{item.category || "HR document"} · {item.employeeId ? employeeName(item.employeeId) : "Company-wide"}</p><div className="mt-4 grid grid-cols-2 gap-2"><Mini label="Reference" value={item.reference} /><Mini label="Expiry" value={formatDate(item.expiryDate)} /></div><p className="mt-4 min-h-10 text-xs leading-5 text-muted-foreground">{item.notes || "No notes."}</p>{item.assetId && <Button asChild variant="outline" className="mt-3 w-full"><a href={`/api/hr/files/${item.assetId}`} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" />Open private document</a></Button>}{session.role === "hr_admin" && <div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => openEdit("documents", item)}><Pencil className="h-4 w-4" />Edit</Button><Button variant="outline" size="icon" onClick={() => deleteRecord("documents", item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div>}</CardContent></Card>)}{!data.documents.length && session.role === "hr_admin" && <Empty icon={FileText} title="No HR documents" note="Create a policy or employee document register entry." action={() => openCreate("documents")} />}</div>}

            {tab === "settings" && <HRMSSettings settings={data.settings} saving={saving} onSave={saveSettings} />}
          </>
        )}
      {editor && <EditorDialog editor={editor} setEditor={setEditor} data={data} session={session} saving={saving} onSave={saveEditor} />}
    </HRMSShell>
  );
}

function Overview({ data, stats, employeeName, setTab }: any) {
  const pending = data.leaveRequests.filter((item: any) => item.status === "Pending").slice(0, 4);
  const goals = data.goals.filter((item: any) => !["Completed", "Cancelled"].includes(item.status)).sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate))).slice(0, 4);
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Stat label="Active people" value={stats.active} note={`${data.employees.length} total profiles`} /><Stat label="Pending leave" value={stats.pendingLeave} note="Requires team review" /><Stat label="Present today" value={stats.presentToday} note="Photo clock-in records" /><Stat label="Open goals" value={stats.openGoals} note="In current periods" /><Stat label="Active learning" value={stats.activeLearning} note="Planned or in progress" /></div>
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Team directory</h2><p className="mt-1 text-xs text-muted-foreground">Core people and onboarding readiness.</p></div><button onClick={() => setTab("people")} className="text-xs font-semibold text-[#ba5c42]">View all</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{data.employees.slice(0, 6).map((employee: any) => { const done = employee.onboarding?.filter((item: any) => item.done).length || 0; const total = employee.onboarding?.length || 0; return <div key={employee.id} className="flex items-center gap-3 rounded-xl border bg-[#fbfaf7] p-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#202c25] text-xs font-semibold text-white">{initials(employee.name)}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{employee.name}</div><div className="mt-1 truncate text-[10px] text-muted-foreground">{employee.title || "Kretivco Team"} · Onboarding {done}/{total}</div></div><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>; })}</div></CardContent></Card>
      <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Pending leave</h2><p className="mt-1 text-xs text-muted-foreground">Requests awaiting a decision.</p></div><button onClick={() => setTab("leave")} className="text-xs font-semibold text-[#ba5c42]">Open queue</button></div><div className="mt-4 space-y-2">{pending.map((item: any) => <div key={item.id} className="rounded-xl border bg-[#fbfaf7] p-3"><div className="text-sm font-semibold">{employeeName(item.employeeId)}</div><div className="mt-1 text-xs text-muted-foreground">{item.type} · {formatDate(item.startDate)} – {formatDate(item.endDate)}</div></div>)}{!pending.length && <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">No pending leave requests.</div>}</div></CardContent></Card>
    </div>
    <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Goals requiring attention</h2><p className="mt-1 text-xs text-muted-foreground">Progress and deadlines across the team.</p></div><button onClick={() => setTab("goals")} className="text-xs font-semibold text-[#ba5c42]">Manage goals</button></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{goals.map((goal: any) => <div key={goal.id} className="rounded-xl border bg-[#fbfaf7] p-4"><div className="text-[10px] uppercase tracking-[.14em] text-[#ba5c42]">{goal.period}</div><div className="mt-2 text-sm font-semibold">{goal.title}</div><div className="mt-1 text-[10px] text-muted-foreground">{employeeName(goal.employeeId)} · {goal.progress}%</div></div>)}{!goals.length && <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground md:col-span-2 xl:col-span-4">No active goals yet.</div>}</div></CardContent></Card>
  </div>;
}

function HRMSSettings({ settings, saving, onSave }: { settings: Snapshot["settings"]; saving: boolean; onSave: (settings: Snapshot["settings"]) => void }) {
  const [lists, setLists] = useState({ departments: "", leaveTypes: "", workModes: "" });
  const [attendance, setAttendance] = useState({ timezone: "Asia/Kuala_Lumpur", shiftStart: "09:00", shiftEnd: "18:00", graceMinutes: 15, overtimeAfterMinutes: 540 });
  const [leavePolicy, setLeavePolicy] = useState({ annualAccrual: "annual", carryForwardDays: 5, carryForwardExpiryMonth: 3, prorateNewJoiner: true });
  const [holidays, setHolidays] = useState("");
  const [statutory, setStatutory] = useState({ id: "my-default", name: "Malaysia · verify current rates", effectiveFrom: "2026-01-01", epfEmployeeRate: 11, epfEmployerRate: 12, eisEmployeeRate: 0.2, eisEmployerRate: 0.2, notes: "" });

  useEffect(() => {
    setLists({
      departments: (settings.departments || []).join("\n"),
      leaveTypes: (settings.leaveTypes || []).join("\n"),
      workModes: (settings.workModes || []).join("\n"),
    });
    setAttendance({
      timezone: settings.attendance?.timezone || "Asia/Kuala_Lumpur",
      shiftStart: settings.attendance?.shiftStart || "09:00",
      shiftEnd: settings.attendance?.shiftEnd || "18:00",
      graceMinutes: Number(settings.attendance?.graceMinutes ?? 15),
      overtimeAfterMinutes: Number(settings.attendance?.overtimeAfterMinutes ?? 540),
    });
    setLeavePolicy({
      annualAccrual: settings.leavePolicy?.annualAccrual || "annual",
      carryForwardDays: Number(settings.leavePolicy?.carryForwardDays ?? 5),
      carryForwardExpiryMonth: Number(settings.leavePolicy?.carryForwardExpiryMonth ?? 3),
      prorateNewJoiner: settings.leavePolicy?.prorateNewJoiner !== false,
    });
    setHolidays((settings.publicHolidays || []).map((item) => `${item.date} | ${item.name}`).join("\n"));
    const profile = settings.statutoryProfiles?.[0];
    if (profile) setStatutory({ ...statutory, ...profile });
  }, [settings]);

  const parseList = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  const submit = () => onSave({
    departments: parseList(lists.departments),
    leaveTypes: parseList(lists.leaveTypes),
    workModes: parseList(lists.workModes),
    attendance,
    leavePolicy,
    publicHolidays: holidays.split("\n").map((line) => { const [date, ...name] = line.split("|"); return { date: date.trim(), name: name.join("|").trim() }; }).filter((item) => item.date && item.name),
    statutoryProfiles: [statutory],
  });

  return <div className="space-y-5">
    <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#202c25] text-white"><Settings2 className="h-4 w-4" /></div><div><h2 className="font-semibold">HR master lists</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">One item per line. Changes are used immediately by employee and leave forms.</p></div></div><div className="mt-5 grid gap-4 lg:grid-cols-3"><label className="text-xs font-medium text-[#4e5a52]">Departments<textarea value={lists.departments} onChange={(event) => setLists({ ...lists, departments: event.target.value })} className="textarea mt-2 min-h-44" /></label><label className="text-xs font-medium text-[#4e5a52]">Leave types<textarea value={lists.leaveTypes} onChange={(event) => setLists({ ...lists, leaveTypes: event.target.value })} className="textarea mt-2 min-h-44" /></label><label className="text-xs font-medium text-[#4e5a52]">Work modes<textarea value={lists.workModes} onChange={(event) => setLists({ ...lists, workModes: event.target.value })} className="textarea mt-2 min-h-44" /></label></div></CardContent></Card>
    <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1ece2]"><Clock3 className="h-4 w-4 text-[#ba5c42]" /></div><div><h2 className="font-semibold">Attendance rules</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Shift, grace period and overtime thresholds use Malaysia time by default.</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Setting label="Timezone"><input value={attendance.timezone} onChange={(event) => setAttendance({ ...attendance, timezone: event.target.value })} className="field" /></Setting><Setting label="Shift starts"><input type="time" value={attendance.shiftStart} onChange={(event) => setAttendance({ ...attendance, shiftStart: event.target.value })} className="field" /></Setting><Setting label="Shift ends"><input type="time" value={attendance.shiftEnd} onChange={(event) => setAttendance({ ...attendance, shiftEnd: event.target.value })} className="field" /></Setting><Setting label="Grace (minutes)"><input type="number" min="0" max="180" value={attendance.graceMinutes} onChange={(event) => setAttendance({ ...attendance, graceMinutes: Number(event.target.value) })} className="field" /></Setting><Setting label="OT after (minutes)"><input type="number" min="60" max="1440" value={attendance.overtimeAfterMinutes} onChange={(event) => setAttendance({ ...attendance, overtimeAfterMinutes: Number(event.target.value) })} className="field" /></Setting></div></CardContent></Card>
    <div className="grid gap-5 xl:grid-cols-2"><Card className="border-black/8 bg-white/90"><CardContent className="p-5"><h2 className="font-semibold">Leave engine</h2><p className="mt-1 text-xs text-muted-foreground">Entitlement, proration, carry-forward and public holiday exclusions.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Setting label="Accrual"><select value={leavePolicy.annualAccrual} onChange={(event) => setLeavePolicy({ ...leavePolicy, annualAccrual: event.target.value })} className="field"><option value="annual">Annual allocation</option><option value="monthly">Monthly accrual</option></select></Setting><Setting label="Carry-forward days"><input type="number" min="0" max="30" value={leavePolicy.carryForwardDays} onChange={(event) => setLeavePolicy({ ...leavePolicy, carryForwardDays: Number(event.target.value) })} className="field" /></Setting><Setting label="Expiry month"><input type="number" min="1" max="12" value={leavePolicy.carryForwardExpiryMonth} onChange={(event) => setLeavePolicy({ ...leavePolicy, carryForwardExpiryMonth: Number(event.target.value) })} className="field" /></Setting><label className="flex items-center gap-3 rounded-xl border bg-[#fbfaf7] p-3 text-xs font-medium"><input type="checkbox" checked={leavePolicy.prorateNewJoiner} onChange={(event) => setLeavePolicy({ ...leavePolicy, prorateNewJoiner: event.target.checked })} />Prorate new joiners</label><Setting label="Public holidays · YYYY-MM-DD | Name" wide><textarea value={holidays} onChange={(event) => setHolidays(event.target.value)} className="textarea min-h-32" placeholder="2026-08-31 | National Day" /></Setting></div></CardContent></Card>
    <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><h2 className="font-semibold">Malaysia statutory profile</h2><p className="mt-1 text-xs text-muted-foreground">Version rates by effective date. Payroll amounts remain editable and require official verification.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Setting label="Profile name" wide><input value={statutory.name} onChange={(event) => setStatutory({ ...statutory, name: event.target.value })} className="field" /></Setting><Setting label="Effective from"><DateInput value={statutory.effectiveFrom} onChange={(event) => setStatutory({ ...statutory, effectiveFrom: event.target.value })} /></Setting><Setting label="EPF employee %"><input type="number" step="0.01" value={statutory.epfEmployeeRate} onChange={(event) => setStatutory({ ...statutory, epfEmployeeRate: Number(event.target.value) })} className="field" /></Setting><Setting label="EPF employer %"><input type="number" step="0.01" value={statutory.epfEmployerRate} onChange={(event) => setStatutory({ ...statutory, epfEmployerRate: Number(event.target.value) })} className="field" /></Setting><Setting label="EIS employee %"><input type="number" step="0.01" value={statutory.eisEmployeeRate} onChange={(event) => setStatutory({ ...statutory, eisEmployeeRate: Number(event.target.value) })} className="field" /></Setting><Setting label="EIS employer %"><input type="number" step="0.01" value={statutory.eisEmployerRate} onChange={(event) => setStatutory({ ...statutory, eisEmployerRate: Number(event.target.value) })} className="field" /></Setting><Setting label="Verification notes" wide><textarea value={statutory.notes} onChange={(event) => setStatutory({ ...statutory, notes: event.target.value })} className="textarea min-h-24" /></Setting></div></CardContent></Card></div>
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center"><ShieldCheck className="h-5 w-5 shrink-0 text-amber-700" /><p className="flex-1 text-xs leading-5 text-amber-900">Role permissions and private-file access are active. Verify EPF, SOCSO, EIS and PCB against official Malaysian sources before closing payroll.</p><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save HRMS settings"}</Button></div>
    <style jsx>{`.field{height:2.75rem;width:100%;border-radius:.75rem;border:1px solid #ddd8cf;background:white;padding:0 .8rem;font-size:.875rem;outline:none}.field:focus,.textarea:focus{border-color:#ba5c42;box-shadow:0 0 0 4px rgba(186,92,66,.1)}.textarea{width:100%;resize:vertical;border-radius:.75rem;border:1px solid #ddd8cf;background:white;padding:.8rem;font-size:.875rem;line-height:1.55;outline:none}`}</style>
  </div>;
}

function Setting({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={cn("text-xs font-medium text-[#4e5a52]", wide && "sm:col-span-2")}>{label}<div className="mt-2">{children}</div></label>; }

function EditorDialog({ editor, setEditor, data, session, saving, onSave }: any) {
  const record = editor.record;
  const admin = session.role === "hr_admin";
  const update = (key: string, value: any) => setEditor({ ...editor, record: { ...record, [key]: value } });
  const employeeOptions = data.employees;
  const employeeSelect = <Field label="Team member" wide><select value={record.employeeId} disabled={session.role === "employee"} onChange={(e) => update("employeeId", e.target.value)} className="field">{employeeOptions.map((employee: any) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></Field>;

  return <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/45 sm:items-center sm:p-4">
    <Card className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-b-none bg-[#f7f4ed] shadow-2xl sm:rounded-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-[#f7f4ed]/95 p-4 backdrop-blur sm:p-6"><div><h2 className="text-xl font-semibold">{editor.isNew ? "Create" : "Edit"} {resourceLabel(editor.resource)}</h2><p className="mt-1 text-xs text-muted-foreground">Changes are saved to the shared HR workspace.</p></div><Button variant="ghost" size="icon" onClick={() => setEditor(null)}><X className="h-4 w-4" /></Button></div>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {editor.resource === "employees" && <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><input value={record.name || ""} disabled={!admin} onChange={(e) => update("name", e.target.value)} className="field" /></Field>
            <Field label="Work email"><input type="email" value={record.email || ""} disabled={!admin} onChange={(e) => update("email", e.target.value)} className="field" /></Field>
            <Field label="Job title"><input value={record.title || ""} disabled={!admin} onChange={(e) => update("title", e.target.value)} className="field" /></Field>
            <Field label="Department"><select value={record.department || ""} disabled={!admin} onChange={(e) => update("department", e.target.value)} className="field">{data.settings.departments.map((item: string) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Employment type"><select value={record.employmentType || ""} disabled={!admin} onChange={(e) => update("employmentType", e.target.value)} className="field">{["Core Team", "Full-time", "Part-time", "Contract", "Intern", "Advisor"].map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Work mode"><select value={record.workMode || ""} disabled={!admin} onChange={(e) => update("workMode", e.target.value)} className="field">{data.settings.workModes.map((item: string) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Location"><input value={record.location || ""} onChange={(e) => update("location", e.target.value)} className="field" /></Field>
            <Field label="Phone"><input value={record.phone || ""} onChange={(e) => update("phone", e.target.value)} className="field" /></Field>
            <Field label="Emergency contact"><input value={record.emergencyContact || ""} onChange={(e) => update("emergencyContact", e.target.value)} className="field" /></Field>
            {admin && <><Field label="Start date"><DateInput value={record.startDate || ""} onChange={(e) => update("startDate", e.target.value)} /></Field><Field label="Manager"><select value={record.managerId || ""} onChange={(e) => update("managerId", e.target.value)} className="field"><option value="">No manager</option>{employeeOptions.filter((item: any) => item.id !== record.id).map((employee: any) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></Field><Field label="Status"><select value={record.status || "active"} onChange={(e) => update("status", e.target.value)} className="field"><option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On leave</option><option value="alumni">Alumni</option></select></Field><Field label="Probation end"><DateInput value={record.probationEndDate || ""} onChange={(e) => update("probationEndDate", e.target.value)} /></Field><Field label="Confirmation date"><DateInput value={record.confirmationDate || ""} onChange={(e) => update("confirmationDate", e.target.value)} /></Field><Field label="Annual leave entitlement"><input type="number" min="0" value={record.annualLeaveBalance ?? 14} onChange={(e) => update("annualLeaveBalance", Number(e.target.value))} className="field" /></Field><Field label="Medical leave entitlement"><input type="number" min="0" value={record.medicalLeaveBalance ?? 14} onChange={(e) => update("medicalLeaveBalance", Number(e.target.value))} className="field" /></Field><Field label="Carry-forward balance"><input type="number" min="0" value={record.carryForwardLeaveBalance ?? 0} onChange={(e) => update("carryForwardLeaveBalance", Number(e.target.value))} className="field" /></Field><Field label="Access role"><select value={record.role || "employee"} onChange={(e) => update("role", e.target.value)} className="field"><option value="employee">Employee</option><option value="manager">Manager</option><option value="finance">Finance</option><option value="hr_admin">HR Admin</option></select></Field><Field label="Set / reset login PIN"><input type="password" inputMode="numeric" minLength={6} value={record.newPin || ""} onChange={(e) => update("newPin", e.target.value)} className="field" placeholder={record.authConfigured ? "Leave blank to keep PIN" : "Minimum 6 characters"} /></Field></>}
            <Field label="Skills" wide><input value={(record.skills || []).join(", ")} disabled={!admin} onChange={(e) => update("skills", e.target.value.split(",").map((item) => item.trim()).filter(Boolean))} className="field" /></Field>
            <Field label="Notes" wide><textarea value={record.notes || ""} onChange={(e) => update("notes", e.target.value)} className="textarea" /></Field>
          </div>
          {admin && <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2"><BookOpenCheck className="h-4 w-4 text-[#ba5c42]" /><h3 className="text-sm font-semibold">Onboarding checklist</h3></div><div className="mt-3 space-y-2">{(record.onboarding || []).map((item: any, index: number) => <label key={item.id} className="flex items-center gap-3 rounded-xl bg-[#f7f4ed] p-3 text-sm"><input type="checkbox" checked={item.done} onChange={(e) => update("onboarding", record.onboarding.map((row: any, rowIndex: number) => rowIndex === index ? { ...row, done: e.target.checked } : row))} className="h-4 w-4" /><span>{item.label}</span></label>)}</div></div>}
        </>}

        {editor.resource === "leave" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Leave type"><select value={record.type || ""} onChange={(e) => update("type", e.target.value)} className="field">{data.settings.leaveTypes.map((item: string) => <option key={item}>{item}</option>)}</select></Field><Field label="Duration"><select value={record.halfDay ? "half" : "full"} onChange={(e) => update("halfDay", e.target.value === "half")} className="field"><option value="full">Full day(s)</option><option value="half">Half day</option></select></Field><Field label="Start date"><DateInput value={record.startDate || ""} onChange={(e) => update("startDate", e.target.value)} /></Field><Field label="End date"><DateInput value={record.endDate || ""} onChange={(e) => update("endDate", e.target.value)} /></Field><Field label="Handover to"><select value={record.handoverTo || ""} onChange={(e) => update("handoverTo", e.target.value)} className="field"><option value="">Not required</option>{employeeOptions.filter((item: any) => item.id !== record.employeeId).map((employee: any) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></Field><Field label="Reason" wide><textarea value={record.reason || ""} onChange={(e) => update("reason", e.target.value)} className="textarea" /></Field><EvidenceUpload purpose="leave_attachment" employeeId={record.employeeId} value={record.attachmentId} onUploaded={(id: string) => update("attachmentId", id)} /></div>}

        {editor.resource === "attendance_corrections" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Attendance date"><DateInput value={record.date || ""} onChange={(e) => update("date", e.target.value)} /></Field><Field label="Original record"><select value={record.attendanceId || ""} onChange={(e) => update("attendanceId", e.target.value)} className="field"><option value="">Match by date</option>{data.attendance.filter((item: any) => item.employeeId === record.employeeId).map((item: any) => <option key={item.id} value={item.id}>{formatDate(item.date)} · {item.checkIn || "—"}–{item.checkOut || "—"}</option>)}</select></Field><Field label="Requested check-in"><input type="time" value={record.requestedCheckIn || ""} onChange={(e) => update("requestedCheckIn", e.target.value)} className="field" /></Field><Field label="Requested check-out"><input type="time" value={record.requestedCheckOut || ""} onChange={(e) => update("requestedCheckOut", e.target.value)} className="field" /></Field><Field label="Reason" wide><textarea value={record.reason || ""} onChange={(e) => update("reason", e.target.value)} className="textarea" /></Field></div>}

        {editor.resource === "claims" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Claim date"><DateInput value={record.claimDate || ""} onChange={(e) => update("claimDate", e.target.value)} /></Field><Field label="Category"><select value={record.category || "General"} onChange={(e) => update("category", e.target.value)} className="field">{["General", "Travel", "Meals", "Medical", "Software", "Equipment", "Client expense"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Amount (RM)"><input type="number" min="0" step="0.01" value={record.amount ?? 0} onChange={(e) => update("amount", Number(e.target.value))} className="field" /></Field><Field label="Description" wide><textarea value={record.description || ""} onChange={(e) => update("description", e.target.value)} className="textarea" /></Field><EvidenceUpload purpose="claim_receipt" employeeId={record.employeeId} value={record.receiptAssetId} onUploaded={(id: string) => update("receiptAssetId", id)} /></div>}

        {editor.resource === "payroll" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Payroll period"><input type="month" value={record.period || ""} onChange={(e) => update("period", e.target.value)} className="field" /></Field>{[["Basic salary", "basicSalary"], ["Allowances", "allowances"], ["Overtime", "overtime"], ["Bonus", "bonus"], ["EPF employee", "epfEmployee"], ["EPF employer", "epfEmployer"], ["SOCSO employee", "socsoEmployee"], ["SOCSO employer", "socsoEmployer"], ["EIS employee", "eisEmployee"], ["EIS employer", "eisEmployer"], ["PCB", "pcb"], ["Other deductions", "otherDeductions"]].map(([label, key]) => <Field key={key} label={`${label} (RM)`}><input type="number" min="0" step="0.01" value={record[key] ?? 0} onChange={(e) => update(key, Number(e.target.value))} className="field" /></Field>)}<Field label="Statutory profile"><select value={record.statutoryProfileId || "my-default"} onChange={(e) => update("statutoryProfileId", e.target.value)} className="field">{(data.settings.statutoryProfiles || []).map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Verification note" wide><textarea value={record.verificationNote || ""} onChange={(e) => update("verificationNote", e.target.value)} className="textarea" /></Field></div>}

        {editor.resource === "lifecycle" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Case type"><select value={record.type || "Probation"} onChange={(e) => update("type", e.target.value)} className="field">{["Onboarding", "Probation", "Confirmation", "Transfer", "Promotion", "Offboarding"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Status"><select value={record.status || "Open"} onChange={(e) => update("status", e.target.value)} className="field"><option>Open</option><option>In progress</option><option>Completed</option><option>Cancelled</option></select></Field><Field label="Case title" wide><input value={record.title || ""} onChange={(e) => update("title", e.target.value)} className="field" /></Field><Field label="Due date"><DateInput value={record.dueDate || ""} onChange={(e) => update("dueDate", e.target.value)} /></Field><Field label="Checklist (one task per line)" wide><textarea value={(record.tasks || []).map((task: any) => `${task.done ? "[x]" : "[ ]"} ${task.label}`).join("\n")} onChange={(e) => update("tasks", e.target.value.split("\n").map((line: string, index: number) => ({ id: record.tasks?.[index]?.id || uid(), done: /^\s*\[x\]/i.test(line), label: line.replace(/^\s*\[[x ]\]\s*/i, "").trim() })).filter((task: any) => task.label))} className="textarea" /></Field><Field label="Notes" wide><textarea value={record.notes || ""} onChange={(e) => update("notes", e.target.value)} className="textarea" /></Field></div>}

        {editor.resource === "attendance" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Date"><DateInput value={record.date || ""} onChange={(e) => update("date", e.target.value)} /></Field><Field label="Status"><select value={record.status || "Present"} onChange={(e) => update("status", e.target.value)} className="field">{["Present", "WFH", "Leave", "Absent", "Off", "Client Site"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Check in"><input type="time" value={record.checkIn || ""} onChange={(e) => update("checkIn", e.target.value)} className="field" /></Field><Field label="Check out"><input type="time" value={record.checkOut || ""} onChange={(e) => update("checkOut", e.target.value)} className="field" /></Field><Field label="Note" wide><textarea value={record.note || ""} onChange={(e) => update("note", e.target.value)} className="textarea" /></Field></div>}

        {editor.resource === "goals" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Goal title" wide><input value={record.title || ""} onChange={(e) => update("title", e.target.value)} className="field" /></Field><Field label="Period"><input value={record.period || ""} onChange={(e) => update("period", e.target.value)} className="field" /></Field><Field label="Due date"><DateInput value={record.dueDate || ""} onChange={(e) => update("dueDate", e.target.value)} /></Field><Field label={`Progress · ${record.progress || 0}%`} wide><input type="range" min="0" max="100" value={record.progress || 0} onChange={(e) => update("progress", Number(e.target.value))} className="w-full" /></Field><Field label="Status"><select value={record.status || "Not started"} onChange={(e) => update("status", e.target.value)} className="field">{["Not started", "In progress", "At risk", "Completed", "Cancelled"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Notes" wide><textarea value={record.notes || ""} onChange={(e) => update("notes", e.target.value)} className="textarea" /></Field></div>}

        {editor.resource === "learning" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Course / learning title" wide><input value={record.title || ""} onChange={(e) => update("title", e.target.value)} className="field" /></Field><Field label="Provider"><input value={record.provider || ""} onChange={(e) => update("provider", e.target.value)} className="field" /></Field><Field label="Due date"><DateInput value={record.dueDate || ""} onChange={(e) => update("dueDate", e.target.value)} /></Field><Field label="Status"><select value={record.status || "Planned"} onChange={(e) => update("status", e.target.value)} className="field">{["Planned", "In progress", "Completed", "Paused"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label={`Progress · ${record.progress || 0}%`}><input type="range" min="0" max="100" value={record.progress || 0} onChange={(e) => update("progress", Number(e.target.value))} className="w-full" /></Field><Field label="Certification"><input value={record.certification || ""} onChange={(e) => update("certification", e.target.value)} className="field" /></Field><Field label="Notes" wide><textarea value={record.notes || ""} onChange={(e) => update("notes", e.target.value)} className="textarea" /></Field></div>}

        {editor.resource === "documents" && <div className="grid gap-4 sm:grid-cols-2"><Field label="Document title" wide><input value={record.title || ""} onChange={(e) => update("title", e.target.value)} className="field" /></Field><Field label="Category"><select value={record.category || "Policy"} onChange={(e) => update("category", e.target.value)} className="field">{["Policy", "Employment", "Compliance", "Performance", "Training", "Other"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Linked employee"><select value={record.employeeId || ""} onChange={(e) => update("employeeId", e.target.value)} className="field"><option value="">Company-wide</option>{employeeOptions.map((employee: any) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></Field><Field label="Reference"><input value={record.reference || ""} onChange={(e) => update("reference", e.target.value)} className="field" /></Field><Field label="Expiry / review date"><DateInput value={record.expiryDate || ""} onChange={(e) => update("expiryDate", e.target.value)} /></Field><Field label="Status"><select value={record.status || "Active"} onChange={(e) => update("status", e.target.value)} className="field">{["Draft", "Active", "Review due", "Expired", "Archived"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Notes" wide><textarea value={record.notes || ""} onChange={(e) => update("notes", e.target.value)} className="textarea" /></Field><EvidenceUpload purpose="hr_document" employeeId={record.employeeId} value={record.assetId} onUploaded={(id: string) => update("assetId", id)} /></div>}

        <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-[#f7f4ed]/95 pt-4 backdrop-blur"><Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button><Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save record"}</Button></div>
      </CardContent>
      <style jsx>{`.field{height:2.75rem;width:100%;border-radius:.75rem;border:1px solid #ddd8cf;background:white;padding:0 .8rem;font-size:.875rem;outline:none}.field:disabled{cursor:not-allowed;background:#efede7;color:#8b918b}.field:focus,.textarea:focus{border-color:#ba5c42;box-shadow:0 0 0 4px rgba(186,92,66,.1)}.textarea{min-height:7rem;width:100%;resize:vertical;border-radius:.75rem;border:1px solid #ddd8cf;background:white;padding:.8rem;font-size:.875rem;line-height:1.55;outline:none}`}</style>
    </Card>
  </div>;
}

function EvidenceUpload({ purpose, employeeId, value, onUploaded }: { purpose: string; employeeId?: string; value?: string; onUploaded: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      const result = await requestJson("/api/hr/files", { method: "POST", body: JSON.stringify({ purpose, employeeId, filename: file.name, dataUrl }) });
      onUploaded(result.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed."); }
    finally { setBusy(false); }
  }
  return <div className="sm:col-span-2 rounded-xl border border-dashed bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="flex-1"><div className="text-xs font-semibold">Supporting file</div><div className="mt-1 text-[10px] text-muted-foreground">PDF, JPG, PNG or WebP · maximum 2 MB</div>{value && <a href={`/api/hr/files/${value}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-[#ba5c42]">View uploaded file</a>}{error && <div className="mt-2 text-xs text-red-600">{error}</div>}</div><label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border bg-white px-4 text-xs font-semibold hover:bg-[#f7f4ed]">{busy ? "Uploading…" : value ? "Replace file" : "Choose file"}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={busy} onChange={(event) => upload(event.target.files?.[0])} /></label></div></div>;
}

function resourceLabel(resource: Resource) { return ({ employees: "team member", leave: "leave request", attendance: "attendance record", attendance_corrections: "attendance correction", goals: "goal", learning: "learning record", documents: "HR document", claims: "expense claim", payroll: "payroll record", lifecycle: "lifecycle case" } as Record<Resource, string>)[resource]; }
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  const control = isValidElement<{ value?: unknown; onChange?: (event: any) => void }>(children) ? children : null;
  const value = typeof control?.props.value === "string" ? control.props.value : "";
  const canImprove = control?.type === "textarea" && typeof control.props.onChange === "function";
  return <div className={cn("block text-xs font-medium text-[#4e5a52]", wide && "sm:col-span-2")}><div className="flex min-h-8 items-center justify-between gap-2"><span>{label}</span>{canImprove && <AIWritingButton value={value} field={label} context="KretivOS HRMS record. Keep dates, people, leave details, goals, policy references and employment facts unchanged." onApply={(next) => control.props.onChange?.({ target: { value: next }, currentTarget: { value: next } })} />}</div><div className="mt-2">{children}</div></div>;
}
function Stat({ label, value, note }: any) { return <Card className="border-black/8 bg-white/90"><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{note}</div></CardContent></Card>; }
function Mini({ label, value }: any) { return <div className="rounded-xl bg-[#f7f4ed] p-3"><div className="text-[10px] text-muted-foreground">{label}</div><div className="mt-1 truncate text-xs font-medium">{value || "—"}</div></div>; }
function Status({ value }: { value: string }) { const lower = String(value).toLowerCase(); const tone = lower.includes("active") || lower.includes("approved") || lower.includes("completed") || lower === "present" ? "bg-emerald-50 text-emerald-700" : lower.includes("pending") || lower.includes("progress") || lower.includes("planned") || lower.includes("wfh") ? "bg-amber-50 text-amber-700" : lower.includes("reject") || lower.includes("absent") || lower.includes("risk") ? "bg-red-50 text-red-700" : "bg-[#eeeae0] text-[#5a605a]"; return <span className={cn("inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium", tone)}>{value}</span>; }
function Empty({ icon: Icon, title, note, action }: any) { return <div className="rounded-2xl border border-dashed bg-white/50 p-10 text-center"><Icon className="mx-auto h-7 w-7 text-muted-foreground" /><div className="mt-3 font-semibold">{title}</div><p className="mt-1 text-xs text-muted-foreground">{note}</p><Button className="mt-4" onClick={action}><Plus className="h-4 w-4" />Create record</Button></div>; }

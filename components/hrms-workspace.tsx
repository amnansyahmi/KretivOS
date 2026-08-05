"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { isValidElement, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck, CalendarCheck, Check, ChevronRight, Clock3, FileText, GraduationCap,
  Pencil, Plus, RefreshCw, Search, Settings2, ShieldCheck, Trash2, UserPlus, WalletCards, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea, isTextField } from "@/components/ui/textarea";
import { AIWritingButton } from "@/components/ai-writing-button";
import { DateInput, MonthInput } from "@/components/date-input";
import { HRPhotoAttendance } from "@/components/hr-photo-attendance";
import { HRMSAttendanceWorkbench } from "@/components/hrms-attendance-workbench";
import { HRMSNotificationCenter } from "@/components/hrms-notification-center";
import { HRMSPayrollWorkbench } from "@/components/hrms-payroll-workbench";
import { HRTeamHub } from "@/components/hrms-team-hub";
import {
  getPermittedHRMSNavigation,
  useHRViewAs,
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
  HRSelfService,
} from "@/components/hrms-extended-sections";
import { SEEDED_PROFILE, toStatutoryProfile, type StatutoryProfile } from "@/lib/payroll-statutory";
import { cn } from "@/lib/utils";

type Resource = "employees" | "leave" | "attendance" | "attendance_corrections" | "goals" | "learning" | "documents" | "claims" | "payroll" | "lifecycle" | "announcements" | "events";
type Editor = { resource: Resource; record: any; isNew: boolean } | null;

type Snapshot = {
  employees: any[];
  directory: any[];
  leaveRequests: any[];
  attendance: any[];
  attendanceCorrections: any[];
  goals: any[];
  learning: any[];
  documents: any[];
  claims: any[];
  payroll: any[];
  lifecycle: any[];
  announcements: any[];
  events: any[];
  shifts: any[];
  paymentVouchers: any[];
  settings: {
    departments: string[];
    leaveTypes: string[];
    workModes: string[];
    attendance?: { timezone?: string; shiftStart?: string; shiftEnd?: string; graceMinutes?: number; overtimeAfterMinutes?: number };
    leavePolicy?: { annualAccrual?: string; carryForwardDays?: number; carryForwardExpiryMonth?: number; prorateNewJoiner?: boolean };
    publicHolidays?: { date: string; name: string }[];
    statutoryProfiles?: any[];
    /** Printed at the head of every EA statement. */
    employer?: { name?: string; employerNumber?: string; registrationNumber?: string; address?: string };
  };
  session?: Session;
  version: number;
  syncedAt: string;
};

const emptySnapshot: Snapshot = {
  employees: [], directory: [], leaveRequests: [], attendance: [], attendanceCorrections: [], goals: [], learning: [], documents: [], claims: [], payroll: [], lifecycle: [], announcements: [], events: [], shifts: [], paymentVouchers: [],
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
  const confirm = useConfirm();
  const router = useRouter();
  const { viewAs } = useHRViewAs(session);
  const permittedTabs = getPermittedHRMSNavigation(session, viewAs);
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  // "My HR" is the landing screen for everyone. It used to open on the
  // operations dashboard whenever sign-in was off, which put the admin view in
  // front of whoever happened to open the app.
  const [tab, setTab] = useState<Tab>(validTab(initialTab || "self"));
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
    router.push(next === (session.authEnabled === false ? "overview" : "self") ? "/hr" : `/hr?section=${next}`, { scroll: false });
  }

  const employeeName = (id: string) => data.employees.find((item) => item.id === id)?.name || "Unknown team member";
  const term = query.trim().toLowerCase();
  const matches = (...values: unknown[]) => !term || values.some((value) => String(value ?? "").toLowerCase().includes(term));

  const stats = useMemo(() => ({
    active: data.employees.filter((item) => item.status === "active").length,
    pendingLeave: data.leaveRequests.filter((item) => item.status === "Pending").length,
    pendingApprovals: data.leaveRequests.filter((item) => item.status === "Pending").length
      + data.claims.filter((item) => item.status === "Pending").length
      + data.attendanceCorrections.filter((item) => item.status === "Pending").length,
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
        employeeNumber: "", dateOfBirth: "", identificationNumber: "", incomeTaxNumber: "", epfNumber: "", socsoNumber: "",
        nationality: "Malaysian", taxResident: true, maritalStatus: "Single", spouseWorking: false, childRelief: 0,
        epfApplicable: true, socsoApplicable: true, eisApplicable: true, bankName: "", bankAccountNumber: "",
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
      payroll: { ...common, employeeId: firstEmployee, period: today().slice(0, 7), basicSalary: 0, allowances: 0, overtime: 0, bonus: 0, epfEmployee: 0, epfEmployer: 0, socsoEmployee: 0, socsoEmployer: 0, eisEmployee: 0, eisEmployer: 0, pcb: 0, otherDeductions: 0, statutoryMode: "auto", statutoryProfileId: "my-default", verificationNote: "", status: "Draft" },
      lifecycle: { ...common, employeeId: firstEmployee, type: "Probation", title: "Probation review", dueDate: today(), status: "Open", notes: "", tasks: [{ id: uid(), label: "Manager review completed", done: false }, { id: uid(), label: "Confirmation decision recorded", done: false }] },
      announcements: { ...common, title: "", body: "", category: "General", status: "Published", publishAt: today(), expiresAt: "", pinned: false },
      events: { ...common, title: "", eventType: "Team event", startDate: today(), endDate: today(), location: "", description: "", status: "Scheduled" },
    };
    setEditor({ resource, record: defaults[resource], isNew: true });
  }

  function openEdit(resource: Resource, record: any) {
    setEditor({ resource, record: JSON.parse(JSON.stringify(record)), isNew: false });
  }

  async function saveEditor() {
    if (!editor || saving) return;
    if (editor.resource === "employees" && !String(editor.record.name || "").trim()) { setError("Employee name is required."); return; }
    if (["documents", "announcements", "events"].includes(editor.resource) && !String(editor.record.title || "").trim()) { setError("Title is required."); return; }
    if (!['employees', 'documents', 'announcements', 'events'].includes(editor.resource) && !editor.record.employeeId) { setError("Select a team member."); return; }
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
    if (!await confirm({ title: "Delete this record?", description: "This cannot be undone.", destructive: true })) return;
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

  async function managedMutation({ operation, resource, id, action, data: payload }: { operation: "create" | "update" | "delete" | "action"; resource: "shifts" | "payment_vouchers"; id?: string; action?: string; data?: any }) {
    setSaving(true); setError("");
    try {
      setData(await requestJson("/api/hr", { method: "POST", body: JSON.stringify({ operation, resource, id, action, data: payload || {} }) }));
      setNotice(resource === "shifts" ? "Shift planner updated." : "Payment voucher updated.");
    } catch (value) { const message = value instanceof Error ? value.message : "Unable to update HRMS record."; setError(message); throw value; }
    finally { setSaving(false); }
  }

  async function deleteManaged(resource: "shifts" | "payment_vouchers", id: string) {
    if (!await confirm({ title: "Delete this record?", description: "This cannot be undone.", destructive: true })) return;
    await managedMutation({ operation: "delete", resource, id });
  }

  /**
   * One step, by id.
   *
   * It used to send the whole employee back with a flipped boolean, which meant
   * an employee could not tick anything — the write needed permission over the
   * entire record — and two people ticking at once silently overwrote each
   * other. The server now owns the step and decides who may close it.
   */
  async function completeStep(employeeId: string, stepId: string, done = true) {
    setSaving(true); setError("");
    try {
      setData(await requestJson("/api/hr", { method: "POST", body: JSON.stringify({ operation: "onboarding", resource: "employees", id: employeeId, data: { stepId, done } }) }));
      setNotice("Onboarding updated.");
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
        <Button variant="outline" size="icon" className="hidden bg-card sm:inline-flex" onClick={load} disabled={loading} aria-label="Refresh HRMS"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Button>
        <HRMSNotificationCenter />
        {actionResource[tab] && <Button size="icon" className="sm:w-auto sm:px-4" onClick={() => openCreate(actionResource[tab]!)} aria-label={`Add ${currentTab.label} record`}><Plus className="h-4 w-4" /><span className="hidden sm:inline">Add record</span></Button>}
        {tab === "overview" && session.role === "hr_admin" && <Button size="icon" className="sm:w-auto sm:px-4" onClick={() => { changeTab("people"); openCreate("employees"); }} aria-label="Add person"><UserPlus className="h-4 w-4" /><span className="hidden sm:inline">Add person</span></Button>}
      </>}
    >
        {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}
        {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}

        {loading && !data.employees.length ? <div className="rounded-2xl border bg-card p-12 text-center text-sm text-muted-foreground">Loading HR workspace…</div> : (
          <>
            {!(["self", "overview", "payslips", "settings"] as Tab[]).includes(tab) && <div className="kretivos-search-control mb-4 flex h-11 items-center gap-2 rounded-xl border bg-card px-3"><Search className="h-5 w-5 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={`Search ${tabs.find((item) => item.id === tab)?.label.toLowerCase()}...`} /></div>}

            {tab === "self" && <HRSelfService session={session} employee={data.employees.find((item) => item.id === session.userId)} leave={data.leaveRequests.filter((item) => item.employeeId === session.userId)} attendance={data.attendance.filter((item) => item.employeeId === session.userId)} claims={data.claims.filter((item) => item.employeeId === session.userId)} payroll={data.payroll.filter((item) => item.employeeId === session.userId)} documents={data.documents} onEdit={(employee: any) => openEdit("employees", employee)} onCreate={(resource: Resource) => openCreate(resource, session.userId)} onNavigate={changeTab} onCompleteStep={(stepId: string) => completeStep(session.userId, stepId)} />}

            {tab === "overview" && <Overview data={data} stats={stats} employeeName={employeeName} setTab={changeTab} />}

            {tab === "team" && <HRTeamHub
              announcements={data.announcements}
              events={data.events}
              publicHolidays={data.settings.publicHolidays || []}
              leaveRequests={data.leaveRequests.map((item) => ({ ...item, employeeName: employeeName(item.employeeId) }))}
              lifecycle={data.lifecycle.map((item) => ({ ...item, employeeName: employeeName(item.employeeId) }))}
              directory={data.directory.length ? data.directory : data.employees}
              query={query}
              canManage={["hr_admin", "manager"].includes(session.role)}
              onCreateAnnouncement={() => openCreate("announcements")}
              onCreateEvent={() => openCreate("events")}
              onEditAnnouncement={(item: any) => openEdit("announcements", item)}
              onEditEvent={(item: any) => openEdit("events", item)}
              onDeleteAnnouncement={(id: string) => deleteRecord("announcements", id)}
              onDeleteEvent={(id: string) => deleteRecord("events", id)}
            />}

            {tab === "people" && (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.employees.filter((item) => matches(item.name, item.title, item.department, item.skills?.join(" "))).map((employee) => {
                  const completed = employee.onboarding?.filter((item: any) => item.done).length || 0;
                  const total = employee.onboarding?.length || 0;
                  return <Card key={employee.id} className="border-black/8 bg-white/90 shadow-sm"><CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-sm font-semibold text-white">{initials(employee.name)}</div><Status value={employee.status} /></div>
                    <h2 className="mt-4 text-lg font-semibold">{employee.name}</h2><p className="mt-1 text-xs text-muted-foreground">{employee.title || "Role not set"} · {employee.department}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2"><Mini label="Work mode" value={employee.workMode} /><Mini label="Employment" value={employee.employmentType} /><Mini label="Annual leave" value={`${employee.annualLeaveBalance} days`} /><Mini label="Medical leave" value={`${employee.medicalLeaveBalance} days`} /></div>
                    <div className="mt-4 rounded-xl bg-background p-3"><div className="flex justify-between text-[11px]"><span className="font-medium">Onboarding</span><span className="text-muted-foreground">{completed}/{total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-accent" style={{ width: `${total ? completed / total * 100 : 0}%` }} /></div></div>
                    {(session.role === "hr_admin" || employee.id === session.userId) && <div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => openEdit("employees", employee)}><Pencil className="h-4 w-4" />Edit</Button>{session.role === "hr_admin" && <Button variant="outline" size="icon" onClick={() => deleteRecord("employees", employee.id)} aria-label="Delete employee"><Trash2 className="h-4 w-4 text-red-500" /></Button>}</div>}
                  </CardContent></Card>;
                })}
              </div>
            )}

            {tab === "onboarding" && <div className="grid gap-4 xl:grid-cols-2">
              {data.employees.filter((employee) => matches(employee.name, employee.title, employee.department)).map((employee) => {
                const checklist = employee.onboarding || [];
                const summary = employee.onboardingSummary || { percent: 0, done: 0, total: checklist.length, waitingOnEmployee: 0, waitingOnHR: 0 };
                return <Card key={employee.id} className="border-black/8 bg-white/90"><CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-xs font-semibold text-white">{initials(employee.name)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div><h2 className="font-semibold">{employee.name}</h2><p className="mt-1 text-xs text-muted-foreground">{employee.title || "Role not set"} · Started {formatDate(employee.startDate)}</p></div>
                        <Status value={summary.percent === 100 ? "Completed" : `${summary.percent}% ready`} />
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-accent" style={{ width: `${summary.percent}%` }} /></div>
                      {/* Which side is holding it up, so chasing is aimed at the right person. */}
                      {summary.percent < 100 && <p className="mt-2 text-[11px] text-muted-foreground">{[summary.waitingOnEmployee ? `${summary.waitingOnEmployee} waiting on ${employee.name.split(" ")[0]}` : "", summary.waitingOnHR ? `${summary.waitingOnHR} waiting on HR` : ""].filter(Boolean).join(" · ")}</p>}
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">{checklist.map((item: any) => {
                    // A details step is answered by the record, so it is shown
                    // rather than offered as a button somebody could press.
                    const derived = item.kind === "profile";
                    const body = <>
                      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", item.done ? "border-foreground bg-foreground text-white" : "bg-card")}>{item.done && <Check className="h-3.5 w-3.5" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block", item.done && "text-muted-foreground line-through")}>{item.label}</span>
                        {derived && item.missing?.length > 0 && <span className="mt-0.5 block text-[10px] text-amber-700">Missing: {item.missing.join(", ")}</span>}
                      </span>
                      <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[9px] font-medium text-muted-foreground">{item.owner === "employee" ? "Employee" : "HR"}</span>
                    </>;
                    return derived
                      ? <div key={item.id} className="flex w-full items-center gap-3 rounded-xl border border-dashed bg-card p-3 text-left text-sm">{body}</div>
                      : <button key={item.id} disabled={saving} onClick={() => completeStep(employee.id, item.id, !item.done)} className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left text-sm transition hover:border-accent/40 disabled:opacity-60">{body}</button>;
                  })}</div>
                  <Button variant="outline" className="mt-4 w-full" onClick={() => openEdit("employees", employee)}><Pencil className="h-4 w-4" />Edit profile and checklist</Button>
                </CardContent></Card>;
              })}
              {!data.employees.length && <Empty icon={BookOpenCheck} title="No employee onboarding" note="Add the first employee to start an onboarding checklist." action={() => { changeTab("people"); openCreate("employees"); }} />}
            </div>}

            {tab === "leave" && (
              <div className="space-y-3">
                {data.leaveRequests.filter((item) => matches(employeeName(item.employeeId), item.type, item.status, item.reason)).map((item) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted"><CalendarCheck className="h-5 w-5 text-accent" /></div>
                  <div className="min-w-0 flex-1"><div className="font-semibold">{employeeName(item.employeeId)}</div><div className="mt-1 text-xs text-muted-foreground">{item.type} · {formatDate(item.startDate)} – {formatDate(item.endDate)} · {item.days} working day{item.days === 1 ? "" : "s"}{typeof item.balanceAfterRequest === "number" ? ` · ${item.balanceAfterRequest} days remaining` : ""}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.reason || "No reason provided."}</p>{item.attachmentId && <a href={`/api/hr/files/${item.attachmentId}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent"><FileText className="h-3.5 w-3.5" />View attachment</a>}</div>
                  <Status value={item.status} />
                  <div className="flex flex-wrap gap-2">{item.status === "Pending" && ["hr_admin", "manager"].includes(session.role) && <><Button size="sm" variant="outline" onClick={() => leaveAction(item.id, "reject")}>Reject</Button><Button size="sm" onClick={() => leaveAction(item.id, "approve")}><Check className="h-3.5 w-3.5" />Approve</Button></>}{item.status === "Pending" && item.employeeId === session.userId && <Button size="sm" variant="outline" onClick={() => leaveAction(item.id, "cancel")}>Cancel</Button>}{(["Pending", "Rejected"].includes(item.status) && item.employeeId === session.userId) || ["hr_admin", "manager"].includes(session.role) ? <Button variant="outline" size="icon" onClick={() => openEdit("leave", item)} aria-label="Edit leave"><Pencil className="h-4 w-4" /></Button> : null}{(session.role === "hr_admin" || (item.employeeId === session.userId && ["Pending", "Rejected"].includes(item.status))) && <Button variant="outline" size="icon" onClick={() => deleteRecord("leave", item.id)} aria-label="Delete leave"><Trash2 className="h-4 w-4 text-red-500" /></Button>}</div>
                </CardContent></Card>)}
                {!data.leaveRequests.length && <Empty icon={CalendarCheck} title="No leave requests" note="Create the first leave request for a team member." action={() => openCreate("leave")} />}
              </div>
            )}

            {tab === "attendance" && <HRMSAttendanceWorkbench employees={session.role === "employee" ? data.employees.filter((item) => item.id === session.userId) : data.employees} attendance={data.attendance} leaveRequests={data.leaveRequests} shifts={data.shifts} settings={data.settings.attendance} role={session.role} query={query}
              todayContent={<><div className="flex justify-end">{["hr_admin", "manager"].includes(session.role) && <Button asChild variant="outline" className="bg-card"><Link href="/hr/attendance-review"><ShieldCheck className="h-4 w-4" />Review attendance evidence</Link></Button>}</div><HRPhotoAttendance employees={session.role === "employee" ? data.employees.filter((item) => item.id === session.userId) : data.employees} attendance={data.attendance} query={query} onRefresh={load} onNotice={setNotice} onError={setError} /></>}
              correctionsContent={<HRAttendanceCorrections records={data.attendanceCorrections.filter((item) => matches(employeeName(item.employeeId), item.date, item.status, item.reason))} employeeName={employeeName} canReview={["hr_admin", "manager"].includes(session.role)} onCreate={() => openCreate("attendance_corrections")} onEdit={(item: any) => openEdit("attendance_corrections", item)} onDelete={(id: string) => deleteRecord("attendance_corrections", id)} onAction={(id: string, action: string) => recordAction("attendance_corrections", id, action)} />}
              onCreateShift={(item: any) => managedMutation({ operation: "create", resource: "shifts", data: item })} onUpdateShift={(item: any) => managedMutation({ operation: "update", resource: "shifts", id: item.id, data: item })} onDeleteShift={(id: string) => deleteManaged("shifts", id)} />}
            {tab === "payslips" && <HRMSPayrollWorkbench records={data.payroll} vouchers={data.paymentVouchers} employees={data.employees} employer={data.settings.employer} employeeName={employeeName} canManage={["hr_admin", "finance"].includes(session.role)} onCreatePayroll={() => openCreate("payroll")} onEditPayroll={(item: any) => openEdit("payroll", item)} onPayrollAction={(id: string, action: string) => recordAction("payroll", id, action)} onCreateVoucher={(item: any) => managedMutation({ operation: "create", resource: "payment_vouchers", data: item })} onUpdateVoucher={(item: any) => managedMutation({ operation: "update", resource: "payment_vouchers", id: item.id, data: item })} onDeleteVoucher={(id: string) => deleteManaged("payment_vouchers", id)} onVoucherAction={(id: string, action: string) => managedMutation({ operation: "action", resource: "payment_vouchers", id, action })} />}

            {tab === "claims" && <HRClaims claims={data.claims.filter((item) => matches(employeeName(item.employeeId), item.category, item.description, item.status, item.financeStatus))} employeeName={employeeName} canReview={["hr_admin", "manager"].includes(session.role)} canPay={["hr_admin", "finance"].includes(session.role)} onCreate={() => openCreate("claims")} onEdit={(item: any) => openEdit("claims", item)} onDelete={(id: string) => deleteRecord("claims", id)} onAction={(id: string, action: string) => recordAction("claims", id, action)} />}

            {tab === "lifecycle" && <HRLifecycle records={data.lifecycle.filter((item) => matches(employeeName(item.employeeId), item.type, item.title, item.status))} employeeName={employeeName} onCreate={() => openCreate("lifecycle")} onEdit={(item: any) => openEdit("lifecycle", item)} onDelete={(id: string) => deleteRecord("lifecycle", id)} />}

            {tab === "goals" && <div className="grid gap-4 md:grid-cols-2">{data.goals.filter((item) => matches(employeeName(item.employeeId), item.title, item.period, item.status)).map((item) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[.16em] text-accent">{item.period}</div><h2 className="mt-2 font-semibold">{item.title}</h2><p className="mt-1 text-xs text-muted-foreground">{employeeName(item.employeeId)} · Due {formatDate(item.dueDate)}</p></div><Status value={item.status} /></div><div className="mt-5"><div className="flex justify-between text-xs"><span>Progress</span><span className="font-semibold">{item.progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-accent" style={{ width: `${item.progress}%` }} /></div></div><p className="mt-4 min-h-10 text-xs leading-5 text-muted-foreground">{item.notes || "No notes."}</p><div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => openEdit("goals", item)}><Pencil className="h-4 w-4" />Update</Button><Button variant="outline" size="icon" onClick={() => deleteRecord("goals", item.id)} aria-label="Delete goal"><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>)}</div>}

            {tab === "learning" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.learning.filter((item) => matches(employeeName(item.employeeId), item.title, item.provider, item.status)).map((item) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted"><GraduationCap className="h-5 w-5 text-accent" /></div><Status value={item.status} /></div><h2 className="mt-4 font-semibold">{item.title}</h2><p className="mt-1 text-xs text-muted-foreground">{item.provider || "Provider not set"}</p><div className="mt-4 text-xs">{employeeName(item.employeeId)} · {item.progress}%</div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-foreground" style={{ width: `${item.progress}%` }} /></div><div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => openEdit("learning", item)}><Pencil className="h-4 w-4" />Edit</Button><Button variant="outline" size="icon" onClick={() => deleteRecord("learning", item.id)} aria-label="Delete learning"><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>)}</div>}

            {tab === "documents" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.documents.filter((item) => matches(item.title, item.category, item.reference, item.status, item.notes, employeeName(item.employeeId))).map((item) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted"><FileText className="h-5 w-5 text-accent" /></div><Status value={item.status} /></div><h2 className="mt-4 font-semibold">{item.title}</h2><p className="mt-1 text-xs text-muted-foreground">{item.category || "HR document"} · {item.employeeId ? employeeName(item.employeeId) : "Company-wide"}</p><div className="mt-4 grid grid-cols-2 gap-2"><Mini label="Reference" value={item.reference} /><Mini label="Expiry" value={formatDate(item.expiryDate)} /></div><p className="mt-4 min-h-10 text-xs leading-5 text-muted-foreground">{item.notes || "No notes."}</p>{item.assetId && <Button asChild variant="outline" className="mt-3 w-full"><a href={`/api/hr/files/${item.assetId}`} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" />Open private document</a></Button>}{session.role === "hr_admin" && <div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => openEdit("documents", item)}><Pencil className="h-4 w-4" />Edit</Button><Button variant="outline" size="icon" onClick={() => deleteRecord("documents", item.id)} aria-label="Delete document"><Trash2 className="h-4 w-4 text-red-500" /></Button></div>}</CardContent></Card>)}{!data.documents.length && session.role === "hr_admin" && <Empty icon={FileText} title="No HR documents" note="Create a policy or employee document register entry." action={() => openCreate("documents")} />}</div>}

            {tab === "settings" && <HRMSSettings settings={data.settings} saving={saving} authEnabled={session.authEnabled !== false} onSave={saveSettings} />}
          </>
        )}
      {editor && <EditorDialog editor={editor} setEditor={setEditor} data={data} session={session} saving={saving} onSave={saveEditor} />}
    </HRMSShell>
  );
}

function Overview({ data, stats, employeeName, setTab }: any) {
  const pending = [
    ...data.leaveRequests.filter((item: any) => item.status === "Pending").map((item: any) => ({ id: `leave-${item.id}`, tab: "leave", type: "Leave", title: employeeName(item.employeeId), meta: `${item.type} · ${formatDate(item.startDate)} – ${formatDate(item.endDate)}`, updatedAt: item.updatedAt || item.createdAt })),
    ...data.claims.filter((item: any) => item.status === "Pending").map((item: any) => ({ id: `claim-${item.id}`, tab: "claims", type: "Claim", title: employeeName(item.employeeId), meta: `${item.category} · RM ${Number(item.amount || 0).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`, updatedAt: item.updatedAt || item.createdAt })),
    ...data.attendanceCorrections.filter((item: any) => item.status === "Pending").map((item: any) => ({ id: `attendance-${item.id}`, tab: "attendance", type: "Attendance", title: employeeName(item.employeeId), meta: `${formatDate(item.date)} · correction requested`, updatedAt: item.updatedAt || item.createdAt })),
  ].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).slice(0, 5);
  const goals = data.goals.filter((item: any) => !["Completed", "Cancelled"].includes(item.status)).sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate))).slice(0, 4);
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Stat label="Active people" value={stats.active} note={`${data.employees.length} total profiles`} /><Stat label="Pending approvals" value={stats.pendingApprovals} note="Leave, claims and attendance" /><Stat label="Present today" value={stats.presentToday} note="Photo clock-in records" /><Stat label="Open goals" value={stats.openGoals} note="In current periods" /><Stat label="Active learning" value={stats.activeLearning} note="Planned or in progress" /></div>
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Team directory</h2><p className="mt-1 text-xs text-muted-foreground">Core people and onboarding readiness.</p></div><button onClick={() => setTab("people")} className="text-xs font-semibold text-accent">View all</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{data.employees.slice(0, 6).map((employee: any) => { const done = employee.onboarding?.filter((item: any) => item.done).length || 0; const total = employee.onboarding?.length || 0; return <div key={employee.id} className="flex items-center gap-3 rounded-xl border bg-card p-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-xs font-semibold text-white">{initials(employee.name)}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{employee.name}</div><div className="mt-1 truncate text-[10px] text-muted-foreground">{employee.title || "Kretivco Team"} · Onboarding {done}/{total}</div></div><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>; })}</div></CardContent></Card>
      <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Approval queue</h2><p className="mt-1 text-xs text-muted-foreground">Leave, claims and attendance decisions.</p></div><Button asChild variant="ghost" size="sm"><Link href="/approvals">Open inbox</Link></Button></div><div className="mt-4 space-y-2">{pending.map((item: any) => <button key={item.id} onClick={() => setTab(item.tab)} className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-accent/35"><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{item.title}</div><div className="mt-1 truncate text-xs text-muted-foreground">{item.meta}</div></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-medium text-amber-700">{item.type}</span></button>)}{!pending.length && <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">No HR approvals are waiting.</div>}</div></CardContent></Card>
    </div>
    <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Goals requiring attention</h2><p className="mt-1 text-xs text-muted-foreground">Progress and deadlines across the team.</p></div><button onClick={() => setTab("goals")} className="text-xs font-semibold text-accent">Manage goals</button></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{goals.map((goal: any) => <div key={goal.id} className="rounded-xl border bg-card p-4"><div className="text-[10px] uppercase tracking-[.14em] text-accent">{goal.period}</div><div className="mt-2 text-sm font-semibold">{goal.title}</div><div className="mt-1 text-[10px] text-muted-foreground">{employeeName(goal.employeeId)} · {goal.progress}%</div></div>)}{!goals.length && <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground md:col-span-2 xl:col-span-4">No active goals yet.</div>}</div></CardContent></Card>
  </div>;
}

function HRMSSettings({ settings, saving, authEnabled, onSave }: { settings: Snapshot["settings"]; saving: boolean; authEnabled: boolean; onSave: (settings: Snapshot["settings"]) => void }) {
  const [lists, setLists] = useState({ departments: "", leaveTypes: "", workModes: "" });
  const [attendance, setAttendance] = useState({ timezone: "Asia/Kuala_Lumpur", shiftStart: "09:00", shiftEnd: "18:00", graceMinutes: 15, overtimeAfterMinutes: 540 });
  const [leavePolicy, setLeavePolicy] = useState({ annualAccrual: "annual", carryForwardDays: 5, carryForwardExpiryMonth: 3, prorateNewJoiner: true });
  const [holidays, setHolidays] = useState("");
  const [statutory, setStatutory] = useState<StatutoryProfile>(SEEDED_PROFILE);
  // Bands and official tables are edited as text for the same reason public
  // holidays are: they are transcribed from a published document, and a row of
  // number inputs per band turns a paste into forty separate clicks.
  const [taxBands, setTaxBands] = useState("");
  const [socsoTable, setSocsoTable] = useState("");
  const [eisTable, setEisTable] = useState("");

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
    // Normalised on the way in as well as the way out, so a profile still
    // stored in the older flat shape opens with every field populated.
    const profile = toStatutoryProfile(settings.statutoryProfiles?.[0] ?? null);
    setStatutory(profile);
    setTaxBands(profile.pcb.bands.map((band) => `${band.upTo ?? "above"} | ${band.rate}`).join("\n"));
    setSocsoTable((profile.socso.table || []).map((band) => `${band.upTo} | ${band.employee} | ${band.employer}`).join("\n"));
    setEisTable((profile.eis.table || []).map((band) => `${band.upTo} | ${band.employee} | ${band.employer}`).join("\n"));
  }, [settings]);

  const parseList = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  /** "upTo | employee | employer" per line; a blank box means no table. */
  const parseTable = (value: string) => value.split("\n").map((line) => {
    const [upTo, employee, employer] = line.split("|").map((part) => Number(part.trim()));
    return { upTo, employee, employer };
  }).filter((band) => Number.isFinite(band.upTo) && band.upTo > 0 && Number.isFinite(band.employee) && Number.isFinite(band.employer));
  /** "upTo | rate" per line; a final row with a non-numeric limit is the unbounded top band. */
  const parseBands = (value: string) => value.split("\n").map((line) => {
    const [upTo, rateValue] = line.split("|").map((part) => part.trim());
    return { upTo: Number.isFinite(Number(upTo)) && upTo !== "" ? Number(upTo) : null, rate: Number(rateValue) || 0 };
  }).filter((band) => band.upTo !== null || band.rate > 0);

  const submit = () => onSave({
    departments: parseList(lists.departments),
    leaveTypes: parseList(lists.leaveTypes),
    workModes: parseList(lists.workModes),
    attendance,
    leavePolicy,
    publicHolidays: holidays.split("\n").map((line) => { const [date, ...name] = line.split("|"); return { date: date.trim(), name: name.join("|").trim() }; }).filter((item) => item.date && item.name),
    statutoryProfiles: [{
      ...statutory,
      socso: { ...statutory.socso, table: parseTable(socsoTable) },
      eis: { ...statutory.eis, table: parseTable(eisTable) },
      pcb: { ...statutory.pcb, bands: parseBands(taxBands).length ? parseBands(taxBands) : statutory.pcb.bands },
    }],
  });

  const epfField = (label: string, key: keyof StatutoryProfile["epf"]) => <Setting label={label}><Input type="number" step="0.01" value={statutory.epf[key]} onChange={(event) => setStatutory({ ...statutory, epf: { ...statutory.epf, [key]: Number(event.target.value) } })} /></Setting>;
  const contributionField = (scheme: "socso" | "eis", label: string, key: "employeeRate" | "employerRate" | "wageCeiling" | "seniorEmployerRate") => <Setting label={label}><Input type="number" step="0.01" value={statutory[scheme][key] ?? 0} onChange={(event) => setStatutory({ ...statutory, [scheme]: { ...statutory[scheme], [key]: Number(event.target.value) } })} /></Setting>;
  const pcbField = (label: string, key: keyof StatutoryProfile["pcb"]) => <Setting label={label}><Input type="number" step="0.01" value={statutory.pcb[key] as number} onChange={(event) => setStatutory({ ...statutory, pcb: { ...statutory.pcb, [key]: Number(event.target.value) } })} /></Setting>;

  return <div className="space-y-5">
    <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-white"><Settings2 className="h-4 w-4" /></div><div><h2 className="font-semibold">HR master lists</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">One item per line. Changes are used immediately by employee and leave forms.</p></div></div><div className="mt-5 grid gap-4 lg:grid-cols-3"><label className="text-xs font-medium text-foreground-soft">Departments<Textarea value={lists.departments} onChange={(event) => setLists({ ...lists, departments: event.target.value })} className="mt-2 min-h-44" /></label><label className="text-xs font-medium text-foreground-soft">Leave types<Textarea value={lists.leaveTypes} onChange={(event) => setLists({ ...lists, leaveTypes: event.target.value })} className="mt-2 min-h-44" /></label><label className="text-xs font-medium text-foreground-soft">Work modes<Textarea value={lists.workModes} onChange={(event) => setLists({ ...lists, workModes: event.target.value })} className="mt-2 min-h-44" /></label></div></CardContent></Card>
    <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Clock3 className="h-4 w-4 text-accent" /></div><div><h2 className="font-semibold">Attendance rules</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Shift, grace period and overtime thresholds use Malaysia time by default.</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Setting label="Timezone"><Input value={attendance.timezone} onChange={(event) => setAttendance({ ...attendance, timezone: event.target.value })} /></Setting><Setting label="Shift starts"><Input type="time" value={attendance.shiftStart} onChange={(event) => setAttendance({ ...attendance, shiftStart: event.target.value })} /></Setting><Setting label="Shift ends"><Input type="time" value={attendance.shiftEnd} onChange={(event) => setAttendance({ ...attendance, shiftEnd: event.target.value })} /></Setting><Setting label="Grace (minutes)"><Input type="number" min="0" max="180" value={attendance.graceMinutes} onChange={(event) => setAttendance({ ...attendance, graceMinutes: Number(event.target.value) })} /></Setting><Setting label="OT after (minutes)"><Input type="number" min="60" max="1440" value={attendance.overtimeAfterMinutes} onChange={(event) => setAttendance({ ...attendance, overtimeAfterMinutes: Number(event.target.value) })} /></Setting></div></CardContent></Card>
    <div className="grid gap-5 xl:grid-cols-2"><Card className="border-black/8 bg-white/90"><CardContent className="p-5"><h2 className="font-semibold">Leave engine</h2><p className="mt-1 text-xs text-muted-foreground">Entitlement, proration, carry-forward and public holiday exclusions.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Setting label="Accrual"><Select value={leavePolicy.annualAccrual} onChange={(event) => setLeavePolicy({ ...leavePolicy, annualAccrual: event.target.value })} ><option value="annual">Annual allocation</option><option value="monthly">Monthly accrual</option></Select></Setting><Setting label="Carry-forward days"><Input type="number" min="0" max="30" value={leavePolicy.carryForwardDays} onChange={(event) => setLeavePolicy({ ...leavePolicy, carryForwardDays: Number(event.target.value) })} /></Setting><Setting label="Expiry month"><Input type="number" min="1" max="12" value={leavePolicy.carryForwardExpiryMonth} onChange={(event) => setLeavePolicy({ ...leavePolicy, carryForwardExpiryMonth: Number(event.target.value) })} /></Setting><label className="flex items-center gap-3 rounded-xl border bg-card p-3 text-xs font-medium"><input type="checkbox" checked={leavePolicy.prorateNewJoiner} onChange={(event) => setLeavePolicy({ ...leavePolicy, prorateNewJoiner: event.target.checked })} />Prorate new joiners</label><Setting label="Public holidays · YYYY-MM-DD | Name" wide><Textarea value={holidays} onChange={(event) => setHolidays(event.target.value)} className="min-h-32" placeholder="2026-08-31 | National Day" /></Setting></div></CardContent></Card>
    <Card className="border-black/8 bg-white/90"><CardContent className="p-5">
      <h2 className="font-semibold">Malaysia statutory profile</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Payroll calculates EPF, SOCSO, EIS and PCB from these. They are versioned by effective date, so re-opening an old period uses the rates that applied to it rather than today&rsquo;s. Check them against the official schedules — nothing here is authoritative.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Setting label="Profile name" wide><Input value={statutory.name} onChange={(event) => setStatutory({ ...statutory, name: event.target.value })} /></Setting>
        <Setting label="Effective from"><DateInput value={statutory.effectiveFrom} onChange={(event) => setStatutory({ ...statutory, effectiveFrom: event.target.value })} /></Setting>
      </div>

      <div className="mt-5 border-t pt-4">
        <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">EPF · Third Schedule</div>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Contributions are worked out on the top of each wage band and rounded up to the ringgit, which is why RM5,001 can cost the employer less than RM5,000.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {epfField("Employee %", "employeeRate")}
          {epfField("Employer % up to threshold", "employerRateBelow")}
          {epfField("Employer % above", "employerRateAbove")}
          {epfField("Employer rate threshold (RM)", "employerRateThreshold")}
          {epfField("Wage band step (RM)", "wageBandStep")}
          {epfField("Exact rate above (RM)", "exactAbove")}
          {epfField("Senior age", "seniorAge")}
          {epfField("Senior employee %", "seniorEmployeeRate")}
          {epfField("Senior employer %", "seniorEmployerRate")}
        </div>
      </div>

      <div className="mt-5 grid gap-5 border-t pt-4 xl:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">SOCSO</div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {contributionField("socso", "Employee %", "employeeRate")}
            {contributionField("socso", "Employer %", "employerRate")}
            {contributionField("socso", "Wage ceiling (RM)", "wageCeiling")}
            {contributionField("socso", "Senior employer %", "seniorEmployerRate")}
            <Setting label="Official table · upTo | employee | employer" wide><Textarea value={socsoTable} onChange={(event) => setSocsoTable(event.target.value)} className="min-h-28" placeholder={"1000 | 4.50 | 15.75\n2000 | 9.75 | 34.15"} /></Setting>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">EIS</div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {contributionField("eis", "Employee %", "employeeRate")}
            {contributionField("eis", "Employer %", "employerRate")}
            {contributionField("eis", "Wage ceiling (RM)", "wageCeiling")}
            <Setting label="Stops at age"><Input type="number" value={statutory.eis.maximumAge ?? 0} onChange={(event) => setStatutory({ ...statutory, eis: { ...statutory.eis, maximumAge: Number(event.target.value) || null } })} /></Setting>
            <Setting label="Official table · upTo | employee | employer" wide><Textarea value={eisTable} onChange={(event) => setEisTable(event.target.value)} className="min-h-28" placeholder={"1000 | 0.40 | 0.40"} /></Setting>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Paste the published schedules above and they replace the percentages entirely — the rates only approximate the banding. Leave a box empty to keep using them.</p>

      <div className="mt-5 border-t pt-4">
        <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">PCB · reliefs and tax bands</div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {pcbField("Individual relief (RM)", "individualRelief")}
          {pcbField("Spouse relief (RM)", "spouseRelief")}
          {pcbField("Child relief each (RM)", "childRelief")}
          {pcbField("EPF relief cap (RM)", "epfReliefCap")}
          {pcbField("SOCSO and EIS relief cap (RM)", "socsoReliefCap")}
          {pcbField("Rebate up to (RM)", "rebateThreshold")}
          {pcbField("Rebate amount (RM)", "rebateAmount")}
          {pcbField("Non-resident flat %", "nonResidentRate")}
          <Setting label="Tax bands · upTo | rate %  (last line 'above | rate')" wide><Textarea value={taxBands} onChange={(event) => setTaxBands(event.target.value)} className="min-h-40" placeholder={"5000 | 0\n20000 | 1\nabove | 30"} /></Setting>
        </div>
      </div>

      <div className="mt-5 border-t pt-4">
        <Setting label="Verification notes" wide><Textarea value={statutory.notes || ""} onChange={(event) => setStatutory({ ...statutory, notes: event.target.value })} className="min-h-24" /></Setting>
      </div>
    </CardContent></Card></div>
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center"><ShieldCheck className="h-5 w-5 shrink-0 text-amber-700" /><p className="flex-1 text-xs leading-5 text-amber-900">{authEnabled ? "Role permissions and private-file access are active." : "Shared HR workspace mode is active; employee login and role isolation remain disabled as requested."} Verify EPF, SOCSO, EIS and PCB against official Malaysian sources before closing payroll.</p><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save HRMS settings"}</Button></div>
  </div>;
}

function Setting({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <Label className={cn("text-foreground-soft", wide && "sm:col-span-2")}>{label}<div className="mt-2">{children}</div></Label>; }

function EditorDialog({ editor, setEditor, data, session, saving, onSave }: any) {
  const record = editor.record;
  const admin = session.role === "hr_admin";
  const update = (key: string, value: any) => setEditor({ ...editor, record: { ...record, [key]: value } });
  // Several fields at once: calling update() in sequence would each spread the
  // same stale record and only the last would survive.
  const updateMany = (patch: Record<string, any>) => setEditor({ ...editor, record: { ...record, ...patch } });
  const employeeOptions = data.employees;
  const employeeSelect = <Field label="Team member" wide><Select value={record.employeeId} disabled={session.role === "employee"} onChange={(e) => update("employeeId", e.target.value)} >{employeeOptions.map((employee: any) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</Select></Field>;

  return <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/45 sm:items-center sm:p-4">
    <Card className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-b-none bg-background shadow-2xl sm:rounded-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-background/95 p-4 backdrop-blur sm:p-6"><div><h2 className="text-xl font-semibold">{editor.isNew ? "Create" : "Edit"} {resourceLabel(editor.resource)}</h2><p className="mt-1 text-xs text-muted-foreground">Changes are saved to the shared HR workspace.</p></div><Button variant="ghost" size="icon" aria-label="Close editor" onClick={() => setEditor(null)}><X className="h-4 w-4" /></Button></div>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {editor.resource === "employees" && <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={record.name || ""} disabled={!admin} onChange={(e) => update("name", e.target.value)} /></Field>
            <Field label="Work email"><Input type="email" value={record.email || ""} disabled={!admin} onChange={(e) => update("email", e.target.value)} /></Field>
            <Field label="Job title"><Input value={record.title || ""} disabled={!admin} onChange={(e) => update("title", e.target.value)} /></Field>
            <Field label="Department"><Select value={record.department || ""} disabled={!admin} onChange={(e) => update("department", e.target.value)} >{data.settings.departments.map((item: string) => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="Employment type"><Select value={record.employmentType || ""} disabled={!admin} onChange={(e) => update("employmentType", e.target.value)} >{["Core Team", "Full-time", "Part-time", "Contract", "Intern", "Advisor"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="Work mode"><Select value={record.workMode || ""} disabled={!admin} onChange={(e) => update("workMode", e.target.value)} >{data.settings.workModes.map((item: string) => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="Location"><Input value={record.location || ""} onChange={(e) => update("location", e.target.value)} /></Field>
            <Field label="Phone"><Input value={record.phone || ""} onChange={(e) => update("phone", e.target.value)} /></Field>
            <Field label="Emergency contact"><Input value={record.emergencyContact || ""} onChange={(e) => update("emergencyContact", e.target.value)} /></Field>
            {admin && <><Field label="Start date"><DateInput value={record.startDate || ""} onChange={(e) => update("startDate", e.target.value)} /></Field><Field label="Manager"><Select value={record.managerId || ""} onChange={(e) => update("managerId", e.target.value)} ><option value="">No manager</option>{employeeOptions.filter((item: any) => item.id !== record.id).map((employee: any) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</Select></Field><Field label="Status"><Select value={record.status || "active"} onChange={(e) => update("status", e.target.value)} ><option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On leave</option><option value="alumni">Alumni</option></Select></Field><Field label="Probation end"><DateInput value={record.probationEndDate || ""} onChange={(e) => update("probationEndDate", e.target.value)} /></Field><Field label="Confirmation date"><DateInput value={record.confirmationDate || ""} onChange={(e) => update("confirmationDate", e.target.value)} /></Field><Field label="Annual leave entitlement"><Input type="number" min="0" value={record.annualLeaveBalance ?? 14} onChange={(e) => update("annualLeaveBalance", Number(e.target.value))} /></Field><Field label="Medical leave entitlement"><Input type="number" min="0" value={record.medicalLeaveBalance ?? 14} onChange={(e) => update("medicalLeaveBalance", Number(e.target.value))} /></Field><Field label="Carry-forward balance"><Input type="number" min="0" value={record.carryForwardLeaveBalance ?? 0} onChange={(e) => update("carryForwardLeaveBalance", Number(e.target.value))} /></Field>{session.authEnabled !== false && <><Field label="Access role"><Select value={record.role || "employee"} onChange={(e) => update("role", e.target.value)} ><option value="employee">Employee</option><option value="manager">Manager</option><option value="finance">Finance</option><option value="hr_admin">HR Admin</option></Select></Field><Field label="Set / reset login PIN"><Input type="password" inputMode="numeric" minLength={6} value={record.newPin || ""} onChange={(e) => update("newPin", e.target.value)} placeholder={record.authConfigured ? "Leave blank to keep PIN" : "Minimum 6 characters"} /></Field></>}</>}
            <Field label="Skills" wide><Input value={(record.skills || []).join(", ")} disabled={!admin} onChange={(e) => update("skills", e.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></Field>
            <Field label="Notes" wide><Textarea value={record.notes || ""} onChange={(e) => update("notes", e.target.value)} /></Field>
          </div>

          {/*
            * Shown to the person it is about as well as to HR, because
            * onboarding asks them to fill it in. Tax residency and the
            * applicability flags stay HR-only below: those are determinations
            * about someone, not facts they hold.
            */}
          {(admin || record.id === session.userId) && <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">Payroll and statutory</h3></div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{admin ? "What payroll works the deductions out from. Date of birth is required for the age rules on EPF, SOCSO and EIS; marital status and children set the PCB reliefs." : "Payroll needs these to pay you and to work out your EPF, SOCSO and PCB correctly. If you have no income tax or EPF number yet, leave those blank."}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Employee number"><Input value={record.employeeNumber || ""} onChange={(e) => update("employeeNumber", e.target.value)} /></Field>
              <Field label="Date of birth"><DateInput value={record.dateOfBirth || ""} onChange={(e) => update("dateOfBirth", e.target.value)} /></Field>
              <Field label="Identification number (NRIC or passport)"><Input value={record.identificationNumber || ""} onChange={(e) => update("identificationNumber", e.target.value)} /></Field>
              <Field label="Income tax number"><Input value={record.incomeTaxNumber || ""} onChange={(e) => update("incomeTaxNumber", e.target.value)} /></Field>
              <Field label="EPF number"><Input value={record.epfNumber || ""} onChange={(e) => update("epfNumber", e.target.value)} /></Field>
              <Field label="SOCSO number"><Input value={record.socsoNumber || ""} onChange={(e) => update("socsoNumber", e.target.value)} /></Field>
              <Field label="Nationality"><Select value={record.nationality || "Malaysian"} onChange={(e) => update("nationality", e.target.value)}>{["Malaysian", "Permanent Resident", "Foreign"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
              {admin && <Field label="Tax residency"><Select value={record.taxResident === false ? "non-resident" : "resident"} onChange={(e) => update("taxResident", e.target.value === "resident")}><option value="resident">Resident</option><option value="non-resident">Non-resident</option></Select></Field>}
              <Field label="Marital status"><Select value={record.maritalStatus || "Single"} onChange={(e) => update("maritalStatus", e.target.value)}><option>Single</option><option>Married</option></Select></Field>
              <Field label="Children claimed for relief"><Input type="number" min="0" step="1" value={record.childRelief ?? 0} onChange={(e) => update("childRelief", Number(e.target.value))} /></Field>
              {String(record.maritalStatus) === "Married" && <label className="flex items-center gap-3 rounded-xl border bg-background p-3 text-xs font-medium sm:col-span-2"><input type="checkbox" className="h-4 w-4" checked={Boolean(record.spouseWorking)} onChange={(e) => update("spouseWorking", e.target.checked)} />Spouse has their own income (no spouse relief is claimed)</label>}
              <Field label="Bank"><Input value={record.bankName || ""} onChange={(e) => update("bankName", e.target.value)} placeholder="Maybank" /></Field>
              <Field label="Bank account number"><Input value={record.bankAccountNumber || ""} onChange={(e) => update("bankAccountNumber", e.target.value)} /></Field>
            </div>
            {admin && <div className="mt-4 flex flex-wrap gap-2">
              {([["epfApplicable", "EPF"], ["socsoApplicable", "SOCSO"], ["eisApplicable", "EIS"]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-xs font-medium"><input type="checkbox" className="h-4 w-4" checked={record[key] !== false} onChange={(e) => update(key, e.target.checked)} />{label} applies</label>)}
            </div>}
          </div>}
          {/*
            * Steps are completed from the Onboarding tab and from My HR, not
            * here — a second set of tick boxes on the edit form would be a
            * competing path to the same state, and the one that skipped the
            * ownership rules. What this screen owns is the setup: which
            * document each policy step asks the joiner to read. Without that
            * link "I have read this" is a tick against nothing.
            */}
          {admin && <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2"><BookOpenCheck className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">Onboarding checklist</h3></div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Completed from Onboarding and My HR. Detail steps tick themselves once the fields are filled in.</p>
            <div className="mt-3 space-y-2">{(record.onboarding || []).map((item: any, index: number) => <div key={item.id} className="rounded-xl bg-background p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", item.done ? "border-foreground bg-foreground text-white" : "bg-card")}>{item.done && <Check className="h-3.5 w-3.5" />}</span>
                <span className="min-w-0 flex-1">{item.label}</span>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[9px] font-medium text-muted-foreground">{item.owner === "employee" ? "Employee" : "HR"}</span>
              </div>
              {item.kind === "policy" && <Select className="mt-2" value={item.documentId || ""} onChange={(e) => update("onboarding", record.onboarding.map((row: any, rowIndex: number) => rowIndex === index ? { ...row, documentId: e.target.value } : row))}>
                <option value="">No document linked</option>
                {data.documents.map((document: any) => <option key={document.id} value={document.id}>{document.title}</option>)}
              </Select>}
              {item.kind === "profile" && item.missing?.length > 0 && <div className="mt-1 text-[10px] text-amber-700">Missing: {item.missing.join(", ")}</div>}
            </div>)}</div>
          </div>}
        </>}

        {editor.resource === "leave" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Leave type"><Select value={record.type || ""} onChange={(e) => update("type", e.target.value)} >{data.settings.leaveTypes.map((item: string) => <option key={item}>{item}</option>)}</Select></Field><Field label="Duration"><Select value={record.halfDay ? "half" : "full"} onChange={(e) => update("halfDay", e.target.value === "half")} ><option value="full">Full day(s)</option><option value="half">Half day</option></Select></Field><Field label="Start date"><DateInput value={record.startDate || ""} onChange={(e) => update("startDate", e.target.value)} /></Field><Field label="End date"><DateInput value={record.endDate || ""} onChange={(e) => update("endDate", e.target.value)} /></Field><Field label="Handover to"><Select value={record.handoverTo || ""} onChange={(e) => update("handoverTo", e.target.value)} ><option value="">Not required</option>{employeeOptions.filter((item: any) => item.id !== record.employeeId).map((employee: any) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</Select></Field><Field label="Reason" wide><Textarea value={record.reason || ""} onChange={(e) => update("reason", e.target.value)} /></Field><EvidenceUpload purpose="leave_attachment" employeeId={record.employeeId} value={record.attachmentId} onUploaded={(id: string) => update("attachmentId", id)} /></div>}

        {editor.resource === "attendance_corrections" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Attendance date"><DateInput value={record.date || ""} onChange={(e) => update("date", e.target.value)} /></Field><Field label="Original record"><Select value={record.attendanceId || ""} onChange={(e) => update("attendanceId", e.target.value)} ><option value="">Match by date</option>{data.attendance.filter((item: any) => item.employeeId === record.employeeId).map((item: any) => <option key={item.id} value={item.id}>{formatDate(item.date)} · {item.checkIn || "—"}–{item.checkOut || "—"}</option>)}</Select></Field><Field label="Requested check-in"><Input type="time" value={record.requestedCheckIn || ""} onChange={(e) => update("requestedCheckIn", e.target.value)} /></Field><Field label="Requested check-out"><Input type="time" value={record.requestedCheckOut || ""} onChange={(e) => update("requestedCheckOut", e.target.value)} /></Field><Field label="Reason" wide><Textarea value={record.reason || ""} onChange={(e) => update("reason", e.target.value)} /></Field></div>}

        {editor.resource === "claims" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Claim date"><DateInput value={record.claimDate || ""} onChange={(e) => update("claimDate", e.target.value)} /></Field><Field label="Category"><Select value={record.category || "General"} onChange={(e) => update("category", e.target.value)} >{["General", "Travel", "Meals", "Medical", "Software", "Equipment", "Client expense"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Amount (RM)"><Input type="number" min="0" step="0.01" value={record.amount ?? 0} onChange={(e) => update("amount", Number(e.target.value))} /></Field><Field label="Description" wide><Textarea value={record.description || ""} onChange={(e) => update("description", e.target.value)} /></Field><EvidenceUpload purpose="claim_receipt" employeeId={record.employeeId} value={record.receiptAssetId} onUploaded={(id: string, suggested?: any) => updateMany({
            receiptAssetId: id,
            // Only fills what the claimant has not already entered — a read
            // amount never overwrites a figure somebody typed deliberately.
            ...(suggested?.total && !Number(record.amount) ? { amount: Number(suggested.total) } : {}),
            // claimDate is pre-filled with today, so "empty" is not the test:
            // on a new claim the date read off the receipt beats that default.
            ...(suggested?.documentDate && (editor.isNew || !record.claimDate) ? { claimDate: suggested.documentDate } : {}),
            ...(suggested?.vendorName && !String(record.description || "").trim() ? { description: suggested.vendorName } : {}),
          })} /></div>}

        {editor.resource === "payroll" && (() => {
          // Auto is the default for anything new. The statutory boxes stay
          // visible either way rather than disappearing, because the figure is
          // the thing being checked — hiding it would replace "verify this" with
          // "trust me".
          const auto = String(record.statutoryMode ?? "auto") !== "manual";
          const earnings = [["Basic salary", "basicSalary"], ["Allowances", "allowances"], ["Overtime", "overtime"], ["Bonus", "bonus"], ["Other deductions", "otherDeductions"]] as const;
          const statutory = [["EPF employee", "epfEmployee"], ["EPF employer", "epfEmployer"], ["SOCSO employee", "socsoEmployee"], ["SOCSO employer", "socsoEmployer"], ["EIS employee", "eisEmployee"], ["EIS employer", "eisEmployer"], ["PCB", "pcb"]] as const;
          return <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {employeeSelect}
              <Field label="Payroll period"><MonthInput value={record.period || ""} onChange={(e) => update("period", e.target.value)} /></Field>
              {earnings.map(([label, key]) => <Field key={key} label={`${label} (RM)`}><Input type="number" min="0" step="0.01" value={record[key] ?? 0} onChange={(e) => update(key, Number(e.target.value))} /></Field>)}
            </div>

            <div className="rounded-2xl border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold">Statutory deductions</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{auto ? "Worked out from the statutory profile for this period and the employee's date of birth, residency and reliefs. Saved figures appear here after saving." : "Entered by hand. Nothing is recalculated."}</p>
                </div>
                <Select className="sm:w-52" value={auto ? "auto" : "manual"} onChange={(e) => update("statutoryMode", e.target.value)}>
                  <option value="auto">Calculate automatically</option>
                  <option value="manual">Enter manually</option>
                </Select>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {statutory.map(([label, key]) => <Field key={key} label={`${label} (RM)`}><Input type="number" min="0" step="0.01" disabled={auto} value={record[key] ?? 0} onChange={(e) => update(key, Number(e.target.value))} /></Field>)}
              </div>

              {Array.isArray(record.statutoryWarnings) && record.statutoryWarnings.length > 0 && <ul className="mt-4 list-disc space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 pl-7 text-[11px] leading-5 text-amber-900">
                {record.statutoryWarnings.map((item: string) => <li key={item}>{item}</li>)}
              </ul>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Statutory profile"><Select value={record.statutoryProfileId || "my-default"} onChange={(e) => update("statutoryProfileId", e.target.value)} >{(data.settings.statutoryProfiles || []).map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
              <Field label="Verification note" wide><Textarea value={record.verificationNote || ""} onChange={(e) => update("verificationNote", e.target.value)} /></Field>
            </div>
          </div>;
        })()}

        {editor.resource === "lifecycle" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Case type"><Select value={record.type || "Probation"} onChange={(e) => update("type", e.target.value)} >{["Onboarding", "Probation", "Confirmation", "Transfer", "Promotion", "Offboarding"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Status"><Select value={record.status || "Open"} onChange={(e) => update("status", e.target.value)} ><option>Open</option><option>In progress</option><option>Completed</option><option>Cancelled</option></Select></Field><Field label="Case title" wide><Input value={record.title || ""} onChange={(e) => update("title", e.target.value)} /></Field><Field label="Due date"><DateInput value={record.dueDate || ""} onChange={(e) => update("dueDate", e.target.value)} /></Field><Field label="Checklist (one task per line)" wide><Textarea value={(record.tasks || []).map((task: any) => `${task.done ? "[x]" : "[ ]"} ${task.label}`).join("\n")} onChange={(e) => update("tasks", e.target.value.split("\n").map((line: string, index: number) => ({ id: record.tasks?.[index]?.id || uid(), done: /^\s*\[x\]/i.test(line), label: line.replace(/^\s*\[[x ]\]\s*/i, "").trim() })).filter((task: any) => task.label))} /></Field><Field label="Notes" wide><Textarea value={record.notes || ""} onChange={(e) => update("notes", e.target.value)} /></Field></div>}

        {editor.resource === "attendance" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Date"><DateInput value={record.date || ""} onChange={(e) => update("date", e.target.value)} /></Field><Field label="Status"><Select value={record.status || "Present"} onChange={(e) => update("status", e.target.value)} >{["Present", "WFH", "Leave", "Absent", "Off", "Client Site"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Check in"><Input type="time" value={record.checkIn || ""} onChange={(e) => update("checkIn", e.target.value)} /></Field><Field label="Check out"><Input type="time" value={record.checkOut || ""} onChange={(e) => update("checkOut", e.target.value)} /></Field><Field label="Note" wide><Textarea value={record.note || ""} onChange={(e) => update("note", e.target.value)} /></Field></div>}

        {editor.resource === "goals" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Goal title" wide><Input value={record.title || ""} onChange={(e) => update("title", e.target.value)} /></Field><Field label="Period"><Input value={record.period || ""} onChange={(e) => update("period", e.target.value)} /></Field><Field label="Due date"><DateInput value={record.dueDate || ""} onChange={(e) => update("dueDate", e.target.value)} /></Field><Field label={`Progress · ${record.progress || 0}%`} wide><input type="range" min="0" max="100" value={record.progress || 0} onChange={(e) => update("progress", Number(e.target.value))} className="w-full" /></Field><Field label="Status"><Select value={record.status || "Not started"} onChange={(e) => update("status", e.target.value)} >{["Not started", "In progress", "At risk", "Completed", "Cancelled"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Notes" wide><Textarea value={record.notes || ""} onChange={(e) => update("notes", e.target.value)} /></Field></div>}

        {editor.resource === "learning" && <div className="grid gap-4 sm:grid-cols-2">{employeeSelect}<Field label="Course / learning title" wide><Input value={record.title || ""} onChange={(e) => update("title", e.target.value)} /></Field><Field label="Provider"><Input value={record.provider || ""} onChange={(e) => update("provider", e.target.value)} /></Field><Field label="Due date"><DateInput value={record.dueDate || ""} onChange={(e) => update("dueDate", e.target.value)} /></Field><Field label="Status"><Select value={record.status || "Planned"} onChange={(e) => update("status", e.target.value)} >{["Planned", "In progress", "Completed", "Paused"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label={`Progress · ${record.progress || 0}%`}><input type="range" min="0" max="100" value={record.progress || 0} onChange={(e) => update("progress", Number(e.target.value))} className="w-full" /></Field><Field label="Certification"><Input value={record.certification || ""} onChange={(e) => update("certification", e.target.value)} /></Field><Field label="Notes" wide><Textarea value={record.notes || ""} onChange={(e) => update("notes", e.target.value)} /></Field></div>}

        {editor.resource === "documents" && <div className="grid gap-4 sm:grid-cols-2"><Field label="Document title" wide><Input value={record.title || ""} onChange={(e) => update("title", e.target.value)} /></Field><Field label="Category"><Select value={record.category || "Policy"} onChange={(e) => update("category", e.target.value)} >{["Policy", "Employment", "Compliance", "Performance", "Training", "Other"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Linked employee"><Select value={record.employeeId || ""} onChange={(e) => update("employeeId", e.target.value)} ><option value="">Company-wide</option>{employeeOptions.map((employee: any) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</Select></Field><Field label="Reference"><Input value={record.reference || ""} onChange={(e) => update("reference", e.target.value)} /></Field><Field label="Expiry / review date"><DateInput value={record.expiryDate || ""} onChange={(e) => update("expiryDate", e.target.value)} /></Field><Field label="Status"><Select value={record.status || "Active"} onChange={(e) => update("status", e.target.value)} >{["Draft", "Active", "Review due", "Expired", "Archived"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Notes" wide><Textarea value={record.notes || ""} onChange={(e) => update("notes", e.target.value)} /></Field><EvidenceUpload purpose="hr_document" employeeId={record.employeeId} value={record.assetId} onUploaded={(id: string) => update("assetId", id)} /></div>}

        {editor.resource === "announcements" && <div className="grid gap-4 sm:grid-cols-2"><Field label="Announcement title" wide><Input value={record.title || ""} onChange={(e) => update("title", e.target.value)} /></Field><Field label="Category"><Select value={record.category || "General"} onChange={(e) => update("category", e.target.value)} >{["General", "People", "Operations", "Policy", "Event", "Urgent"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Status"><Select value={record.status || "Published"} onChange={(e) => update("status", e.target.value)} ><option>Draft</option><option>Published</option><option>Archived</option></Select></Field><Field label="Publish date"><DateInput value={record.publishAt || ""} onChange={(e) => update("publishAt", e.target.value)} /></Field><Field label="Expiry date"><DateInput value={record.expiresAt || ""} onChange={(e) => update("expiresAt", e.target.value)} /></Field><label className="flex items-center gap-3 rounded-xl border bg-card p-3 text-xs font-medium text-foreground-soft"><input type="checkbox" checked={Boolean(record.pinned)} onChange={(e) => update("pinned", e.target.checked)} className="h-4 w-4" />Pin this announcement</label><Field label="Announcement" wide><Textarea value={record.body || ""} onChange={(e) => update("body", e.target.value)} className="min-h-40" /></Field></div>}

        {editor.resource === "events" && <div className="grid gap-4 sm:grid-cols-2"><Field label="Event title" wide><Input value={record.title || ""} onChange={(e) => update("title", e.target.value)} /></Field><Field label="Event type"><Select value={record.eventType || "Team event"} onChange={(e) => update("eventType", e.target.value)} >{["Team event", "Company meeting", "Training", "Celebration", "Deadline", "Other"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Status"><Select value={record.status || "Scheduled"} onChange={(e) => update("status", e.target.value)} ><option>Scheduled</option><option>Cancelled</option></Select></Field><Field label="Start date"><DateInput value={record.startDate || ""} onChange={(e) => update("startDate", e.target.value)} /></Field><Field label="End date"><DateInput value={record.endDate || ""} onChange={(e) => update("endDate", e.target.value)} /></Field><Field label="Location" wide><Input value={record.location || ""} onChange={(e) => update("location", e.target.value)} /></Field><Field label="Description" wide><Textarea value={record.description || ""} onChange={(e) => update("description", e.target.value)} className="min-h-32" /></Field></div>}

        <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background/95 pt-4 backdrop-blur"><Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button><Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save record"}</Button></div>
      </CardContent>
    </Card>
  </div>;
}

function EvidenceUpload({ purpose, employeeId, value, onUploaded }: { purpose: string; employeeId?: string; value?: string; onUploaded: (id: string, suggested?: any) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [read, setRead] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setRead("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      const result = await requestJson("/api/hr/files", { method: "POST", body: JSON.stringify({ purpose, employeeId, filename: file.name, dataUrl }) });
      onUploaded(result.id, result.suggested);
      // Said plainly, because a form that silently rewrites what someone typed
      // is worse than one that never helped. They can still edit every field.
      if (result.suggested?.total) setRead("Read from the receipt — check the amount and date before saving.");
      else if (purpose === "claim_receipt") setRead("Could not read this automatically. Enter the details yourself.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed."); }
    finally { setBusy(false); }
  }
  return <div className="sm:col-span-2 rounded-xl border border-dashed bg-card p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="flex-1"><div className="text-xs font-semibold">Supporting file</div><div className="mt-1 text-[10px] text-muted-foreground">PDF, JPG, PNG or WebP · maximum 2 MB</div>{value && <a href={`/api/hr/files/${value}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-accent">View uploaded file</a>}{read && <div className="mt-2 text-[11px] text-muted-foreground">{read}</div>}{error && <div className="mt-2 text-xs text-red-600">{error}</div>}</div><label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border bg-card px-4 text-xs font-semibold hover:bg-background">{busy ? (purpose === "claim_receipt" ? "Reading…" : "Uploading…") : value ? "Replace file" : "Choose file"}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={busy} onChange={(event) => upload(event.target.files?.[0])} /></label></div></div>;
}

function resourceLabel(resource: Resource) { return ({ employees: "team member", leave: "leave request", attendance: "attendance record", attendance_corrections: "attendance correction", goals: "goal", learning: "learning record", documents: "HR document", claims: "expense claim", payroll: "payroll record", lifecycle: "lifecycle case", announcements: "announcement", events: "team event" } as Record<Resource, string>)[resource]; }
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  const control = isValidElement<{ value?: unknown; onChange?: (event: any) => void }>(children) ? children : null;
  const value = typeof control?.props.value === "string" ? control.props.value : "";
  const canImprove = control !== null && isTextField(control.type) && typeof control.props.onChange === "function";
  return <div className={cn("block text-xs font-medium text-foreground-soft", wide && "sm:col-span-2")}><div className="flex min-h-8 items-center justify-between gap-2"><span>{label}</span>{canImprove && <AIWritingButton value={value} field={label} context="KretivOS HRMS record. Keep dates, people, leave details, goals, policy references and employment facts unchanged." onApply={(next) => control.props.onChange?.({ target: { value: next }, currentTarget: { value: next } })} />}</div><div className="mt-2">{children}</div></div>;
}
function Stat({ label, value, note }: any) { return <Card className="border-black/8 bg-white/90"><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{note}</div></CardContent></Card>; }
function Mini({ label, value }: any) { return <div className="rounded-xl bg-background p-3"><div className="text-[10px] text-muted-foreground">{label}</div><div className="mt-1 truncate text-xs font-medium">{value || "—"}</div></div>; }
function Status({ value }: { value: string }) { const lower = String(value).toLowerCase(); const tone = lower.includes("active") || lower.includes("approved") || lower.includes("completed") || lower === "present" ? "bg-emerald-50 text-emerald-700" : lower.includes("pending") || lower.includes("progress") || lower.includes("planned") || lower.includes("wfh") ? "bg-amber-50 text-amber-700" : lower.includes("reject") || lower.includes("absent") || lower.includes("risk") ? "bg-red-50 text-red-700" : "bg-muted text-foreground-soft"; return <span className={cn("inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium", tone)}>{value}</span>; }
function Empty({ icon: Icon, title, note, action }: any) { return <div className="rounded-2xl border border-dashed bg-white/50 p-10 text-center"><Icon className="mx-auto h-7 w-7 text-muted-foreground" /><div className="mt-3 font-semibold">{title}</div><p className="mt-1 text-xs text-muted-foreground">{note}</p><Button className="mt-4" onClick={action}><Plus className="h-4 w-4" />Create record</Button></div>; }

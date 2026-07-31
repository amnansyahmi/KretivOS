"use client";

import Link from "next/link";
import { isValidElement, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BookOpenCheck, BriefcaseBusiness, CalendarCheck, Check, ChevronRight,
  Clock3, GraduationCap, LayoutDashboard, Pencil, Plus, ReceiptText, RefreshCw,
  Search, Trash2, UserPlus, Users, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AIWritingButton } from "@/components/ai-writing-button";
import { DateInput } from "@/components/date-input";
import { HRPhotoAttendance } from "@/components/hr-photo-attendance";
import { HRPayslipSetup } from "@/components/hr-payslip-setup";
import { cn } from "@/lib/utils";

type Tab = "overview" | "people" | "leave" | "attendance" | "payslips" | "goals" | "learning";
type Resource = "employees" | "leave" | "attendance" | "goals" | "learning";
type Editor = { resource: Resource; record: any; isNew: boolean } | null;

type Snapshot = {
  employees: any[];
  leaveRequests: any[];
  attendance: any[];
  goals: any[];
  learning: any[];
  settings: {
    departments: string[];
    leaveTypes: string[];
    workModes: string[];
    attendance?: { timezone?: string; shiftStart?: string; graceMinutes?: number };
  };
  version: number;
  syncedAt: string;
};

const emptySnapshot: Snapshot = {
  employees: [], leaveRequests: [], attendance: [], goals: [], learning: [],
  settings: { departments: [], leaveTypes: [], workModes: [] }, version: 0, syncedAt: "",
};

const tabs: { id: Tab; label: string; icon: any }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "people", label: "People", icon: Users },
  { id: "leave", label: "Leave", icon: CalendarCheck },
  { id: "attendance", label: "Attendance", icon: Clock3 },
  { id: "payslips", label: "Payslips", icon: ReceiptText },
  { id: "goals", label: "Goals", icon: BriefcaseBusiness },
  { id: "learning", label: "Learning", icon: GraduationCap },
];

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

export default function HRPage() {
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  const [tab, setTab] = useState<Tab>("overview");
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

  function openCreate(resource: Resource) {
    const firstEmployee = data.employees[0]?.id || "";
    const common = { id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const defaults: Record<Resource, any> = {
      employees: {
        ...common, name: "", email: "", title: "", department: data.settings.departments[0] || "Leadership",
        employmentType: "Core Team", workMode: data.settings.workModes[0] || "Hybrid", location: "", startDate: today(),
        phone: "", emergencyContact: "", annualLeaveBalance: 14, medicalLeaveBalance: 14, skills: [], notes: "",
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
      goals: { ...common, employeeId: firstEmployee, title: "", period: "Q3 2026", dueDate: today(), progress: 0, status: "Not started", notes: "" },
      learning: { ...common, employeeId: firstEmployee, title: "", provider: "", status: "Planned", progress: 0, dueDate: today(), certification: "", notes: "" },
    };
    setEditor({ resource, record: defaults[resource], isNew: true });
  }

  function openEdit(resource: Resource, record: any) {
    setEditor({ resource, record: JSON.parse(JSON.stringify(record)), isNew: false });
  }

  async function saveEditor() {
    if (!editor || saving) return;
    if (editor.resource === "employees" && !String(editor.record.name || "").trim()) { setError("Employee name is required."); return; }
    if (editor.resource !== "employees" && !editor.record.employeeId) { setError("Select a team member."); return; }
    setSaving(true); setError("");
    try {
      const next = await requestJson("/api/hr", {
        method: "POST",
        body: JSON.stringify({ operation: editor.isNew ? "create" : "update", resource: editor.resource, id: editor.record.id, data: editor.record }),
      });
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

  const actionResource: Partial<Record<Tab, Resource>> = { people: "employees", leave: "leave", goals: "goals", learning: "learning" };

  return (
    <main className="min-h-screen bg-[#f5f2ea] pb-24 text-[#202820]">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f5f2ea]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1500px] items-center gap-3 px-4 md:min-h-24 md:px-8 md:py-5">
          <Button asChild variant="outline" size="icon" className="shrink-0 bg-white" aria-label="Back to KretivOS Home"><Link href="/"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div className="min-w-0 flex-1">
            <div className="hidden text-[10px] font-semibold uppercase tracking-[.2em] text-[#ba5c42] md:block">People operations</div>
            <h1 className="truncate text-lg font-semibold tracking-tight md:mt-1 md:text-3xl">HR & Team</h1>
            <p className="mt-1 hidden text-sm text-muted-foreground md:block">People directory, leave, photo attendance, protected payslips, goals and learning.</p>
          </div>
          <Button variant="outline" size="icon" className="bg-white" onClick={load} disabled={loading} aria-label="Refresh HR"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Button>
          {actionResource[tab] && <Button onClick={() => openCreate(actionResource[tab]!)}><Plus className="h-4 w-4" /><span className="hidden sm:inline">Add record</span></Button>}
          {tab === "overview" && <Button onClick={() => { setTab("people"); openCreate("employees"); }}><UserPlus className="h-4 w-4" /><span className="hidden sm:inline">Add person</span></Button>}
        </div>
        <div className="mx-auto max-w-[1500px] overflow-x-auto px-3 pb-2 md:px-8">
          <div className="flex min-w-max gap-1 rounded-xl border bg-white/75 p-1">
            {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setTab(id); setQuery(""); }} className={cn("flex h-10 items-center gap-2 rounded-lg px-3 text-xs font-medium transition sm:px-4", tab === id ? "bg-[#202c25] text-white" : "text-[#667067] hover:bg-[#f1eee6]")}><Icon className="h-4 w-4" />{label}</button>)}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-8 md:py-7">
        {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}
        {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}

        {loading && !data.employees.length ? <div className="rounded-2xl border bg-white p-12 text-center text-sm text-muted-foreground">Loading HR workspace…</div> : (
          <>
            {tab !== "overview" && tab !== "payslips" && <div className="mb-4 flex h-11 items-center gap-2 rounded-xl border bg-white px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={`Search ${tabs.find((item) => item.id === tab)?.label.toLowerCase()}...`} /></div>}

            {tab === "overview" && <Overview data={data} stats={stats} employeeName={employeeName} setTab={setTab} />}

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
                    <div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => openEdit("employees", employee)}><Pencil className="h-4 w-4" />Edit</Button><Button variant="outline" size="icon" onClick={() => deleteRecord("employees", employee.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div>
                  </CardContent></Card>;
                })}
              </div>
            )}

            {tab === "leave" && (
              <div className="space-y-3">
                {data.leaveRequests.filter((item) => matches(employeeName(item.employeeId), item.type, item.status, item.reason)).map((item) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f1ece2]"><CalendarCheck className="h-5 w-5 text-[#ba5c42]" /></div>
                  <div className="min-w-0 flex-1"><div className="font-semibold">{employeeName(item.employeeId)}</div><div className="mt-1 text-xs text-muted-foreground">{item.type} · {formatDate(item.startDate)} – {formatDate(item.endDate)} · {item.days} working day{item.days === 1 ? "" : "s"}</div><p className="mt-2 text-xs leading-5 text-[#667067]">{item.reason || "No reason provided."}</p></div>
                  <Status value={item.status} />
                  <div className="flex flex-wrap gap-2">{item.status === "Pending" && <><Button size="sm" variant="outline" onClick={() => leaveAction(item.id, "reject")}>Reject</Button><Button size="sm" onClick={() => leaveAction(item.id, "approve")}><Check className="h-3.5 w-3.5" />Approve</Button></>}<Button variant="outline" size="icon" onClick={() => openEdit("leave", item)}><Pencil className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => deleteRecord("leave", item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div>
                </CardContent></Card>)}
                {!data.leaveRequests.length && <Empty icon={CalendarCheck} title="No leave requests" note="Create the first leave request for a team member." action={() => openCreate("leave")} />}
              </div>
            )}

            {tab === "attendance" && <HRPhotoAttendance employees={data.employees} attendance={data.attendance} query={query} onRefresh={load} onNotice={setNotice} onError={setError} />}
            {tab === "payslips" && <HRPayslipSetup employees={data.employees} />}

            {tab === "goals" && <div className="grid gap-4 md:grid-cols-2">{data.goals.filter((item) => matches(employeeName(item.employeeId), item.title, item.period, item.status)).map((item) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[.16em] text-[#ba5c42]">{item.period}</div><h2 className="mt-2 font-semibold">{item.title}</h2><p className="mt-1 text-xs text-muted-foreground">{employeeName(item.employeeId)} · Due {formatDate(item.dueDate)}</p></div><Status value={item.status} /></div><div className="mt-5"><div className="flex justify-between text-xs"><span>Progress</span><span className="font-semibold">{item.progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-[#ba5c42]" style={{ width: `${item.progress}%` }} /></div></div><p className="mt-4 min-h-10 text-xs leading-5 text-muted-foreground">{item.notes || "No notes."}</p><div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => openEdit("goals", item)}><Pencil className="h-4 w-4" />Update</Button><Button variant="outline" size="icon" onClick={() => deleteRecord("goals", item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>)}</div>}

            {tab === "learning" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.learning.filter((item) => matches(employeeName(item.employeeId), item.title, item.provider, item.status)).map((item) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f1ece2]"><GraduationCap className="h-5 w-5 text-[#ba5c42]" /></div><Status value={item.status} /></div><h2 className="mt-4 font-semibold">{item.title}</h2><p className="mt-1 text-xs text-muted-foreground">{item.provider || "Provider not set"}</p><div className="mt-4 text-xs">{employeeName(item.employeeId)} · {item.progress}%</div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-[#202c25]" style={{ width: `${item.progress}%` }} /></div><div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => openEdit("learning", item)}><Pencil className="h-4 w-4" />Edit</Button><Button variant="outline" size="icon" onClick={() => deleteRecord("learning", item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>)}</div>}
          </>
        )}
      </div>

      {editor && <EditorDialog editor={editor} setEditor={setEditor} data={data} saving={saving} onSave={saveEditor} />}
    </main>
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

function EditorDialog({ editor, setEditor, data, saving, onSave }: any) {
  const record = editor.record;
  const update = (key: string, value: any) => setEditor({ ...editor, record: { ...record, [key]: value } });
  const employeeOptions = data.employees;
  return <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"><Card className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-b-none bg-[#f7f4ed] shadow-2xl sm:rounded-2xl"><div className="sticky top-0 z-10 flex items-start justify-between border-b bg-[#f7f4ed]/95 p-4 backdrop-blur sm:p-6"><div><h2 className="text-xl font-semibold">{editor.isNew ? "Create" : "Edit"} {resourceLabel(editor.resource)}</h2><p className="mt-1 text-xs text-muted-foreground">Changes are saved to the shared HR workspace.</p></div><Button variant="ghost" size="icon" onClick={() => setEditor(null)}><X className="h-4 w-4" /></Button></div><CardContent className="space-y-4 p-4 sm:p-6">
    {editor.resource === "employees" && <>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Name"><input value={record.name} onChange={(e) => update("name", e.target.value)} className="field" /></Field><Field label="Work email"><input type="email" value={record.email} onChange={(e) => update("email", e.target.value)} className="field" placeholder="Optional until login is enabled" /></Field><Field label="Job title"><input value={record.title} onChange={(e) => update("title", e.target.value)} className="field" /></Field><Field label="Department"><select value={record.department} onChange={(e) => update("department", e.target.value)} className="field">{data.settings.departments.map((item: string) => <option key={item}>{item}</option>)}</select></Field><Field label="Employment type"><select value={record.employmentType} onChange={(e) => update("employmentType", e.target.value)} className="field">{["Core Team", "Full-time", "Part-time", "Contract", "Intern", "Advisor"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Work mode"><select value={record.workMode} onChange={(e) => update("workMode", e.target.value)} className="field">{data.settings.workModes.map((item: string) => <option key={item}>{item}</option>)}</select></Field><Field label="Location"><input value={record.location} onChange={(e) => update("location", e.target.value)} className="field" /></Field><Field label="Start date"><DateInput value={record.startDate} onChange={(e) => update("startDate", e.target.value)} /></Field><Field label="Status"><select value={record.status} onChange={(e) => update("status", e.target.value)} className="field"><option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On leave</option><option value="alumni">Alumni</option></select></Field><Field label="Phone"><input value={record.phone} onChange={(e) => update("phone", e.target.value)} className="field" /></Field><Field label="Annual leave balance"><input type="number" value={record.annualLeaveBalance} onChange={(e) => update("annualLeaveBalance", e.target.value)} className="field" /></Field><Field label="Medical leave balance"><input type="number" value={record.medicalLeaveBalance} onChange={(e) => update("medicalLeaveBalance", e.target.value)} className="field" /></Field><Field label="Skills" wide><input value={(record.skills || []).join(", ")} onChange={(e) => update("skills", e.target.value.split(",").map((item) => item.trim()).filter(Boolean))} className="field" placeholder="Marketing, React, Finance" /></Field><Field label="Notes" wide><textarea value={record.notes} onChange={(e) => update("notes", e.target.value)} className="textarea" /></Field></div>
      <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2"><BookOpenCheck className="h-4 w-4 text-[#ba5c42]" /><h3 className="text-sm font-semibold">Onboarding checklist</h3></div><div className="mt-3 space-y-2">{(record.onboarding || []).map((item: any, index: number) => <label key={item.id} className="flex items-center gap-3 rounded-xl bg-[#f7f4ed] p-3 text-sm"><input type="checkbox" checked={item.done} onChange={(e) => update("onboarding", record.onboarding.map((row: any, rowIndex: number) => rowIndex === index ? { ...row, done: e.target.checked } : row))} className="h-4 w-4" /><span>{item.label}</span></label>)}</div></div>
    </>}
    {editor.resource !== "employees" && <div className="grid gap-4 sm:grid-cols-2"><Field label="Team member" wide><select value={record.employeeId} onChange={(e) => update("employeeId", e.target.value)} className="field">{employeeOptions.map((employee: any) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></Field>{editor.resource === "leave" && <><Field label="Leave type"><select value={record.type} onChange={(e) => update("type", e.target.value)} className="field">{data.settings.leaveTypes.map((item: string) => <option key={item}>{item}</option>)}</select></Field><div /><Field label="Start date"><DateInput value={record.startDate} onChange={(e) => update("startDate", e.target.value)} /></Field><Field label="End date"><DateInput value={record.endDate} onChange={(e) => update("endDate", e.target.value)} /></Field><Field label="Reason" wide><textarea value={record.reason} onChange={(e) => update("reason", e.target.value)} className="textarea" /></Field></>}{editor.resource === "attendance" && <><Field label="Date"><DateInput value={record.date} onChange={(e) => update("date", e.target.value)} /></Field><Field label="Status"><select value={record.status} onChange={(e) => update("status", e.target.value)} className="field">{["Present", "WFH", "Leave", "Absent", "Off", "Client Site"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Work mode"><select value={record.workMode || "Office"} onChange={(e) => update("workMode", e.target.value)} className="field"><option>Office</option><option>Remote</option><option>Client Site</option></select></Field><div /><Field label="Check in"><input type="time" value={record.checkIn} onChange={(e) => update("checkIn", e.target.value)} className="field" /></Field><Field label="Check out"><input type="time" value={record.checkOut} onChange={(e) => update("checkOut", e.target.value)} className="field" /></Field><Field label="Note" wide><textarea value={record.note} onChange={(e) => update("note", e.target.value)} className="textarea" /></Field></>}{editor.resource === "goals" && <><Field label="Goal title" wide><input value={record.title} onChange={(e) => update("title", e.target.value)} className="field" /></Field><Field label="Period"><input value={record.period} onChange={(e) => update("period", e.target.value)} className="field" /></Field><Field label="Due date"><DateInput value={record.dueDate} onChange={(e) => update("dueDate", e.target.value)} /></Field><Field label={`Progress · ${record.progress}%`} wide><input type="range" min="0" max="100" value={record.progress} onChange={(e) => update("progress", Number(e.target.value))} className="w-full" /></Field><Field label="Status"><select value={record.status} onChange={(e) => update("status", e.target.value)} className="field">{["Not started", "In progress", "At risk", "Completed", "Cancelled"].map((item) => <option key={item}>{item}</option>)}</select></Field><div /><Field label="Notes" wide><textarea value={record.notes} onChange={(e) => update("notes", e.target.value)} className="textarea" /></Field></>}{editor.resource === "learning" && <><Field label="Course / learning title" wide><input value={record.title} onChange={(e) => update("title", e.target.value)} className="field" /></Field><Field label="Provider"><input value={record.provider} onChange={(e) => update("provider", e.target.value)} className="field" /></Field><Field label="Due date"><DateInput value={record.dueDate} onChange={(e) => update("dueDate", e.target.value)} /></Field><Field label="Status"><select value={record.status} onChange={(e) => update("status", e.target.value)} className="field">{["Planned", "In progress", "Completed", "Paused"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label={`Progress · ${record.progress}%`}><input type="range" min="0" max="100" value={record.progress} onChange={(e) => update("progress", Number(e.target.value))} className="w-full" /></Field><Field label="Certification"><input value={record.certification} onChange={(e) => update("certification", e.target.value)} className="field" /></Field><Field label="Notes" wide><textarea value={record.notes} onChange={(e) => update("notes", e.target.value)} className="textarea" /></Field></>}</div>}
    <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-[#f7f4ed]/95 pt-4 backdrop-blur"><Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button><Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save record"}</Button></div>
  </CardContent><style jsx>{`.field{height:2.75rem;width:100%;border-radius:.75rem;border:1px solid #ddd8cf;background:white;padding:0 .8rem;font-size:.875rem;outline:none}.field:focus,.textarea:focus{border-color:#ba5c42;box-shadow:0 0 0 4px rgba(186,92,66,.1)}.textarea{min-height:7rem;width:100%;resize:vertical;border-radius:.75rem;border:1px solid #ddd8cf;background:white;padding:.8rem;font-size:.875rem;line-height:1.55;outline:none}`}</style></Card></div>;
}

function resourceLabel(resource: Resource) { return ({ employees: "team member", leave: "leave request", attendance: "attendance record", goals: "goal", learning: "learning record" } as Record<Resource, string>)[resource]; }
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  const control = isValidElement<{ value?: unknown; onChange?: (event: any) => void }>(children) ? children : null;
  const value = typeof control?.props.value === "string" ? control.props.value : "";
  const canImprove = control?.type === "textarea" && typeof control.props.onChange === "function";
  return <div className={cn("block text-xs font-medium text-[#4e5a52]", wide && "sm:col-span-2")}><div className="flex min-h-8 items-center justify-between gap-2"><span>{label}</span>{canImprove && <AIWritingButton value={value} field={label} context="KretivOS HR record. Keep dates, people, leave details, goals and employment facts unchanged." onApply={(next) => control.props.onChange?.({ target: { value: next }, currentTarget: { value: next } })} />}</div><div className="mt-2">{children}</div></div>;
}
function Stat({ label, value, note }: any) { return <Card className="border-black/8 bg-white/90"><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{note}</div></CardContent></Card>; }
function Mini({ label, value }: any) { return <div className="rounded-xl bg-[#f7f4ed] p-3"><div className="text-[10px] text-muted-foreground">{label}</div><div className="mt-1 truncate text-xs font-medium">{value || "—"}</div></div>; }
function Status({ value }: { value: string }) { const lower = String(value).toLowerCase(); const tone = lower.includes("active") || lower.includes("approved") || lower.includes("completed") || lower === "present" ? "bg-emerald-50 text-emerald-700" : lower.includes("pending") || lower.includes("progress") || lower.includes("planned") || lower.includes("wfh") ? "bg-amber-50 text-amber-700" : lower.includes("reject") || lower.includes("absent") || lower.includes("risk") ? "bg-red-50 text-red-700" : "bg-[#eeeae0] text-[#5a605a]"; return <span className={cn("inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium", tone)}>{value}</span>; }
function Empty({ icon: Icon, title, note, action }: any) { return <div className="rounded-2xl border border-dashed bg-white/50 p-10 text-center"><Icon className="mx-auto h-7 w-7 text-muted-foreground" /><div className="mt-3 font-semibold">{title}</div><p className="mt-1 text-xs text-muted-foreground">{note}</p><Button className="mt-4" onClick={action}><Plus className="h-4 w-4" />Create record</Button></div>; }

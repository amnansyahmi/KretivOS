"use client";

import { CalendarCheck, Check, Clock3, FileText, HandCoins, Pencil, Plus, ReceiptText, ShieldCheck, Trash2, UserCheck, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const money = (value: unknown) => `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value?: string) => value ? new Date(`${value.length === 10 ? `${value}T00:00:00+08:00` : value}`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" }) : "—";
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export function HRSelfService({ session, employee, leave, attendance, claims, payroll, documents, onEdit, onCreate, onNavigate, onCompleteStep }: any) {
  const latestAttendance = [...attendance].sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))[0];
  const latestPayroll = [...payroll].sort((a: any, b: any) => String(b.period).localeCompare(String(a.period)))[0];
  return <div className="space-y-5">
    <Card className="overflow-hidden border-0 bg-foreground text-white"><CardContent className="p-5 sm:p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-card text-lg font-semibold text-foreground">{initials(employee?.name || session.name)}</div><div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-accent-muted">Employee self-service</div><h2 className="mt-2 text-2xl font-semibold">{employee?.name || session.name}</h2><p className="mt-1 text-sm text-white/50">{employee?.title || "Team member"} · {employee?.department || "Kretivco"}</p></div><Button className="bg-card text-foreground hover:bg-white/90" onClick={() => employee && onEdit(employee)}><Pencil className="h-4 w-4" />Update my profile</Button></div><div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4"><DarkMini label="Annual leave" value={`${employee?.annualLeaveBalance ?? 0} days`} /><DarkMini label="Medical leave" value={`${employee?.medicalLeaveBalance ?? 0} days`} /><DarkMini label="Latest clock-in" value={latestAttendance?.checkIn || "—"} /><DarkMini label="Latest payslip" value={latestPayroll?.period || "Not issued"} /></div></CardContent></Card>

    {employee && <MyOnboarding employee={employee} documents={documents || []} onEdit={onEdit} onCompleteStep={onCompleteStep} />}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Quick icon={UserCheck} title="My details" note={employee?.bankAccountNumber ? "Profile and payroll details" : "Bank account not recorded"} onClick={() => onNavigate("profile")} /><Quick icon={CalendarCheck} title="Apply leave" note={`${leave.filter((item: any) => item.status === "Pending").length} pending`} onClick={() => onCreate("leave")} /><Quick icon={Clock3} title="Attendance" note={latestAttendance ? `${date(latestAttendance.date)} · ${latestAttendance.status}` : "No record yet"} onClick={() => onNavigate("attendance")} /><Quick icon={HandCoins} title="Submit claim" note={`${claims.filter((item: any) => item.status === "Pending").length} awaiting review`} onClick={() => onCreate("claims")} /><Quick icon={ReceiptText} title="My payslips" note={latestPayroll ? `${latestPayroll.status} · ${money(latestPayroll.netPay)}` : "No payroll record"} onClick={() => onNavigate("payslips")} /></div>
    <div className="grid gap-5 xl:grid-cols-2"><Summary title="Recent leave" empty="No leave request yet." rows={leave.slice(0, 4).map((item: any) => ({ title: item.type, meta: `${date(item.startDate)} – ${date(item.endDate)}`, value: item.status }))} /><Summary title="Recent claims" empty="No claims submitted yet." rows={claims.slice(0, 4).map((item: any) => ({ title: item.category, meta: item.description, value: `${money(item.amount)} · ${item.status}` }))} /></div>
  </div>;
}

/**
 * The employee's own record, shown rather than hidden behind a button.
 *
 * "Update my profile" opened a form; nothing on the screen said what was
 * currently on file. So the commonest question — is my bank account the right
 * one, did they ever get my NRIC — could only be answered by opening an editor
 * and reading it out of the inputs.
 *
 * What is missing is called out rather than left blank, because the blanks here
 * are the ones that hold up a payslip.
 */
export function HRMyDetails({ employee, role, onEdit }: any) {
  const groups = !employee ? [] : [
    {
      title: "About me", editable: true, rows: [
        ["Full name", employee.name], ["Job title", employee.title], ["Department", employee.department],
        ["Work email", employee.email || employee.internalEmail], ["Phone", employee.phone],
        ["Emergency contact", employee.emergencyContact], ["Location", employee.location],
      ],
    },
    {
      title: "Payroll and statutory", editable: true, rows: [
        ["Date of birth", employee.dateOfBirth ? date(employee.dateOfBirth) : ""],
        ["NRIC or passport", employee.identificationNumber],
        ["Income tax number", employee.incomeTaxNumber], ["EPF number", employee.epfNumber],
        ["SOCSO number", employee.socsoNumber], ["Marital status", employee.maritalStatus],
        ["Bank", employee.bankName], ["Bank account", employee.bankAccountNumber],
      ],
    },
    {
      // Set by HR. Shown so the figures a payslip is built from are not a
      // mystery, and marked so nobody hunts for an edit button that is not there.
      title: "Set by HR", editable: false, rows: [
        ["Employee number", employee.employeeNumber], ["Started", employee.startDate ? date(employee.startDate) : ""],
        ["Employment type", employee.employmentType], ["Work mode", employee.workMode],
        ["Status", employee.status], ["Confirmed on", employee.confirmationDate ? date(employee.confirmationDate) : ""],
      ],
    },
  ];

  if (!employee) return <div className="rounded-2xl border border-dashed bg-white/50 p-10 text-center text-sm text-muted-foreground">No employee record is linked to this session yet.</div>;

  const outstanding = groups
    .filter((group) => group.editable)
    .flatMap((group) => group.rows.filter(([, value]) => !value).map(([label]) => label));

  return <Card className="border-black/8 bg-white/90"><CardContent className="p-4 sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="font-semibold">My details</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">What the company has on file for you. Payroll works from these, so keep the statutory and bank details current.</p>
      </div>
      <Button variant="outline" size="sm" className="shrink-0" onClick={() => onEdit(employee)}><Pencil className="h-3.5 w-3.5" />Edit my details</Button>
    </div>

    {outstanding.length > 0 && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
      {outstanding.length} field{outstanding.length === 1 ? " is" : "s are"} still missing: {outstanding.slice(0, 4).join(", ")}{outstanding.length > 4 ? `, and ${outstanding.length - 4} more` : ""}. Payroll needs these before a payslip can be issued.
    </p>}

    <div className="mt-5 grid gap-5 lg:grid-cols-3">{groups.map((group) => <div key={group.title}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{group.title}</span>
        {!group.editable && <span className="rounded-full bg-black/5 px-2 py-0.5 text-[9px] font-medium text-muted-foreground">HR sets this</span>}
      </div>
      <dl className="mt-3 space-y-2">{group.rows.map(([label, value]) => <div key={label} className="flex items-baseline justify-between gap-3 border-b border-black/5 pb-2 last:border-0">
        <dt className="text-[11px] text-muted-foreground">{label}</dt>
        <dd className={cn("text-right text-xs font-medium", !value && "text-amber-700")}>{value || "Not recorded"}</dd>
      </div>)}</dl>
    </div>)}</div>
  </CardContent></Card>;
}

/**
 * The joiner's own checklist, on the screen they already land on.
 *
 * Split by who is being waited on. Someone chasing their first payslip needs to
 * know that it is their bank account holding it up and not "onboarding" in the
 * abstract, and the steps HR still owes are shown rather than hidden so the
 * list does not read as a personal to-do that never finishes.
 */
function MyOnboarding({ employee, documents, onEdit, onCompleteStep }: any) {
  const steps = employee.onboarding || [];
  const summary = employee.onboardingSummary || { percent: 0, done: 0, total: steps.length, complete: false };
  if (summary.complete || !steps.length) return null;

  const mine = steps.filter((step: any) => step.owner === "employee" && !step.done);
  const theirs = steps.filter((step: any) => step.owner !== "employee" && !step.done);
  const documentFor = (id?: string) => documents.find((item: any) => item.id === id);

  return <Card className="border-accent/25 bg-white/90"><CardContent className="p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">Finish your onboarding</h2>
        <p className="mt-1 text-xs text-muted-foreground">{summary.done} of {summary.total} done{mine.length ? ` · ${mine.length} waiting on you` : " · nothing waiting on you"}</p>
      </div>
      <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold text-white">{summary.percent}%</span>
    </div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-accent" style={{ width: `${summary.percent}%` }} /></div>

    <div className="mt-5 space-y-2">
      {mine.map((step: any) => {
        const document = documentFor(step.documentId);
        return <div key={step.id} className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{step.label}</div>
              {step.hint && <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.hint}</p>}
              {step.missing?.length > 0 && <p className="mt-2 text-xs leading-5 text-amber-800">Still needed: {step.missing.join(", ")}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {document?.assetId && <Button size="sm" variant="outline" asChild><a href={`/api/hr/files/${document.assetId}`} target="_blank" rel="noreferrer"><FileText className="h-3.5 w-3.5" />Read</a></Button>}
              {step.kind === "profile"
                ? <Button size="sm" onClick={() => onEdit(employee)}><Pencil className="h-3.5 w-3.5" />Fill in</Button>
                : <Button size="sm" onClick={() => onCompleteStep(step.id)}><Check className="h-3.5 w-3.5" />{step.kind === "policy" ? "I have read this" : "Mark done"}</Button>}
            </div>
          </div>
        </div>;
      })}
      {!mine.length && <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Your part is done.</div>}

      {theirs.length > 0 && <div className="rounded-xl bg-background p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Waiting on HR</div>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{theirs.map((step: any) => <li key={step.id}>{step.label}</li>)}</ul>
      </div>}
    </div>
  </CardContent></Card>;
}

export function HRClaims({ claims, employeeName, canReview, canPay, onCreate, onEdit, onDelete, onAction }: any) {
  return <div className="space-y-3">{claims.map((item: any) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted"><HandCoins className="h-5 w-5 text-accent" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{item.category}</h2><Badge value={item.status} /><Badge value={item.financeStatus || "Unpaid"} /></div><p className="mt-1 text-xs text-muted-foreground">{employeeName(item.employeeId)} · {date(item.claimDate)} · {money(item.amount)}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p>{item.receiptAssetId && <a href={`/api/hr/files/${item.receiptAssetId}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent"><FileText className="h-3.5 w-3.5" />View receipt</a>}</div><div className="flex flex-wrap gap-2">{canReview && item.status === "Pending" && <><Button size="sm" variant="outline" onClick={() => onAction(item.id, "reject")}>Reject</Button><Button size="sm" onClick={() => onAction(item.id, "approve")}><Check className="h-3.5 w-3.5" />Approve</Button></>}{canPay && item.status === "Approved" && item.financeStatus !== "Paid" && <Button size="sm" onClick={() => onAction(item.id, "mark_paid")}><WalletCards className="h-3.5 w-3.5" />Mark paid</Button>}{["Pending", "Rejected"].includes(item.status) && <Button variant="outline" size="icon" onClick={() => onEdit(item)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>}<Button variant="outline" size="icon" onClick={() => onDelete(item.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>)}{!claims.length && <Empty icon={HandCoins} title="No expense claims" note="Submit the first reimbursement or expense claim." onClick={onCreate} />}</div>;
}

export function HRLifecycle({ records, employeeName, onCreate, onEdit, onDelete }: any) {
  return <div className="grid gap-4 xl:grid-cols-2">{records.map((item: any) => { const tasks = item.tasks || []; const done = tasks.filter((task: any) => task.done).length; const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0; return <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground text-white"><UserCheck className="h-4 w-4" /></div><Badge value={item.status} /></div><div className="mt-4 text-[10px] font-semibold uppercase tracking-[.15em] text-accent">{item.type}</div><h2 className="mt-2 font-semibold">{item.title}</h2><p className="mt-1 text-xs text-muted-foreground">{employeeName(item.employeeId)} · Due {date(item.dueDate)}</p><div className="mt-4 flex justify-between text-xs"><span>Checklist progress</span><span className="font-semibold">{done}/{tasks.length}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} /></div><div className="mt-4 space-y-2">{tasks.slice(0, 4).map((task: any) => <div key={task.id} className="flex items-center gap-2 text-xs"><span className={cn("flex h-4 w-4 items-center justify-center rounded border", task.done && "border-foreground bg-foreground text-white")}>{task.done && <Check className="h-3 w-3" />}</span><span className={cn(task.done && "text-muted-foreground line-through")}>{task.label}</span></div>)}</div><div className="mt-5 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => onEdit(item)}><Pencil className="h-4 w-4" />Update lifecycle</Button><Button variant="outline" size="icon" onClick={() => onDelete(item.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button></div></CardContent></Card>; })}{!records.length && <Empty icon={UserCheck} title="No lifecycle cases" note="Create a probation, confirmation, transfer or offboarding case." onClick={onCreate} />}</div>;
}

export function HRPayroll({ records, employeeName, canManage, onCreate, onEdit, onAction }: any) {
  /*
   * The banner told whoever was reading it to go and verify EPF and SOCSO
   * against the official portals. That is an instruction to HR and Finance;
   * shown to the person being paid it reads as a warning that their own payslip
   * might be wrong and that fixing it is somehow their job.
   */
  return <div className="space-y-4">{canManage
    ? <Card className="border-amber-200 bg-amber-50/80"><CardContent className="flex items-start gap-3 p-4"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><p className="text-xs leading-5 text-amber-900">Statutory amounts are versioned and editable. HR/Finance must verify EPF, SOCSO, EIS and PCB against the official portals before closing a payroll period.</p></CardContent></Card>
    : <Card className="border-black/8 bg-white/90"><CardContent className="flex items-start gap-3 p-4"><ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><p className="text-xs leading-5 text-muted-foreground">Your issued payslips. A period appears here once payroll has been closed for it. If something looks wrong, raise it with HR rather than changing it here.</p></CardContent></Card>}{records.map((item: any) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground text-white"><ReceiptText className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{employeeName(item.employeeId)}</h2><Badge value={item.status} /></div><p className="mt-1 text-xs text-muted-foreground">Payroll period {item.period}</p></div><div className="grid grid-cols-3 gap-2 lg:w-[420px]"><Mini label="Gross" value={money(item.grossPay)} /><Mini label="Deductions" value={money(item.totalDeductions)} /><Mini label="Net pay" value={money(item.netPay)} /></div><div className="flex flex-wrap gap-2">{canManage && <Button variant="outline" size="icon" onClick={() => onEdit(item)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>}{canManage && item.status === "Draft" && <Button size="sm" onClick={() => onAction(item.id, "close")}>Close</Button>}{canManage && item.status === "Closed" && <Button size="sm" onClick={() => onAction(item.id, "mark_paid")}>Mark paid</Button>}{canManage && ["Closed", "Paid"].includes(item.status) && <Button variant="outline" size="sm" onClick={() => onAction(item.id, "reopen")}>Reopen</Button>}{/* A real payslip on its own page, rather than printing this screen. */}<Button variant="outline" size="sm" asChild><a href={`/hr/payslip/${item.id}?back=${encodeURIComponent("/hr?section=payslips")}`}><FileText className="h-3.5 w-3.5" />Payslip</a></Button></div></div></CardContent></Card>)}{!records.length && <Empty icon={ReceiptText} title="No payroll records" note={canManage ? "Create the first payroll record." : "Your payslip has not been issued yet."} onClick={canManage ? onCreate : undefined} />}</div>;
}

export function HRAttendanceCorrections({ records, employeeName, canReview, onCreate, onEdit, onDelete, onAction }: any) {
  return <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Attendance corrections</h2><p className="mt-1 text-xs text-muted-foreground">Every approved correction keeps its requester, reviewer and audit reference.</p></div><Button size="sm" onClick={onCreate}><Plus className="h-4 w-4" />Request correction</Button></div><div className="mt-4 space-y-2">{records.map((item: any) => <div key={item.id} className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{employeeName(item.employeeId)}</span><Badge value={item.status} /></div><p className="mt-1 text-xs text-muted-foreground">{date(item.date)} · requested {item.requestedCheckIn || "—"} – {item.requestedCheckOut || "—"}</p><p className="mt-1 text-xs">{item.reason}</p></div><div className="flex gap-2">{canReview && item.status === "Pending" && <><Button size="sm" variant="outline" onClick={() => onAction(item.id, "reject")}><X className="h-3.5 w-3.5" />Reject</Button><Button size="sm" onClick={() => onAction(item.id, "approve")}><Check className="h-3.5 w-3.5" />Approve</Button></>}{item.status === "Pending" && <Button size="icon" variant="outline" onClick={() => onEdit(item)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>}<Button size="icon" variant="outline" onClick={() => onDelete(item.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button></div></div>)}{!records.length && <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">No correction requests.</div>}</div></CardContent></Card>;
}

function Quick({ icon: Icon, title, note, onClick }: any) { return <button onClick={onClick} className="rounded-2xl border border-black/8 bg-white/90 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><Icon className="h-5 w-5 text-accent" /><div className="mt-4 text-sm font-semibold">{title}</div><div className="mt-1 text-[10px] text-muted-foreground">{note}</div></button>; }
function DarkMini({ label, value }: any) { return <div className="rounded-xl bg-white/7 p-3"><div className="text-[9px] text-white/40">{label}</div><div className="mt-1 truncate text-xs font-semibold">{value}</div></div>; }
function Mini({ label, value }: any) { return <div className="rounded-xl bg-background p-3"><div className="text-[9px] text-muted-foreground">{label}</div><div className="mt-1 truncate text-xs font-semibold">{value}</div></div>; }
function Summary({ title, rows, empty }: any) { return <Card className="border-black/8 bg-white/90"><CardContent className="p-5"><h2 className="font-semibold">{title}</h2><div className="mt-4 space-y-2">{rows.map((row: any, index: number) => <div key={`${row.title}-${index}`} className="flex items-center gap-3 rounded-xl bg-background p-3"><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{row.title}</div><div className="mt-1 truncate text-[10px] text-muted-foreground">{row.meta}</div></div><div className="text-[10px] font-medium">{row.value}</div></div>)}{!rows.length && <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">{empty}</div>}</div></CardContent></Card>; }
function Badge({ value }: { value: string }) { return <StatusBadge value={value} />; }
function Empty({ icon: Icon, title, note, onClick }: any) { return <div className="rounded-2xl border border-dashed bg-white/50 p-10 text-center"><Icon className="mx-auto h-7 w-7 text-muted-foreground" /><div className="mt-3 font-semibold">{title}</div><p className="mt-1 text-xs text-muted-foreground">{note}</p>{onClick && <Button className="mt-4" onClick={onClick}><Plus className="h-4 w-4" />Create record</Button>}</div>; }

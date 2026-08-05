"use client";

import { useMemo, useState } from "react";
import { Check, Download, FileSpreadsheet, Pencil, Plus, Printer, ReceiptText, ShieldCheck, Trash2, WalletCards, X } from "lucide-react";
import { AIWritingButton } from "@/components/ai-writing-button";
import { HRMSAIInsight } from "@/components/hrms-ai-insight";
import { HRPayroll } from "@/components/hrms-extended-sections";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateInput } from "@/components/date-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/badge";
import { eaAvailableYears, eaStatementsForYear, eaYearSummary, type EAStatement } from "@/lib/ea-form";
import { buildExport, EXPORT_LABELS, EXPORTABLE_STATUSES, toCsv, type ExportKind } from "@/lib/statutory-exports";
import { cn } from "@/lib/utils";

type View = "runs" | "monthly" | "yearly" | "vouchers";
const money = (value: unknown) => `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function HRMSPayrollWorkbench({ records, vouchers, employees, employer, employeeName, canManage, onCreatePayroll, onEditPayroll, onPayrollAction, onCreateVoucher, onUpdateVoucher, onDeleteVoucher, onVoucherAction }: any) {
  const [view, setView] = useState<View>("runs"); const tabs: { id: View; label: string }[] = canManage ? [{ id: "runs", label: "Payroll runs" }, { id: "monthly", label: "Monthly submissions" }, { id: "yearly", label: "Yearly forms" }, { id: "vouchers", label: "Payment vouchers" }] : [{ id: "runs", label: "My payslips" }];
  return <div className="space-y-4">{canManage && <div className="overflow-x-auto rounded-2xl border bg-card p-1.5 shadow-sm"><div className="flex min-w-max gap-1">{tabs.map((item) => <button key={item.id} onClick={() => setView(item.id)} className={cn("rounded-xl px-4 py-2.5 text-xs font-semibold sm:text-sm", view === item.id ? "bg-foreground text-white" : "text-muted-foreground")}>{item.label}</button>)}</div></div>}{view === "runs" && <><HRPayroll records={records} employeeName={employeeName} canManage={canManage} onCreate={onCreatePayroll} onEdit={onEditPayroll} onAction={onPayrollAction} />{canManage && <PayrollAI records={records} />}</>}{view === "monthly" && <MonthlySubmissions records={records} employees={employees} employer={employer} />}{view === "yearly" && <Yearly records={records} employees={employees} employer={employer} />}{view === "vouchers" && <Vouchers vouchers={vouchers} employees={employees} onCreate={onCreateVoucher} onUpdate={onUpdateVoucher} onDelete={onDeleteVoucher} onAction={onVoucherAction} />}</div>;
}

/**
 * The four files that go out every month.
 *
 * Shown together because they are one task done four times, and because their
 * totals should reconcile against each other — the EPF payment, the PERKESO
 * payment, the CP39 and the bank file are all views of the same closed payroll.
 * Warnings are shown before the download rather than after, since a missing
 * identifier is fixed in the employee record and the file regenerated.
 */
function MonthlySubmissions({ records, employees, employer }: any) {
  const periods = useMemo(() => [...new Set<string>(
    (records as any[])
      .filter((item) => EXPORTABLE_STATUSES.includes(String(item.status)))
      .map((item) => String(item.period || ""))
      .filter(Boolean),
  )].sort().reverse(), [records]);
  const [period, setPeriod] = useState(() => periods[0] ?? today().slice(0, 7));

  const exportEmployees = useMemo(() => (employees as any[]).map((item) => ({
    id: item.id, name: item.name, employeeNumber: item.employeeNumber,
    identificationNumber: item.identificationNumber, incomeTaxNumber: item.incomeTaxNumber,
    epfNumber: item.epfNumber, socsoNumber: item.socsoNumber,
    bankName: item.bankName, bankAccountNumber: item.bankAccountNumber,
  })), [employees]);

  const files = useMemo(() => (Object.keys(EXPORT_LABELS) as ExportKind[]).map((kind) => ({
    kind,
    ...EXPORT_LABELS[kind],
    file: buildExport(kind, records, exportEmployees, period, {
      name: employer?.name, employerNumber: employer?.employerNumber,
      registrationNumber: employer?.registrationNumber, bankAccountNumber: employer?.bankAccountNumber,
      epfEmployerNumber: employer?.epfNumber, socsoEmployerNumber: employer?.socsoNumber,
    }),
  })), [records, exportEmployees, period, employer]);

  function download(kind: ExportKind) {
    const entry = files.find((item) => item.kind === kind);
    if (!entry) return;
    const url = URL.createObjectURL(new Blob([toCsv(entry.file)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = entry.file.filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="space-y-4">
    <Card className="border-amber-200 bg-amber-50"><CardContent className="flex gap-3 p-4"><ShieldCheck className="h-4 w-4 shrink-0 text-amber-700" /><p className="text-xs leading-5 text-amber-900">Built from closed and paid payroll only. These are CSV files carrying the right figures and identifiers — check them against the layout your portal expects before uploading, and reconcile the totals against the payment you make.</p></CardContent></Card>

    <Card className="bg-card"><CardContent className="p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium">Period<Select className="mt-2" value={period} onChange={(e) => setPeriod(e.target.value)}>{[...new Set([period, ...periods])].map((item) => <option key={item}>{item}</option>)}</Select></label>
      </div>
      {!periods.length && <p className="mt-4 text-xs text-muted-foreground">No closed payroll yet, so there is nothing to submit.</p>}
    </CardContent></Card>

    <div className="grid gap-4 md:grid-cols-2">{files.map(({ kind, label, note, file }) => <Card key={kind} className="bg-card"><CardContent className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-accent" /><b className="text-sm">{label}</b></div>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{note}</p>
        </div>
        <Button size="sm" variant="outline" disabled={!file.rows.length} onClick={() => download(kind)}><Download className="h-3.5 w-3.5" />CSV</Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
        <span>{file.rows.length} row{file.rows.length === 1 ? "" : "s"}</span>
        <span>Total {money(file.totals[file.totals.length - 1] || file.totals.find((value) => typeof value === "number") || 0)}</span>
      </div>
      {file.warnings.length > 0 && <ul className="mt-3 list-disc space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 pl-7 text-[11px] leading-5 text-amber-900">
        {file.warnings.map((warning: string) => <li key={warning}>{warning}</li>)}
      </ul>}
    </CardContent></Card>)}</div>
  </div>;
}

function PayrollAI({ records }: any) { const period = String(([...new Set<string>(records.map((item: any) => String(item.period || "")).filter(Boolean))].sort().reverse()[0]) || "Current period"); const metrics = records.filter((item: any) => item.period === period).map((item: any, index: number) => ({ label: `Employee ${index + 1}`, status: item.status, grossPay: Number(item.grossPay || 0), netPay: Number(item.netPay || 0), totalDeductions: Number(item.totalDeductions || 0), epfEmployee: Number(item.epfEmployee || 0), socsoEmployee: Number(item.socsoEmployee || 0), eisEmployee: Number(item.eisEmployee || 0), pcb: Number(item.pcb || 0), hasVerificationNote: Boolean(item.verificationNote) })); return <HRMSAIInsight task="payroll_review" period={period} metrics={metrics} context="Flag completeness or unusual differences only. Do not calculate or confirm statutory compliance." label="Review payroll" />; }

function Yearly({ records, employees, employer }: any) {
  const years = useMemo(() => eaAvailableYears(records), [records]);
  const [year, setYear] = useState(String(years[0] ?? new Date().getFullYear()));
  const [form, setForm] = useState<"E" | "EA" | "CP">("E");
  const [preview, setPreview] = useState<EAStatement | null>(null);

  const statements = useMemo(
    () => eaStatementsForYear(Number(year), employees, employer ?? {}, records),
    [year, employees, employer, records],
  );
  const summary = useMemo(() => eaYearSummary(statements), [statements]);

  // The monthly working paper stays a plain roll-up: it is an internal
  // reconciliation aid, not a statement anybody receives.
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const items = records.filter((item: any) => item.period === month && ["Closed", "Paid"].includes(String(item.status)));
    const gross = items.reduce((total: number, item: any) => total + Number(item.grossPay || 0), 0);
    const pcb = items.reduce((total: number, item: any) => total + Number(item.pcb || 0), 0);
    const net = items.reduce((total: number, item: any) => total + Number(item.netPay || 0), 0);
    return [month, items.length, gross, pcb, net];
  });

  const headers = form === "EA"
    ? ["Employee", "Months", "Gross", "EPF (employee)", "SOCSO (employee)", "EIS (employee)", "PCB", "Ready"]
    : form === "CP" ? ["Month", "Records", "Gross", "PCB", "Net"]
    : ["Year", "Employees", "Ready to issue", "Gross", "EPF (employee)", "SOCSO (employee)", "EIS (employee)", "PCB"];

  const rows: any[][] = form === "EA"
    ? statements.map((s) => [s.employee.name, s.employment.monthsPaid, s.income.gross, s.contributions.epf, s.contributions.socso, s.contributions.eis, s.deductions.pcb, s.fileable ? "Yes" : `${s.missing.length} missing`])
    : form === "CP" ? monthly
    : [[year, summary.employees, summary.fileable, summary.gross, summary.epfEmployee, summary.socsoEmployee, summary.eisEmployee, summary.pcb]];

  function csv() {
    const content = [headers, ...rows].map((row: any[]) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `payroll-${form}-${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="space-y-4">
    <Card className="border-amber-200 bg-amber-50"><CardContent className="flex gap-3 p-4"><ShieldCheck className="h-4 w-4 shrink-0 text-amber-700" /><p className="text-xs leading-5 text-amber-900">Figures come from closed and paid payroll only. Check them against your own records and file through the current official LHDN channel.</p></CardContent></Card>

    <Card className="bg-card"><CardContent className="p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium">Year<Select className="mt-2" value={year} onChange={(e) => setYear(e.target.value)}>{[...new Set([year, ...years.map(String)])].map((item) => <option key={item}>{item}</option>)}</Select></label>
        <div className="flex-1" />
        <Button variant="outline" onClick={csv}><Download className="h-4 w-4" />CSV</Button>
        <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{(["E", "EA", "CP"] as const).map((item) => <button key={item} onClick={() => setForm(item)} className={cn("rounded-2xl border p-5 text-left", form === item ? "bg-foreground text-white" : "bg-card")}><FileSpreadsheet className="h-5 w-5" /><b className="mt-4 block">Form {item}</b><span className="mt-1 block text-[10px] opacity-60">{item === "E" ? "Employer annual summary" : item === "EA" ? "Employee statements" : "Monthly PCB working paper"}</span></button>)}</div>
    </CardContent></Card>

    {form === "EA" && summary.incomplete > 0 && <Card className="border-amber-200 bg-amber-50"><CardContent className="p-4">
      <b className="text-xs text-amber-900">{summary.incomplete} statement{summary.incomplete === 1 ? "" : "s"} cannot be issued yet</b>
      <p className="mt-1 text-[11px] leading-5 text-amber-900/80">An EA needs each person&rsquo;s identification and income tax number, and the employer&rsquo;s E number. Open a statement below to see exactly what is missing.</p>
    </CardContent></Card>}

    <Card className="overflow-hidden bg-card"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
      <thead className="bg-background"><tr>{headers.map((item) => <th key={item} className="p-4">{item}</th>)}{form === "EA" && <th className="p-4">Statement</th>}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index} className="border-t">
        {row.map((cell, cellIndex) => <td key={cellIndex} className="p-4">{typeof cell === "number" && cellIndex > 1 ? money(cell) : String(cell)}</td>)}
        {form === "EA" && <td className="p-4"><Button size="sm" variant="outline" onClick={() => setPreview(statements[index])}>Open</Button></td>}
      </tr>)}</tbody>
    </table></div></CardContent></Card>

    {preview && <EAStatementDialog statement={preview} onClose={() => setPreview(null)} />}
  </div>;
}

/**
 * One employee's EA statement, laid out as the form reads.
 *
 * Deliberately shows the parts rather than a single gross figure: the employee
 * transcribes these into their own return, and a lump sum would make them guess
 * which box each component belongs in. Where something is missing it says so in
 * place of the value, so an incomplete statement cannot be printed and handed
 * over looking finished.
 */
function EAStatementDialog({ statement, onClose }: { statement: EAStatement; onClose: () => void }) {
  const { employee, employer, employment, income, deductions, contributions } = statement;
  const line = (label: string, value: string) => <div className="flex justify-between gap-4 py-1.5"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium tabular-nums">{value}</span></div>;
  const field = (label: string, value: string, required = true) => <div className="py-1.5">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={cn("mt-0.5 text-xs font-medium", !value && required && "text-red-600")}>{value || (required ? "Not recorded" : "—")}</div>
  </div>;

  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
    <Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-b-none bg-background sm:rounded-2xl">
      <CardContent className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-accent">Form C.P.8A · EA</div>
            <h2 className="mt-1 text-xl font-semibold">Remuneration for {statement.year}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close statement"><X className="h-4 w-4" /></Button>
        </div>

        {!statement.fileable && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <b className="text-xs text-amber-900">Cannot be issued yet</b>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] leading-5 text-amber-900/85">{statement.missing.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border p-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider">Employer</div>
            {field("Name", employer.name || "")}
            {field("Employer number (E)", employer.employerNumber || "")}
            {field("Registration number", employer.registrationNumber || "", false)}
            {field("Address", employer.address || "")}
          </div>
          <div className="rounded-xl border p-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider">Employee</div>
            {field("Name", employee.name || "")}
            {field("Identification number", employee.identificationNumber || "")}
            {field("Income tax number", employee.incomeTaxNumber || "")}
            {field("EPF number", employee.epfNumber || "", contributions.epf > 0)}
            {field("Designation", employee.jobTitle || "", false)}
            {field("Employment", [employment.from || "—", employment.to || "present"].join(" to ") + ` · ${employment.monthsPaid} month${employment.monthsPaid === 1 ? "" : "s"} paid`, false)}
          </div>
        </div>

        <div className="mt-4 rounded-xl border p-4 text-xs">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider">B · Gross remuneration</div>
          {line("Salary and wages", money(income.salary))}
          {line("Allowances", money(income.allowances))}
          {line("Overtime", money(income.overtime))}
          {line("Bonus", money(income.bonus))}
          <div className="mt-1 flex justify-between gap-4 border-t pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{money(income.gross)}</span></div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border p-4 text-xs">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider">D · Deductions</div>
            {line("PCB / MTD", money(deductions.pcb))}
            {line("Other", money(deductions.other))}
          </div>
          <div className="rounded-xl border p-4 text-xs">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider">E · Employee contributions</div>
            {line("EPF", money(contributions.epf))}
            {line("SOCSO", money(contributions.socso))}
            {line("EIS", money(contributions.eis))}
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">The employee&rsquo;s own contributions. Employer contributions are not part of this form.</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => window.print()} disabled={!statement.fileable}><Printer className="h-4 w-4" />Print statement</Button>
        </div>
      </CardContent>
    </Card>
  </div>;
}

function Vouchers({ vouchers, employees, onCreate, onUpdate, onDelete, onAction }: any) { const [editing, setEditing] = useState<any>(null); const blank = () => ({ employeeId: "", payee: "", amount: 0, details: "", paymentDate: today(), linkedType: "General", linkedId: "" }); async function save() { if (editing.id) await onUpdate(editing); else await onCreate(editing); setEditing(null); } return <div className="space-y-4"><Card className="border-black/8 bg-white/90"><CardContent className="flex items-center gap-4 p-5"><div className="flex-1"><h2 className="font-semibold">Payment vouchers</h2><p className="mt-1 text-xs text-muted-foreground">Supporting evidence only; no duplicate accounting entry is created.</p></div><Button onClick={() => setEditing(blank())}><Plus className="h-4 w-4" />Create voucher</Button></CardContent></Card>{vouchers.map((item: any) => <Card key={item.id} className="border-black/8 bg-white/90"><CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center"><WalletCards className="h-5 w-5 text-accent" /><div className="flex-1"><div className="flex items-center gap-2"><b>{item.payee}</b><Badge value={item.status} /></div><p className="mt-1 text-xs text-muted-foreground">{item.reference} · {item.paymentDate} · {item.linkedType}</p><p className="mt-2 text-xs">{item.details}</p></div><b>{money(item.amount)}</b><div className="flex gap-2">{item.status === "Draft" && <><Button size="sm" variant="outline" onClick={() => setEditing({ ...item })}><Pencil className="h-3.5 w-3.5" />Edit</Button><Button size="sm" onClick={() => onAction(item.id, "approve")}><Check className="h-3.5 w-3.5" />Approve</Button><Button size="icon" variant="outline" onClick={() => onDelete(item.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button></>}{item.status === "Approved" && <><Button size="sm" onClick={() => onAction(item.id, "mark_paid")}>Mark paid</Button><Button size="sm" variant="outline" onClick={() => onAction(item.id, "cancel")}><X className="h-3.5 w-3.5" />Cancel</Button></>}<Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" />Print</Button></div></CardContent></Card>)}{!vouchers.length && <div className="rounded-2xl border border-dashed p-10 text-center"><ReceiptText className="mx-auto h-7 w-7 text-muted-foreground" /><b className="mt-3 block">No payment vouchers</b></div>}{editing && <VoucherDialog draft={editing} setDraft={setEditing} employees={employees} onClose={() => setEditing(null)} onSave={save} />}</div>; }
function VoucherDialog({ draft, setDraft, employees, onClose, onSave }: any) {
  const update = (key: string, value: any) => setDraft({ ...draft, [key]: value });
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 sm:items-center sm:p-4"><Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-b-none bg-background sm:rounded-2xl"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><h2 className="text-xl font-semibold">{draft.id ? `Edit ${draft.reference}` : "Create payment voucher"}</h2><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close payment voucher editor"><X className="h-4 w-4" /></Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Payee"><Input value={draft.payee} onChange={(e) => update("payee", e.target.value)} /></Field><Field label="Amount (RM)"><Input type="number" min="0" step="0.01" value={draft.amount} onChange={(e) => update("amount", Number(e.target.value))} /></Field><Field label="Payment date"><DateInput value={draft.paymentDate} onChange={(e) => update("paymentDate", e.target.value)} /></Field><Field label="Link type"><Select value={draft.linkedType} onChange={(e) => update("linkedType", e.target.value)}><option>General</option><option>Claim</option><option>Payroll</option></Select></Field><Field label="Linked team member"><Select value={draft.employeeId} onChange={(e) => update("employeeId", e.target.value)}><option value="">Not linked</option>{employees.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="Linked record ID"><Input value={draft.linkedId} onChange={(e) => update("linkedId", e.target.value)} /></Field><div className="sm:col-span-2"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium">Payment details</span><AIWritingButton value={draft.details} field="Payment voucher details" context="Internal HR payment voucher. Keep names, dates, amounts and purpose exact. Do not invent approval or accounting status." onApply={(value) => update("details", value)} /></div><Textarea className="min-h-28" value={draft.details} onChange={(e) => update("details", e.target.value)} /></div></div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSave}>Save voucher</Button></div></CardContent></Card></div>;
}
function Field({ label, children }: any) { return <label className="text-xs font-medium"><span className="mb-2 block">{label}</span>{children}</label>; }
function Badge({ value }: any) { return <StatusBadge value={value} />; }

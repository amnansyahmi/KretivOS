"use client";

import { useMemo, useState } from "react";
import { FileText, LockKeyhole, ShieldCheck, UserRound, WalletCards } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Employee = { id: string; name: string; title?: string; department?: string; status: string };

type Props = { employees: Employee[] };

const money = (value: number) => `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function HRPayslipSetup({ employees }: Props) {
  const active = useMemo(() => employees.filter((employee) => employee.status === "active"), [employees]);
  const [employeeId, setEmployeeId] = useState(active[0]?.id || "");
  const [period, setPeriod] = useState("July 2026");
  const employee = active.find((item) => item.id === employeeId) || active[0];

  const preview = {
    basic: 0,
    allowances: 0,
    overtime: 0,
    bonus: 0,
    epf: 0,
    socso: 0,
    eis: 0,
    pcb: 0,
    other: 0,
  };
  const gross = preview.basic + preview.allowances + preview.overtime + preview.bonus;
  const deductions = preview.epf + preview.socso + preview.eis + preview.pcb + preview.other;

  return <div className="space-y-5">
    <Card className="overflow-hidden border-amber-200 bg-amber-50/80">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><LockKeyhole className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><h2 className="font-semibold text-amber-950">Payslip records are locked until login and permissions are enabled</h2><p className="mt-1 text-xs leading-5 text-amber-800">The module shell and Kretivco payslip preview are ready, but salary, bank, EPF, SOCSO, EIS and tax values will not be stored in the current unauthenticated workspace. Later, HR/Admin can generate payslips while each staff member only sees their own records.</p></div>
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-amber-800"><ShieldCheck className="h-3.5 w-3.5" />Protected release</div>
      </CardContent>
    </Card>

    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <Card className="border-black/8 bg-white/90"><CardContent className="p-5">
        <div className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-[#ba5c42]" /><h2 className="font-semibold">Payslip setup</h2></div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">This preview uses zero values only. The uploaded payslip example will be used to match the exact layout once it is available.</p>
        <label className="mt-5 block text-xs font-medium text-[#4e5a52]">Employee<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none">{active.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="mt-4 block text-xs font-medium text-[#4e5a52]">Pay period<input value={period} onChange={(event) => setPeriod(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none" /></label>

        <div className="mt-5 space-y-2 text-xs">
          {["Basic salary", "Allowances", "Overtime", "Bonus / commission", "EPF employee", "SOCSO", "EIS", "PCB / tax", "Other deductions", "Employer contributions"].map((item) => <div key={item} className="flex items-center gap-2 rounded-xl bg-[#f7f4ed] px-3 py-2.5"><FileText className="h-3.5 w-3.5 text-[#ba5c42]" /><span>{item}</span></div>)}
        </div>
      </CardContent></Card>

      <div className="overflow-x-auto rounded-2xl border bg-[#e9e5dc] p-4 sm:p-6">
        <div className="mx-auto min-h-[820px] w-[680px] bg-white px-12 py-10 text-[#252a26] shadow-xl">
          <div className="flex items-start justify-between border-b-4 border-[#d71961] pb-5">
            <div><div className="text-2xl font-bold">Kretivco <span className="text-[#d71961]">Mediaworks</span></div><div className="mt-1 text-[10px] text-gray-500">201803023252 (SA0463354-A)</div></div>
            <div className="text-right"><div className="text-xl font-bold tracking-wide">PAYSLIP</div><div className="mt-1 text-xs text-gray-500">{period}</div></div>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-8 rounded-xl bg-[#f7f4ed] p-5 text-xs">
            <div><div className="text-[9px] uppercase tracking-wider text-gray-500">Employee</div><div className="mt-1 font-semibold">{employee?.name || "Employee name"}</div><div className="mt-1 text-gray-500">{employee?.title || "Job title"} · {employee?.department || "Department"}</div></div>
            <div className="text-right"><div className="text-[9px] uppercase tracking-wider text-gray-500">Payment status</div><div className="mt-1 font-semibold">Draft preview</div><div className="mt-1 text-gray-500">Employee ID and bank details protected</div></div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-8">
            <PayslipSection title="Earnings" rows={[["Basic salary", preview.basic], ["Allowances", preview.allowances], ["Overtime", preview.overtime], ["Bonus / commission", preview.bonus]]} totalLabel="Gross pay" total={gross} />
            <PayslipSection title="Deductions" rows={[["EPF", preview.epf], ["SOCSO", preview.socso], ["EIS", preview.eis], ["PCB / tax", preview.pcb], ["Other deductions", preview.other]]} totalLabel="Total deductions" total={deductions} />
          </div>

          <div className="mt-9 rounded-xl bg-[#26342b] p-6 text-white"><div className="flex items-end justify-between"><div><div className="text-[10px] uppercase tracking-[.18em] text-white/50">Net salary</div><div className="mt-2 text-sm text-white/60">Gross pay less employee deductions</div></div><div className="text-3xl font-bold">{money(gross - deductions)}</div></div></div>

          <div className="mt-8 grid grid-cols-2 gap-8 text-xs"><div><div className="font-semibold">Employer contributions</div><p className="mt-2 leading-5 text-gray-500">EPF, SOCSO and EIS employer contributions will appear here and do not reduce net salary.</p></div><div><div className="font-semibold">Notes</div><p className="mt-2 leading-5 text-gray-500">Computer-generated payslip. Signature and company stamp fields can be enabled according to the approved sample.</p></div></div>

          <div className="mt-12 border-t pt-5 text-center text-[9px] leading-4 text-gray-400">Kretivco Mediaworks · No.15A, Jalan USJ1/19, 47600 Subang Jaya, Selangor · kretivco@gmail.com</div>
        </div>
      </div>
    </div>
  </div>;
}

function PayslipSection({ title, rows, totalLabel, total }: { title: string; rows: [string, number][]; totalLabel: string; total: number }) {
  return <div><div className="border-b-2 border-[#ffb136] pb-2 text-sm font-bold">{title}</div><div className="mt-3 space-y-3 text-xs">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4"><span className="text-gray-500">{label}</span><span className="font-medium">{money(value)}</span></div>)}</div><div className="mt-4 flex justify-between border-t pt-3 text-sm font-bold"><span>{totalLabel}</span><span>{money(total)}</span></div></div>;
}

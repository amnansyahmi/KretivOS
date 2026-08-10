"use client";

/**
 * Applying for leave, and submitting a claim.
 *
 * A sheet that rises from the bottom rather than a centred dialogue, because
 * the form is filled with a thumb and the fields should start near it. It is
 * the two things an employee does often enough to want in the app rather than
 * a link out to the workspace form.
 *
 * Validation is the same module the workspace uses, so the app cannot accept a
 * request the workspace would reject — and the server checks again regardless.
 */

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/date-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HALF_DAY_SESSIONS, leaveProblemFor, validateLeaveRequest } from "@/lib/leave-request";
import { leaveTypeNames, toLeaveRules } from "@/lib/leave-entitlement";
import type { HRMSSession } from "@/components/hrms-shell";
import { cn } from "@/lib/utils";

export type ComposerKind = "leave" | "claim";

const CLAIM_CATEGORIES = ["General", "Travel", "Meals", "Medical", "Software", "Equipment", "Client expense"];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function HRAppComposer({
  kind,
  session,
  settings,
  onClose,
  onSubmit,
}: {
  kind: ComposerKind;
  session: HRMSSession;
  settings: any;
  onClose: () => void;
  onSubmit: (payload: any) => Promise<void>;
}) {
  const leaveTypes = leaveTypeNames(toLeaveRules(settings?.leaveTypes));
  const [leave, setLeave] = useState<any>({
    employeeId: session.userId, type: leaveTypes[0] || "Annual Leave",
    startDate: today(), endDate: today(), halfDay: false, halfDaySession: "first", reason: "",
  });
  const [claim, setClaim] = useState<any>({
    employeeId: session.userId, claimDate: today(), category: "General", amount: "", description: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const leaveProblems = kind === "leave" ? validateLeaveRequest(leave) : [];
  const claimProblems = kind === "claim"
    ? [
      !claim.claimDate ? { field: "claimDate", message: "Choose the date of the expense." } : null,
      !(Number(claim.amount) > 0) ? { field: "amount", message: "Enter an amount." } : null,
      !String(claim.description).trim() ? { field: "description", message: "Say what it was for." } : null,
    ].filter(Boolean) as { field: string; message: string }[]
    : [];
  const problems = kind === "leave" ? leaveProblems : claimProblems;
  const problemFor = (field: string) => problems.find((problem) => problem.field === field)?.message ?? "";

  async function submit() {
    if (problems.length || busy) return;
    setBusy(true); setError("");
    try {
      await onSubmit(kind === "leave"
        ? { operation: "create", resource: "leave", data: leave }
        : { operation: "create", resource: "claims", data: { ...claim, amount: Number(claim.amount) } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit that.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="fixed inset-0 z-[160] flex items-end bg-black/45" onClick={onClose}>
    <div
      className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-background pb-[max(1rem,env(safe-area-inset-bottom))]"
      onClick={(event) => event.stopPropagation()}
    >
      {/* The grabber, so the sheet reads as something that can be dismissed. */}
      <div className="sticky top-0 z-10 bg-background pt-2">
        <div className="mx-auto h-1 w-10 rounded-full bg-border" />
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <h2 className="text-lg font-semibold">{kind === "leave" ? "Apply for leave" : "Submit a claim"}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition active:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="space-y-4 px-5 pb-5">
        {kind === "leave" ? <>
          <Field label="Leave type">
            <Select value={leave.type} onChange={(event) => setLeave({ ...leave, type: event.target.value })}>
              {leaveTypes.map((item) => <option key={item}>{item}</option>)}
            </Select>
          </Field>

          <Field label="Duration">
            <Select value={leave.halfDay ? "half" : "full"} onChange={(event) => {
              const half = event.target.value === "half";
              setLeave({ ...leave, halfDay: half, endDate: half ? leave.startDate : leave.endDate, halfDaySession: half ? leave.halfDaySession || "first" : "" });
            }}>
              <option value="full">Full day(s)</option>
              <option value="half">Half day</option>
            </Select>
          </Field>

          {leave.halfDay && <Field label="Which half">
            <Select value={leave.halfDaySession || "first"} onChange={(event) => setLeave({ ...leave, halfDaySession: event.target.value })}>
              {HALF_DAY_SESSIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
          </Field>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="From" problem={problemFor("startDate")}>
              <DateInput value={leave.startDate} onChange={(event) => setLeave({ ...leave, startDate: event.target.value, endDate: leave.halfDay ? event.target.value : leave.endDate })} />
            </Field>
            <Field label="To" problem={problemFor("endDate")}>
              <DateInput value={leave.endDate} disabled={leave.halfDay} min={leave.startDate} onChange={(event) => setLeave({ ...leave, endDate: event.target.value })} />
            </Field>
          </div>

          <Field label="Reason">
            <Textarea value={leave.reason} onChange={(event) => setLeave({ ...leave, reason: event.target.value })} className="min-h-24" placeholder="Family vacation" />
          </Field>
        </> : <>
          <Field label="Category">
            <Select value={claim.category} onChange={(event) => setClaim({ ...claim, category: event.target.value })}>
              {CLAIM_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" problem={problemFor("claimDate")}>
              <DateInput value={claim.claimDate} onChange={(event) => setClaim({ ...claim, claimDate: event.target.value })} />
            </Field>
            <Field label="Amount (RM)" problem={problemFor("amount")}>
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={claim.amount} onChange={(event) => setClaim({ ...claim, amount: event.target.value })} placeholder="0.00" />
            </Field>
          </div>

          <Field label="What was it for" problem={problemFor("description")}>
            <Textarea value={claim.description} onChange={(event) => setClaim({ ...claim, description: event.target.value })} className="min-h-24" placeholder="Client lunch · Chef Ammar" />
          </Field>

          <p className="text-[11px] leading-4 text-muted-foreground">Attach the receipt from the full HR workspace — this form keeps the claim moving without it.</p>
        </>}

        {error && <p className="rounded-xl border border-destructive/25 bg-card p-3 text-xs leading-5 text-destructive">{error}</p>}

        <Button className="h-12 w-full" onClick={submit} disabled={busy || problems.length > 0}>
          {busy ? "Submitting…" : "Submit Request"}
        </Button>
      </div>
    </div>
  </div>;
}

function Field({ label, problem, children }: { label: string; problem?: string; children: React.ReactNode }) {
  return <label className="block">
    <span className="flex items-center justify-between gap-2 text-xs font-medium text-foreground-soft">
      {label}{problem && <span className={cn("text-[10px] font-normal text-destructive")}>{problem}</span>}
    </span>
    <div className="mt-2">{children}</div>
  </label>;
}

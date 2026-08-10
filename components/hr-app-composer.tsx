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
import { Camera, FileText, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/date-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HALF_DAY_SESSIONS, leaveProblemFor, validateLeaveRequest } from "@/lib/leave-request";
import { attachmentRequirementFor, leaveTypeNames, toLeaveRules } from "@/lib/leave-entitlement";
import { prepareUpload } from "@/lib/compress-image";
import { checkUpload, describeSize } from "@/lib/upload-limits";
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
  const rules = toLeaveRules(settings?.leaveTypes);
  const leaveTypes = leaveTypeNames(rules);
  const [leave, setLeave] = useState<any>({
    employeeId: session.userId, type: leaveTypes[0] || "Annual Leave",
    startDate: today(), endDate: today(), halfDay: false, halfDaySession: "first", reason: "", attachmentId: "",
  });
  const [claim, setClaim] = useState<any>({
    employeeId: session.userId, claimDate: today(), category: "General", amount: "", description: "", receiptAssetId: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const needs = attachmentRequirementFor(rules, leave.type);
  const leaveProblems = kind === "leave"
    ? [
      ...validateLeaveRequest(leave),
      ...(needs.required && !leave.attachmentId ? [{ field: "attachment", message: `${needs.label} required` }] : []),
    ]
    : [];
  const claimProblems = kind === "claim"
    ? [
      !claim.claimDate ? { field: "claimDate", message: "Choose the date of the expense." } : null,
      !(Number(claim.amount) > 0) ? { field: "amount", message: "Enter an amount." } : null,
      !String(claim.description).trim() ? { field: "description", message: "Say what it was for." } : null,
      !claim.receiptAssetId ? { field: "attachment", message: "Receipt required" } : null,
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

          <AppUpload
            purpose="leave_attachment"
            employeeId={session.userId}
            label={needs.required ? needs.label : "Supporting document"}
            required={needs.required}
            value={leave.attachmentId}
            onChange={(id: string) => setLeave({ ...leave, attachmentId: id })}
          />
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

          <AppUpload
            purpose="claim_receipt"
            employeeId={session.userId}
            label="Receipt"
            required
            value={claim.receiptAssetId}
            onChange={(id: string, suggested?: any) => setClaim((current: any) => ({
              ...current,
              receiptAssetId: id,
              // Only fills what has not been typed: a read amount never
              // overwrites a figure somebody entered deliberately.
              ...(suggested?.total && !Number(current.amount) ? { amount: String(suggested.total) } : {}),
              ...(suggested?.documentDate ? { claimDate: suggested.documentDate } : {}),
              ...(suggested?.vendorName && !String(current.description).trim() ? { description: suggested.vendorName } : {}),
            }))}
          />
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

/**
 * Attaching a receipt or a certificate, from a phone.
 *
 * Two buttons rather than one file input: on a phone "Take photo" and "Choose
 * file" are different intentions, and a single control that opens a picker
 * with the camera buried inside it is the thing people give up on. `capture`
 * asks the camera app for the rear lens, which is the one pointed at a
 * receipt.
 *
 * Oversized photographs are resized on the way through — see `upload-limits`
 * for why the stated 5 MB and what can actually be sent are different numbers.
 */
function AppUpload({
  purpose,
  employeeId,
  label,
  required,
  value,
  onChange,
}: {
  purpose: "claim_receipt" | "leave_attachment";
  employeeId: string;
  label: string;
  required?: boolean;
  value?: string;
  onChange: (id: string, suggested?: any) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    setError(""); setNote("");

    const check = checkUpload({ size: file.size, type: file.type });
    if (!check.ok) { setError(check.reason); return; }

    setBusy(true);
    try {
      const prepared = await prepareUpload(file);
      const response = await fetch("/api/hr/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, employeeId, filename: file.name, dataUrl: prepared.dataUrl }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      setName(file.name);
      onChange(result.id, result.suggested);
      if (prepared.compressed) setNote(`Resized from ${describeSize(prepared.originalBytes)} so it would send.`);
      else if (purpose === "claim_receipt" && result.suggested?.total) setNote("Read from the receipt — check the amount and date.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <span className="flex items-center justify-between gap-2 text-xs font-medium text-foreground-soft">
      {label}{required && !value && <span className="text-[10px] font-normal text-destructive">Required</span>}
    </span>

    {value ? <div className="mt-2 flex items-center gap-3 rounded-xl border bg-card p-3">
      <FileText className="h-4 w-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{name || "Attached"}</span>
      <button onClick={() => { onChange(""); setName(""); setNote(""); }} aria-label={`Remove ${label}`} className="text-muted-foreground"><X className="h-4 w-4" /></button>
    </div> : <div className="mt-2 grid grid-cols-2 gap-2">
      <label className={cn("flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-card text-xs font-semibold", busy && "opacity-60")}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}Take photo
        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={(event) => upload(event.target.files?.[0])} />
      </label>
      <label className={cn("flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-card text-xs font-semibold", busy && "opacity-60")}>
        <Paperclip className="h-4 w-4" />Choose file
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={busy} onChange={(event) => upload(event.target.files?.[0])} />
      </label>
    </div>}

    {note && <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{note}</p>}
    {error && <p className="mt-1.5 text-[10px] leading-4 text-destructive">{error}</p>}
    {!value && !error && <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">JPG, PNG or PDF · up to 5 MB · photos are resized automatically</p>}
  </div>;
}

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
import { certificateCoverage, certificateNameMismatch } from "@/lib/medical-certificate";
import { receiptPatient } from "@/lib/medical-receipt";
import { prepareUpload } from "@/lib/compress-image";
import { checkUpload, describeSize } from "@/lib/upload-limits";
import { formatDuration, validateEntry } from "@/lib/timesheet";
import type { HRMSSession } from "@/components/hrms-shell";
import { cn } from "@/lib/utils";

export type ComposerKind = "leave" | "claim" | "task";

const CLAIM_CATEGORIES = ["General", "Travel", "Meals", "Medical", "Software", "Equipment", "Client expense"];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function HRAppComposer({
  kind,
  session,
  settings,
  draft,
  onClose,
  onSubmit,
}: {
  kind: ComposerKind;
  session: HRMSSession;
  settings: any;
  /**
   * The record being edited, or the date a new one is being logged against.
   * Shared across kinds: a leave request opened from the calendar arrives the
   * same way a task opened from the week strip does.
   */
  draft?: any;
  onClose: () => void;
  onSubmit: (payload: any) => Promise<void>;
}) {
  const rules = toLeaveRules(settings?.leaveTypes);
  const leaveTypes = leaveTypeNames(rules);
  const [leave, setLeave] = useState<any>(() => ({
    employeeId: session.userId,
    type: draft?.type || leaveTypes[0] || "Annual Leave",
    startDate: draft?.startDate || today(),
    endDate: draft?.endDate || draft?.startDate || today(),
    halfDay: Boolean(draft?.halfDay),
    halfDaySession: draft?.halfDaySession || "first",
    reason: draft?.reason || "",
    attachmentId: draft?.attachmentId || "",
    id: draft?.id,
  }));
  const [claim, setClaim] = useState<any>({
    employeeId: session.userId, claimDate: today(), category: "General", amount: "", description: "", receiptAssetId: "",
  });
  const [task, setTask] = useState<any>(() => ({
    employeeId: session.userId,
    date: draft?.date || today(),
    task: draft?.task || "",
    startTime: draft?.startTime || "09:00",
    endTime: draft?.endTime || "10:00",
    project: draft?.project || "",
    notes: draft?.notes || "",
    billable: Boolean(draft?.billable),
    id: draft?.id,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** What was read off an attached certificate, for the checks below the form. */
  const [certificate, setCertificate] = useState<any>(null);
  /** The same for a clinic receipt on a medical claim. */
  const [receipt, setReceipt] = useState<any>(null);
  /**
   * Whether the dates are the employee's rather than the defaults. A
   * certificate fills an untouched form; it never argues with somebody who has
   * already chosen the days they are asking for.
   */
  const [datesTouched, setDatesTouched] = useState(false);

  const needs = attachmentRequirementFor(rules, leave.type);
  const coverage = certificateCoverage(certificate, leave);
  const nameMismatch = certificateNameMismatch(certificate, session.name);

  /*
   * Everything a clinic receipt disagreed with, in one list. The name check
   * runs here rather than on the server because the server does not know who
   * is filling the form in — only that somebody uploaded a file.
   */
  const receiptNotes: string[] = receipt?.kind === "medical_receipt"
    ? [
      receipt.amountNote,
      ...(receipt.warnings ?? []),
      receiptPatient(receipt, session.name).message,
    ].filter(Boolean)
    : [];
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
  const taskProblems = kind === "task" ? validateEntry(task) : [];
  const problems = kind === "leave" ? leaveProblems : kind === "claim" ? claimProblems : taskProblems;
  const problemFor = (field: string) => problems.find((problem) => problem.field === field)?.message ?? "";

  async function submit() {
    if (problems.length || busy) return;
    setBusy(true); setError("");
    try {
      await onSubmit(kind === "leave"
        ? { operation: leave.id ? "update" : "create", resource: "leave", id: leave.id, data: leave }
        : kind === "claim"
          ? { operation: "create", resource: "claims", data: { ...claim, amount: Number(claim.amount) } }
          : { operation: task.id ? "update" : "create", resource: "timesheets", id: task.id, data: task });
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
          <h2 className="text-lg font-semibold">{kind === "leave" ? (leave.id ? "Edit leave request" : "Apply for leave") : kind === "claim" ? "Submit a claim" : task.id ? "Edit task" : "Log a task"}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition active:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="space-y-4 px-5 pb-5">
        {kind === "task" ? <>
          <Field label="What did you work on" problem={problemFor("task")}>
            <Input value={task.task} onChange={(event) => setTask({ ...task, task: event.target.value })} placeholder="Storyboard revisions" />
          </Field>

          <Field label="Date" problem={problemFor("date")}>
            <DateInput value={task.date} onChange={(event) => setTask({ ...task, date: event.target.value })} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From" problem={problemFor("startTime")}>
              <Input type="time" value={task.startTime} onChange={(event) => setTask({ ...task, startTime: event.target.value })} />
            </Field>
            <Field label="To" problem={problemFor("endTime")}>
              <Input type="time" value={task.endTime} onChange={(event) => setTask({ ...task, endTime: event.target.value })} />
            </Field>
          </div>

          <Field label="Project or client">
            <Input value={task.project} onChange={(event) => setTask({ ...task, project: event.target.value })} placeholder="Chef Ammar" />
          </Field>

          <label className="flex items-center gap-3 rounded-xl border bg-card p-3 text-xs font-medium">
            <input type="checkbox" className="h-4 w-4" checked={Boolean(task.billable)} onChange={(event) => setTask({ ...task, billable: event.target.checked })} />
            Billable to the client
          </label>

          <Field label="Notes">
            <Textarea value={task.notes} onChange={(event) => setTask({ ...task, notes: event.target.value })} className="min-h-20" />
          </Field>

          {!problems.length && <p className="text-[11px] text-muted-foreground">{formatDuration(taskMinutes(task))} on this task.</p>}
        </> : kind === "leave" ? <>
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
              <DateInput value={leave.startDate} onChange={(event) => { setDatesTouched(true); setLeave({ ...leave, startDate: event.target.value, endDate: leave.halfDay ? event.target.value : leave.endDate }); }} />
            </Field>
            <Field label="To" problem={problemFor("endDate")}>
              <DateInput value={leave.endDate} disabled={leave.halfDay} min={leave.startDate} onChange={(event) => { setDatesTouched(true); setLeave({ ...leave, endDate: event.target.value }); }} />
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
            onChange={(id: string, suggested?: any) => {
              setCertificate(id ? suggested ?? null : null);
              setLeave((current: any) => ({
                ...current,
                attachmentId: id,
                // The dates on the certificate are what the leave is for, so
                // they are taken while the form is still on its defaults. A
                // date somebody moved deliberately is never overwritten.
                ...(suggested?.prefill && suggested.startDate && !datesTouched
                  ? { startDate: suggested.startDate, endDate: suggested.endDate || suggested.startDate, halfDay: false }
                  : {}),
              }));
            }}
          />

          {/*
            * The reason reading the certificate is worth doing. Sick leave is
            * the one type that arrives with evidence and nothing was checking
            * the evidence against the request, so a two-day certificate on a
            * week off looked exactly like a valid one. Shown, not blocked: a
            * hospitalisation followed by recovery days is legitimate, and the
            * approver is the one who should decide.
            */}
          {coverage.message && <p className="rounded-xl bg-accent-tint px-3 py-2.5 text-[11px] leading-4 text-accent-tint-foreground">{coverage.message}</p>}
          {nameMismatch && <p className="rounded-xl bg-accent-tint px-3 py-2.5 text-[11px] leading-4 text-accent-tint-foreground">{nameMismatch}</p>}
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
            // A medical claim is read by a different extractor, because a
            // clinic receipt stacks four amounts and the one that matters is
            // the payment made, not the last or largest figure on the page.
            category={claim.category}
            label="Receipt"
            required
            value={claim.receiptAssetId}
            onChange={(id: string, suggested?: any) => {
              setReceipt(id ? suggested ?? null : null);
              setClaim((current: any) => ({
                ...current,
                receiptAssetId: id,
                // Only fills what has not been typed: a read amount never
                // overwrites a figure somebody entered deliberately.
                ...(suggested?.total && !Number(current.amount) ? { amount: String(suggested.total) } : {}),
                ...(suggested?.documentDate ? { claimDate: suggested.documentDate } : {}),
                // A clinic receipt says what the visit was for, which is a
                // better description than the clinic's name on its own.
                ...(!String(current.description).trim() && (suggested?.treatment || suggested?.vendorName)
                  ? { description: [suggested.vendorName, suggested.treatment].filter(Boolean).join(" · ") }
                  : {}),
              }));
            }}
          />

          {/*
            * What the receipt disagreed with, and who it is for. Shown rather
            * than blocked: a part-paid bill, a claim for a dependant and a
            * smudged figure are all legitimate things to submit, and the
            * approver is the one who decides.
            */}
          {receiptNotes.map((note) => <p key={note} className="rounded-xl bg-accent-tint px-3 py-2.5 text-[11px] leading-4 text-accent-tint-foreground">{note}</p>)}
        </>}

        {error && <p className="rounded-xl border border-destructive/25 bg-card p-3 text-xs leading-5 text-destructive">{error}</p>}

        <Button className="h-12 w-full" onClick={submit} disabled={busy || problems.length > 0}>
          {busy ? "Saving…" : kind === "task" ? "Save task" : "Submit Request"}
        </Button>
      </div>
    </div>
  </div>;
}

/** Minutes between the two times, for the line under the form. */
function taskMinutes(entry: any) {
  const [startHour, startMinute] = String(entry.startTime || "").split(":").map(Number);
  const [endHour, endMinute] = String(entry.endTime || "").split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some((part) => !Number.isFinite(part))) return 0;
  return Math.max(0, (endHour * 60 + endMinute) - (startHour * 60 + startMinute));
}

function Field({ label, problem, children }: { label: string; problem?: string; children: React.ReactNode }) {
  /*
   * min-w-0: a grid item's default min-width is auto — its content's min-content
   * size — not 0, so `w-full` on the input inside does not stop it. iOS Safari's
   * native time picker has an intrinsic width to fit "10:00 AM" plus its wheel
   * affordance, and in a two-column grid at phone width that pushed the second
   * field off the right edge of the screen instead of shrinking to fit.
   */
  return <label className="block min-w-0">
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
  category,
  label,
  required,
  value,
  onChange,
}: {
  purpose: "claim_receipt" | "leave_attachment";
  employeeId: string;
  /** The claim category, which decides how the server reads the receipt. */
  category?: string;
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
        body: JSON.stringify({ purpose, employeeId, category, filename: file.name, dataUrl: prepared.dataUrl }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      setName(file.name);
      onChange(result.id, result.suggested);
      /*
       * Whatever was read is said out loud. Fields that fill themselves in
       * without explanation look like a bug the first time and get trusted
       * blindly after that; a line naming what was read invites the glance
       * that catches a misread date.
       */
      // Ordered most specific first. A medical receipt also satisfies the
      // generic claim test below it, so checking that first would mean the
      // clinic-specific line never appeared.
      if (prepared.compressed) setNote(`Resized from ${describeSize(prepared.originalBytes)} so it would send.`);
      else if (result.suggested?.kind === "medical_receipt") {
        setNote(result.suggested.total
          ? "Read from the receipt — the amount is what was paid, not the bill total."
          : "The amount could not be read clearly, so key it in.");
      }
      else if (purpose === "leave_attachment" && result.suggested?.prefill) setNote("Dates read from the certificate — check them before submitting.");
      else if (purpose === "leave_attachment" && result.suggested?.ok) setNote("The dates on the certificate could not be read clearly, so key them in.");
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

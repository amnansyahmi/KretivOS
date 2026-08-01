"use client";

/**
 * Accounting workspace.
 *
 * The ledger underneath is double-entry, but this screen deliberately talks
 * about money in and money out. Debits and credits appear only in the Journal
 * tab, for the accountant. Everyone else records a bill, pays it, photographs a
 * receipt and reads a report.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Camera, Check, ChevronRight, CircleDollarSign,
  FileText, HandCoins, Landmark, Loader2, Lock, LockOpen, Plus, Receipt,
  RefreshCw, ScrollText, Sparkles, Trash2, TrendingDown, TrendingUp, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/toast";
import { RowSkeleton, StatSkeleton } from "@/components/ui/skeleton";
import { DateInput } from "@/components/date-input";
import {
  AccountingShell, ACCOUNTING_NAV_ITEMS, type AccountingTab,
} from "@/components/accounting-shell";
import { BudgetForecast } from "@/components/budget-forecast";
import { fromCents, toCents } from "@/lib/accounting-math";
import { isoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Tab = AccountingTab;

const money = (value: number, currency = "RM") =>
  `${value < 0 ? "−" : ""}${currency}${Math.abs(Number(value) || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const today = () => new Date().toISOString().slice(0, 10);

type Snapshot = {
  accounts: any[]; vendors: any[]; bills: any[]; payments: any[]; periods: any[]; entries: any[];
  transactions?: any[]; settlements?: any[]; customers?: any[];
  unpostedInvoices?: { count: number; value: number };
  unreconciledCash?: { count: number; net: number };
};

const EMPTY: Snapshot = {
  accounts: [], vendors: [], bills: [], payments: [], periods: [], entries: [],
  transactions: [], settlements: [], customers: [],
};

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { success, error: toastError } = useToast();

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/accounting", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load accounting data.");
      setData(payload);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load accounting data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Deep links from the command palette and the redirected Finance tab open the
  // tab they name rather than always landing on the overview.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested && ACCOUNTING_NAV_ITEMS.some((item) => item.id === requested)) setTab(requested as Tab);
  }, []);

  /** Shared writer: every mutation returns a fresh snapshot, so state stays true. */
  const submit = useCallback(async (body: any, successMessage: string) => {
    try {
      const response = await fetch("/api/accounting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "That did not save.");
      if (payload.accounts) setData(payload);
      else await load();
      if (payload.ledgerError) toastError(`Saved, but the ledger still needs attention: ${payload.ledgerError}`);
      else success(successMessage);
      return payload;
    } catch (cause) {
      toastError(cause instanceof Error ? cause.message : "That did not save.");
      return null;
    }
  }, [load, success, toastError]);

  const totals = useMemo(() => {
    const payable = data.bills
      .filter((bill) => !["Paid", "Void", "Draft"].includes(bill.status))
      .reduce((sum, bill) => sum + Number(bill.balance || 0), 0);
    const overdue = data.bills
      .filter((bill) => !["Paid", "Void", "Draft"].includes(bill.status) && bill.aging !== "current")
      .reduce((sum, bill) => sum + Number(bill.balance || 0), 0);
    const paidOut = data.payments.filter((item) => item.direction === "out").reduce((sum, item) => sum + Number(item.amount), 0);
    const paidIn = data.payments.filter((item) => item.direction === "in").reduce((sum, item) => sum + Number(item.amount), 0);
    return { payable, overdue, paidOut, paidIn };
  }, [data]);

  // What is waiting in a section the operator is not currently looking at.
  const badges = useMemo(() => ({
    capture: undefined as number | undefined,
    settlements: (data.settlements ?? []).filter((item: any) => item.status === "Paid" && !item.onLedger).length || undefined,
    bills: data.bills.filter((bill: any) => !["Paid", "Void", "Draft"].includes(bill.status) && bill.aging !== "current").length || undefined,
  }), [data]);

  const current = ACCOUNTING_NAV_ITEMS.find((item) => item.id === tab) ?? ACCOUNTING_NAV_ITEMS[0];

  function navigate(next: Tab) {
    setTab(next);
    // Keeps the address bar shareable and the browser's back button honest.
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url);
  }

  return <AccountingShell
    activeId={tab}
    title={current.label}
    description={current.description}
    badges={badges}
    onNavigate={navigate}
    actions={<Button variant="outline" className="bg-white" onClick={() => void load()} disabled={loading}>
      <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
      <span className="hidden sm:inline">Sync</span>
    </Button>}
  >
    {error && <div className="mb-5 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
      <span>{error}</span>
      <Button variant="outline" size="sm" className="bg-white" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" />Retry</Button>
    </div>}

    {!loading && Number(data.unpostedInvoices?.count) > 0 && <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {data.unpostedInvoices!.count} issued invoice{data.unpostedInvoices!.count === 1 ? " is" : "s are"} not on the ledger
        ({money(data.unpostedInvoices!.value)}). Income and receivables are understated by that amount until they are posted.
      </span>
      <Button
        size="sm"
        className="shrink-0"
        onClick={() => submit({ resource: "invoice", operation: "backfill" }, "Invoices posted to the ledger.")}
      >Post them now</Button>
    </div>}

    {tab === "overview" && <Overview data={data} totals={totals} loading={loading} onGo={navigate} />}
    {tab === "capture" && <CaptureQueue accounts={data.accounts} vendors={data.vendors} onPosted={load} submit={submit} />}
    {tab === "transactions" && <Transactions data={data} loading={loading} submit={submit} />}
    {tab === "bills" && <Bills data={data} loading={loading} submit={submit} />}
    {tab === "vendors" && <Vendors data={data} loading={loading} submit={submit} />}
    {tab === "payments" && <Payments data={data} loading={loading} submit={submit} />}
    {tab === "settlements" && <Settlements data={data} loading={loading} submit={submit} />}
    {tab === "reports" && <Reports />}
    {tab === "journal" && <Journal data={data} submit={submit} />}
    {tab === "forecast" && <BudgetForecast />}
    {tab === "accounts" && <Accounts data={data} submit={submit} />}
  </AccountingShell>;
}

function Stat({ label, value, note, icon: Icon, tone }: any) {
  return <Card className="bg-white/80"><CardContent className="p-5">
    <div className="flex items-start justify-between">
      <div className="text-xs text-muted-foreground">{label}</div>
      {Icon && <Icon className={cn("h-4 w-4", tone === "bad" ? "text-red-500" : "text-[#ba5c42]")} />}
    </div>
    <div className={cn("mt-3 text-2xl font-semibold tracking-tight", tone === "bad" && "text-red-600")}>{value}</div>
    <div className="mt-2 text-xs text-muted-foreground">{note}</div>
  </CardContent></Card>;
}

function Overview({ data, totals, loading, onGo }: any) {
  const dueSoon = data.bills
    .filter((bill: any) => !["Paid", "Void", "Draft"].includes(bill.status))
    .sort((a: any, b: any) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))
    .slice(0, 6);

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {loading
        ? Array.from({ length: 4 }, (_, index) => <StatSkeleton key={index} />)
        : <>
          <Stat label="Owed to suppliers" value={money(totals.payable)} note={`${data.bills.filter((b: any) => !["Paid", "Void", "Draft"].includes(b.status)).length} open bills`} icon={TrendingDown} />
          <Stat label="Overdue" value={money(totals.overdue)} note="Past the due date" icon={AlertTriangle} tone={totals.overdue > 0 ? "bad" : undefined} />
          <Stat label="Paid out" value={money(totals.paidOut)} note="Recorded payments" icon={TrendingDown} />
          <Stat label="Received" value={money(totals.paidIn)} note="Recorded receipts" icon={TrendingUp} />
        </>}
    </div>

    <div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
      <Card className="bg-white/80">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Due next</CardTitle>
          <button onClick={() => onGo("bills")} className="text-xs font-medium">All bills</button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <RowSkeleton rows={3} />}
          {!loading && !dueSoon.length && <p className="py-8 text-center text-sm text-muted-foreground">Nothing is owed. Capture a receipt or record a bill to start.</p>}
          {dueSoon.map((bill: any) => <div key={bill.id} className="flex items-center gap-3 rounded-lg border bg-white p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{bill.vendorName}</div>
              <div className="truncate text-[11px] text-muted-foreground">{bill.billNumber || "No number"} · due {bill.dueDate || "—"}</div>
            </div>
            {bill.aging !== "current" && <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700">{bill.aging}</span>}
            <div className="text-sm font-semibold">{money(bill.balance)}</div>
          </div>)}
        </CardContent>
      </Card>

      <Card className="bg-white/80">
        <CardHeader><CardTitle>Start here</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          {[
            [Camera, "Photograph a receipt", "capture"],
            [Receipt, "Record a bill", "bills"],
            [Landmark, "Record a payment", "payments"],
            [TrendingUp, "See the reports", "reports"],
          ].map(([Icon, label, target]: any) => <button
            key={label}
            onClick={() => onGo(target)}
            className="flex items-center gap-3 rounded-lg border bg-white p-3 text-left text-sm hover:bg-[#f7f4ed]"
          ><Icon className="h-4 w-4 text-[#ba5c42]" />{label}<ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" /></button>)}
        </CardContent>
      </Card>
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

function CaptureQueue({ accounts, vendors, onPosted, submit }: any) {
  const [captures, setCaptures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<any>(null);
  const [kind, setKind] = useState("receipt");
  const fileRef = useRef<HTMLInputElement>(null);
  const { success, error: toastError, toast } = useToast();

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/captures", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load captures.");
      setCaptures(payload.captures || []);
    } catch (cause) {
      toastError(cause instanceof Error ? cause.message : "Unable to load captures.");
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  async function upload(file: File) {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upload", kind, dataUrl, filename: file.name }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The upload failed.");

      if (payload.extractionFailed) toast(payload.message, "info");
      else if (payload.duplicate) toast("This looks like a document already captured — check before posting.", "info");
      else success("Document read. Review the fields before posting.");

      await load();
      setActive(payload.capture);
    } catch (cause) {
      toastError(cause instanceof Error ? cause.message : "The upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (active) {
    return <CaptureReview
      capture={active}
      accounts={accounts}
      vendors={vendors}
      onClose={() => { setActive(null); void load(); }}
      onPosted={async () => { setActive(null); await load(); await onPosted(); }}
      submit={submit}
    />;
  }

  const pending = captures.filter((item) => ["Needs review", "Duplicate", "Failed"].includes(item.status));

  return <div className="space-y-5">
    <Card className="bg-white/80">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="text-xs font-medium">
            Document type
            <select value={kind} onChange={(event) => setKind(event.target.value)} className="mt-2 block h-10 w-full rounded-lg border bg-white px-3 text-sm sm:w-48">
              <option value="receipt">Receipt</option>
              <option value="invoice">Supplier invoice</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={busy} className="sm:ml-auto">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" />Reading…</> : <><Upload className="h-4 w-4" />Upload receipt</>}
          </Button>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          The image is stored first and read second, so a document is never lost if the reader fails —
          you can always key the fields yourself. Choose an image or PDF; on mobile, your device picker can also offer the camera. Nothing reaches the ledger until you confirm it.
        </p>
      </CardContent>
    </Card>

    <Card className="bg-white/80">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Review queue</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Least confident first</p>
        </div>
        {pending.length > 0 && <span className="rounded-full bg-[#ba5c42] px-2.5 py-1 text-[10px] font-semibold text-white">{pending.length}</span>}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <RowSkeleton rows={3} />}
        {!loading && !captures.length && <p className="py-8 text-center text-sm text-muted-foreground">No documents captured yet.</p>}
        {captures.map((capture) => <button
          key={capture.id}
          onClick={() => setActive(capture)}
          className="flex w-full items-center gap-3 rounded-lg border bg-white p-3 text-left hover:bg-[#f7f4ed]"
        >
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            capture.status === "Posted" ? "bg-emerald-50 text-emerald-600"
              : capture.status === "Failed" ? "bg-amber-50 text-amber-600"
                : capture.status === "Duplicate" ? "bg-red-50 text-red-600"
                  : "bg-[#f4f1e8] text-[#ba5c42]",
          )}>
            {capture.status === "Posted" ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{capture.vendorName || capture.originalFilename || "Unread document"}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {capture.kind} · {capture.documentDate || "no date"} · {capture.status}
              {capture.status === "Duplicate" && " — possible duplicate"}
            </div>
          </div>
          {capture.status !== "Failed" && <ConfidenceDot value={capture.overallConfidence} />}
          <div className="text-sm font-semibold">{capture.total === null ? "—" : money(capture.total)}</div>
        </button>)}
      </CardContent>
    </Card>
  </div>;
}

/** Confidence as a colour, since a number between 0 and 1 means little at a glance. */
function ConfidenceDot({ value }: { value: number }) {
  const tone = value >= 0.85 ? "bg-emerald-500" : value >= 0.6 ? "bg-amber-500" : "bg-red-500";
  return <span title={`Read confidence ${Math.round(value * 100)}%`} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
    <span className={cn("h-2 w-2 rounded-full", tone)} />{Math.round(value * 100)}%
  </span>;
}

function CaptureReview({ capture, accounts, vendors, onClose, onPosted, submit }: any) {
  const [form, setForm] = useState({
    vendorId: capture.vendorId || "",
    vendorName: capture.vendorName || "",
    documentNumber: capture.documentNumber || "",
    documentDate: capture.documentDate || today(),
    subtotal: capture.subtotal ?? "",
    taxAmount: capture.taxAmount ?? "",
    total: capture.total ?? "",
    accountId: "",
    notes: capture.notes || "",
  });
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const { error: toastError, success } = useToast();

  useEffect(() => {
    fetch(`/api/captures?id=${encodeURIComponent(capture.id)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        setDetail(payload);
        const suggested = payload.lines?.[0]?.suggestedAccountId;
        if (suggested) setForm((current) => ({ ...current, accountId: current.accountId || suggested }));
      })
      .catch(() => {});
  }, [capture.id]);

  const expenseAccounts = accounts.filter((account: any) => account.type === "expense");
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const lowConfidence = Object.entries(capture.confidence || {})
    .filter(([, value]) => Number(value) < 0.8)
    .map(([field]) => field);

  async function post() {
    if (!form.vendorId) { toastError("Choose which vendor this is from, or create one first."); return; }
    if (!form.accountId) { toastError("Choose which expense account this belongs to."); return; }
    if (!Number(form.total)) { toastError("Enter the document total."); return; }

    setBusy(true);
    const subtotal = Number(form.subtotal) || Number(form.total);
    const taxAmount = Number(form.taxAmount) || 0;
    const result = await submit({
      resource: "bill",
      operation: "create",
      data: {
        vendorId: form.vendorId,
        billNumber: form.documentNumber,
        billDate: form.documentDate,
        captureId: capture.id,
        notes: form.notes,
        lines: [{
          accountId: form.accountId,
          description: form.documentNumber ? `${capture.kind} ${form.documentNumber}` : `${capture.kind} from ${form.vendorName}`,
          quantity: 1,
          unitPrice: subtotal,
          // The rate is derived from the amounts actually read rather than
          // assuming a standard SST rate that may not apply.
          taxRate: subtotal > 0 ? Number(((taxAmount / subtotal) * 100).toFixed(3)) : 0,
        }],
      },
    }, "Posted to the ledger.");
    setBusy(false);
    if (result) { success("Bill created from the captured document."); await onPosted(); }
  }

  async function reject() {
    setBusy(true);
    await fetch("/api/captures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", id: capture.id, reason: "Rejected in review" }),
    }).catch(() => {});
    setBusy(false);
    onClose();
  }

  return <div className="space-y-5">
    <button onClick={onClose} className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-3.5 w-3.5" />Back to the queue
    </button>

    {capture.status === "Duplicate" && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Same vendor, date and total as a document already captured. Check before posting, or reject this one.</span>
    </div>}

    {capture.extractionError && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Could not read this automatically ({capture.extractionError}). Enter the details from the image.</span>
    </div>}

    {capture.warnings?.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <ul className="list-disc space-y-1 pl-4">{capture.warnings.map((warning: string) => <li key={warning}>{warning}</li>)}</ul>
    </div>}

    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="bg-white/80">
        <CardHeader><CardTitle>The document</CardTitle></CardHeader>
        <CardContent>
          {capture.imageUrl
            ? <img src={capture.imageUrl} alt="Captured document" className="max-h-[560px] w-full rounded-lg border object-contain" />
            : <p className="text-sm text-muted-foreground">No image stored.</p>}
        </CardContent>
      </Card>

      <Card className="bg-white/80">
        <CardHeader>
          <CardTitle>Check the details</CardTitle>
          {lowConfidence.length > 0 && <p className="mt-1 text-xs text-[#ba5c42]">Read with low confidence: {lowConfidence.join(", ")}. Verify against the image.</p>}
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Vendor" flagged={lowConfidence.includes("vendorName")}>
            <select value={form.vendorId} onChange={(event) => set({ vendorId: event.target.value })} className="h-10 w-full rounded-lg border bg-white px-3 text-sm">
              <option value="">Select a vendor…</option>
              {vendors.map((vendor: any) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </select>
            {capture.vendorName && !form.vendorId && <p className="mt-1.5 text-[11px] text-muted-foreground">Read as “{capture.vendorName}” — no matching vendor yet. Create one in the Vendors tab.</p>}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Document number" flagged={lowConfidence.includes("documentNumber")}>
              <input value={form.documentNumber} onChange={(event) => set({ documentNumber: event.target.value })} className="h-10 w-full rounded-lg border bg-white px-3 text-sm" />
            </Field>
            <Field label="Date" flagged={lowConfidence.includes("documentDate")}>
              <DateInput value={form.documentDate} onChange={(event) => set({ documentDate: event.target.value })} className="h-10 rounded-lg" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Subtotal" flagged={lowConfidence.includes("subtotal")}>
              <input type="number" step="0.01" value={form.subtotal} onChange={(event) => set({ subtotal: event.target.value })} className="h-10 w-full rounded-lg border bg-white px-3 text-sm" />
            </Field>
            <Field label="Tax" flagged={lowConfidence.includes("taxAmount")}>
              <input type="number" step="0.01" value={form.taxAmount} onChange={(event) => set({ taxAmount: event.target.value })} className="h-10 w-full rounded-lg border bg-white px-3 text-sm" />
            </Field>
            <Field label="Total" flagged={lowConfidence.includes("total")}>
              <input type="number" step="0.01" value={form.total} onChange={(event) => set({ total: event.target.value })} className="h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold" />
            </Field>
          </div>

          <Field label="Expense account">
            <select value={form.accountId} onChange={(event) => set({ accountId: event.target.value })} className="h-10 w-full rounded-lg border bg-white px-3 text-sm">
              <option value="">Select an account…</option>
              {expenseAccounts.map((account: any) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
            </select>
          </Field>

          {capture.kind === "cheque" && (capture.chequeNumber || capture.chequePayee) && <div className="rounded-lg border bg-[#faf8f3] p-3 text-xs">
            <div className="font-medium">Cheque details read</div>
            <div className="mt-1 text-muted-foreground">
              {capture.chequeNumber && <>No. {capture.chequeNumber}<br /></>}
              {capture.chequePayee && <>Payee: {capture.chequePayee}<br /></>}
              {capture.chequeAmountWords && <>In words: {capture.chequeAmountWords}</>}
            </div>
          </div>}

          {detail?.lines?.length > 0 && <div className="rounded-lg border">
            <div className="border-b bg-[#faf8f3] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lines read</div>
            <div className="max-h-40 overflow-y-auto">
              {detail.lines.map((line: any) => <div key={line.id} className="flex justify-between gap-3 border-b px-3 py-2 text-xs last:border-b-0">
                <span className="min-w-0 truncate">{line.description || "—"}</span>
                <span className="shrink-0 font-medium">{money(line.amount)}</span>
              </div>)}
            </div>
          </div>}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={post} disabled={busy || capture.status === "Posted"}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {capture.status === "Posted" ? "Already posted" : "Confirm and post"}
            </Button>
            <Button variant="outline" className="bg-white" onClick={reject} disabled={busy}><X className="h-4 w-4" />Reject</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>;
}

function Field({ label, flagged, children }: { label: string; flagged?: boolean; children: React.ReactNode }) {
  return <Label className="block">
    <span className={cn("mb-2 flex items-center gap-1.5", flagged && "text-[#ba5c42]")}>
      {label}
      {flagged && <AlertTriangle className="h-3 w-3" />}
    </span>
    {children}
  </Label>;
}

// ---------------------------------------------------------------------------
// Bills, vendors, payments, journal
// ---------------------------------------------------------------------------

function Bills({ data, loading, submit }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vendorId: "", billNumber: "", billDate: today(), dueDate: "", accountId: "", description: "", amount: "", taxRate: "0" });
  const set = (patch: any) => setForm((current) => ({ ...current, ...patch }));

  async function create() {
    const result = await submit({
      resource: "bill", operation: "create",
      data: {
        vendorId: form.vendorId, billNumber: form.billNumber, billDate: form.billDate, dueDate: form.dueDate,
        lines: [{ accountId: form.accountId, description: form.description, quantity: 1, unitPrice: Number(form.amount), taxRate: Number(form.taxRate) }],
      },
    }, "Bill recorded and posted.");
    if (result) { setOpen(false); setForm({ vendorId: "", billNumber: "", billDate: today(), dueDate: "", accountId: "", description: "", amount: "", taxRate: "0" }); }
  }

  return <div className="space-y-5">
    <div className="flex justify-end"><Button onClick={() => setOpen(!open)}><Plus className="h-4 w-4" />Record a bill</Button></div>

    {open && <Card className="bg-white/80"><CardContent className="grid gap-4 p-5 md:grid-cols-2">
      <label className="text-xs font-medium">Vendor
        <select value={form.vendorId} onChange={(event) => set({ vendorId: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm">
          <option value="">Select…</option>
          {data.vendors.map((vendor: any) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium">Their invoice number
        <input value={form.billNumber} onChange={(event) => set({ billNumber: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">Bill date
        <DateInput value={form.billDate} onChange={(event) => set({ billDate: event.target.value })} className="mt-2 h-10 rounded-lg" />
      </label>
      <label className="text-xs font-medium">Due date <span className="text-muted-foreground">(defaults to the vendor's terms)</span>
        <DateInput value={form.dueDate} onChange={(event) => set({ dueDate: event.target.value })} className="mt-2 h-10 rounded-lg" />
      </label>
      <label className="text-xs font-medium">Expense account
        <select value={form.accountId} onChange={(event) => set({ accountId: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm">
          <option value="">Select…</option>
          {data.accounts.filter((a: any) => a.type === "expense").map((account: any) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium">Description
        <input value={form.description} onChange={(event) => set({ description: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">Amount before tax
        <input type="number" step="0.01" value={form.amount} onChange={(event) => set({ amount: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">Tax rate %
        <input type="number" step="0.01" value={form.taxRate} onChange={(event) => set({ taxRate: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <div className="md:col-span-2"><Button onClick={create}>Post the bill</Button></div>
    </CardContent></Card>}

    <div className="space-y-3">
      {loading && <RowSkeleton rows={4} />}
      {!loading && !data.bills.length && <Card className="bg-white/80"><CardContent className="p-12 text-center text-sm text-muted-foreground">No bills yet.</CardContent></Card>}
      {data.bills.map((bill: any) => <Card key={bill.id} className="bg-white/80"><CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <div className="min-w-0">
          <div className="truncate font-medium">{bill.vendorName}</div>
          <div className="truncate text-[11px] text-muted-foreground">{bill.billNumber || "No number"} · {bill.billDate} · due {bill.dueDate || "—"}</div>
        </div>
        <span className={cn(
          "justify-self-start rounded-full px-2.5 py-1 text-[10px] font-medium sm:justify-self-auto",
          bill.status === "Paid" ? "bg-emerald-50 text-emerald-700"
            : bill.aging !== "current" ? "bg-red-50 text-red-700" : "bg-[#eeeae0] text-[#5a605a]",
        )}>{bill.status}{bill.aging !== "current" && bill.status !== "Paid" ? ` · ${bill.aging}` : ""}</span>
        <div className="text-right">
          <div className="font-semibold">{money(bill.total)}</div>
          {bill.amountPaid > 0 && bill.balance > 0 && <div className="text-[11px] text-muted-foreground">{money(bill.balance)} left</div>}
        </div>
      </CardContent></Card>)}
    </div>
  </div>;
}

function Vendors({ data, loading, submit }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", tin: "", sstNumber: "", email: "", phone: "", paymentTermsDays: "30", defaultExpenseAccountId: "" });
  const set = (patch: any) => setForm((current) => ({ ...current, ...patch }));

  async function create() {
    const result = await submit({ resource: "vendor", operation: "create", data: form }, "Vendor added.");
    if (result) { setOpen(false); setForm({ name: "", tin: "", sstNumber: "", email: "", phone: "", paymentTermsDays: "30", defaultExpenseAccountId: "" }); }
  }

  return <div className="space-y-5">
    <div className="flex justify-end"><Button onClick={() => setOpen(!open)}><Plus className="h-4 w-4" />Add a vendor</Button></div>

    {open && <Card className="bg-white/80"><CardContent className="grid gap-4 p-5 md:grid-cols-2">
      <label className="text-xs font-medium">Name
        <input value={form.name} onChange={(event) => set({ name: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">TIN <span className="text-muted-foreground">(needed for e-Invoice)</span>
        <input value={form.tin} onChange={(event) => set({ tin: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">SST number
        <input value={form.sstNumber} onChange={(event) => set({ sstNumber: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">Email
        <input value={form.email} onChange={(event) => set({ email: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">Payment terms (days)
        <input type="number" value={form.paymentTermsDays} onChange={(event) => set({ paymentTermsDays: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">Usual expense account
        <select value={form.defaultExpenseAccountId} onChange={(event) => set({ defaultExpenseAccountId: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm">
          <option value="">None</option>
          {data.accounts.filter((a: any) => a.type === "expense").map((account: any) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
        </select>
      </label>
      <div className="md:col-span-2"><Button onClick={create}>Save vendor</Button></div>
    </CardContent></Card>}

    <div className="grid gap-3 md:grid-cols-2">
      {loading && <RowSkeleton rows={4} />}
      {!loading && !data.vendors.length && <Card className="bg-white/80 md:col-span-2"><CardContent className="p-12 text-center text-sm text-muted-foreground">No vendors yet. Add the suppliers you pay.</CardContent></Card>}
      {data.vendors.map((vendor: any) => <Card key={vendor.id} className="bg-white/80"><CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{vendor.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{vendor.email || "No email"} · {vendor.paymentTermsDays} day terms</div>
          </div>
          {!vendor.tin && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] text-amber-700">No TIN</span>}
        </div>
      </CardContent></Card>)}
    </div>
  </div>;
}

function Payments({ data, loading, submit }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ direction: "out", paymentDate: today(), bankAccountId: "", vendorId: "", amount: "", method: "Bank transfer", reference: "", billId: "" });
  const set = (patch: any) => setForm((current) => ({ ...current, ...patch }));

  const openBills = data.bills.filter((bill: any) => bill.vendorId === form.vendorId && Number(bill.balance) > 0);

  async function create() {
    const allocations = form.billId ? [{ billId: form.billId, amount: Number(form.amount) }] : [];
    const result = await submit({
      resource: "payment", operation: "create",
      data: { ...form, amount: Number(form.amount), allocations },
    }, "Payment recorded and posted.");
    if (result) { setOpen(false); setForm({ direction: "out", paymentDate: today(), bankAccountId: "", vendorId: "", amount: "", method: "Bank transfer", reference: "", billId: "" }); }
  }

  return <div className="space-y-5">
    <div className="flex justify-end"><Button onClick={() => setOpen(!open)}><Plus className="h-4 w-4" />Record a payment</Button></div>

    {open && <Card className="bg-white/80"><CardContent className="grid gap-4 p-5 md:grid-cols-2">
      <label className="text-xs font-medium">Direction
        <select value={form.direction} onChange={(event) => set({ direction: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm">
          <option value="out">Money out — paying a supplier</option>
          <option value="in">Money in — receiving from a client</option>
        </select>
      </label>
      <label className="text-xs font-medium">Date
        <DateInput value={form.paymentDate} onChange={(event) => set({ paymentDate: event.target.value })} className="mt-2 h-10 rounded-lg" />
      </label>
      <label className="text-xs font-medium">From / to account
        <select value={form.bankAccountId} onChange={(event) => set({ bankAccountId: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm">
          <option value="">Select…</option>
          {data.accounts.filter((a: any) => a.isBank).map((account: any) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
        </select>
      </label>
      {form.direction === "out" && <label className="text-xs font-medium">Vendor
        <select value={form.vendorId} onChange={(event) => set({ vendorId: event.target.value, billId: "" })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm">
          <option value="">Select…</option>
          {data.vendors.map((vendor: any) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
        </select>
      </label>}
      {form.direction === "out" && openBills.length > 0 && <label className="text-xs font-medium">Settle which bill
        <select value={form.billId} onChange={(event) => { const bill = openBills.find((b: any) => b.id === event.target.value); set({ billId: event.target.value, amount: bill ? String(bill.balance) : form.amount }); }} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm">
          <option value="">Leave unallocated</option>
          {openBills.map((bill: any) => <option key={bill.id} value={bill.id}>{bill.billNumber || bill.billDate} — {money(bill.balance)} outstanding</option>)}
        </select>
      </label>}
      <label className="text-xs font-medium">Amount
        <input type="number" step="0.01" value={form.amount} onChange={(event) => set({ amount: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">Reference
        <input value={form.reference} onChange={(event) => set({ reference: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <div className="md:col-span-2"><Button onClick={create}>Post the payment</Button></div>
    </CardContent></Card>}

    <div className="space-y-3">
      {loading && <RowSkeleton rows={4} />}
      {!loading && !data.payments.length && <Card className="bg-white/80"><CardContent className="p-12 text-center text-sm text-muted-foreground">No payments recorded yet.</CardContent></Card>}
      {data.payments.map((payment: any) => <Card key={payment.id} className="bg-white/80"><CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", payment.direction === "out" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")}>
          {payment.direction === "out" ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{payment.vendorName || payment.customerName || "Unallocated"}</div>
          <div className="truncate text-[11px] text-muted-foreground">{payment.paymentDate} · {payment.method} · {payment.bankAccountName}</div>
        </div>
        <div className={cn("font-semibold", payment.direction === "out" ? "text-red-600" : "text-emerald-700")}>
          {payment.direction === "out" ? "−" : "+"}{money(payment.amount)}
        </div>
      </CardContent></Card>)}
    </div>
  </div>;
}

/**
 * General ledger: one account, every posting against it, balance carried down.
 *
 * The Journal below answers "what was posted"; this answers the question an
 * accountant actually asks — "what has gone through 1100 Accounts receivable,
 * and what does it stand at". Without it, checking an account meant reading
 * every entry and doing the arithmetic by hand.
 */
function GeneralLedger({ accounts }: { accounts: any[] }) {
  const [accountId, setAccountId] = useState("");
  const [ledger, setLedger] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accountId) { setLedger(null); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/accounting?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => { if (!cancelled) setLedger(payload.error ? null : payload); })
      .catch(() => { if (!cancelled) setLedger(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accountId]);

  return <Card className="bg-white/80">
    <CardHeader>
      <CardTitle>General ledger</CardTitle>
      <p className="mt-1 text-xs text-muted-foreground">Pick an account to see everything posted to it, with the balance carried down.</p>
    </CardHeader>
    <CardContent>
      <Label className="block sm:max-w-sm">
        <span className="mb-2 block">Account</span>
        <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="">Choose an account</option>
          {accounts.map((account: any) => <option key={account.id} value={account.id}>
            {account.code} {account.name}
          </option>)}
        </Select>
      </Label>

      {loading && <p className="mt-4 text-xs text-muted-foreground">Reading the ledger…</p>}

      {ledger && !loading && <div className="mt-4 overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-[#faf8f3] text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 text-right font-medium">Debit</th>
              <th className="px-3 py-2 text-right font-medium">Credit</th>
              <th className="px-3 py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {!ledger.lines.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Nothing has posted to this account.</td></tr>}
            {ledger.lines.map((line: any, index: number) => <tr key={`${line.entryId}-${index}`} className="border-t">
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{line.date}</td>
              <td className="px-3 py-2">
                {line.memo || line.reference || "Posting"}
                {line.customerName && <span className="ml-1 text-muted-foreground">· {line.customerName}</span>}
              </td>
              <td className="px-3 py-2 capitalize text-muted-foreground">{String(line.sourceType).replace(/_/g, " ")}</td>
              <td className="px-3 py-2 text-right tabular-nums">{toCents(line.debit) ? money(line.debit) : ""}</td>
              <td className="px-3 py-2 text-right tabular-nums">{toCents(line.credit) ? money(line.credit) : ""}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{money(line.balance)}</td>
            </tr>)}
          </tbody>
          <tfoot>
            <tr className="border-t bg-[#faf8f3] font-semibold">
              <td className="px-3 py-2" colSpan={5}>Closing balance · {ledger.account.code} {ledger.account.name}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(ledger.closing)}</td>
            </tr>
          </tfoot>
        </table>
      </div>}
    </CardContent>
  </Card>;
}

function Journal({ data, submit }: any) {
  const [lines, setLines] = useState<any[] | null>(null);
  const [openId, setOpenId] = useState("");

  async function toggle(id: string) {
    if (openId === id) { setOpenId(""); setLines(null); return; }
    setOpenId(id);
    const response = await fetch(`/api/accounting?entryId=${encodeURIComponent(id)}`, { cache: "no-store" });
    const payload = await response.json();
    setLines(payload.lines || []);
  }

  return <div className="space-y-3">
    <GeneralLedger accounts={data.accounts} />
    <p className="text-xs text-muted-foreground">Every posting, newest first. Voiding writes a reversing entry rather than deleting, so the trail stays intact.</p>
    {!data.entries.length && <Card className="bg-white/80"><CardContent className="p-12 text-center text-sm text-muted-foreground">Nothing posted yet.</CardContent></Card>}
    {data.entries.map((entry: any) => <Card key={entry.id} className="bg-white/80"><CardContent className="p-4">
      <button onClick={() => toggle(entry.id)} className="flex w-full items-center gap-3 text-left">
        <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{entry.memo || entry.reference || "Journal entry"}</div>
          <div className="truncate text-[11px] text-muted-foreground">{entry.date} · {entry.sourceType}{entry.status !== "Posted" ? ` · ${entry.status}` : ""}</div>
        </div>
        <div className="shrink-0 font-semibold">{money(entry.total)}</div>
      </button>
      {openId === entry.id && lines && <div className="mt-3 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead className="bg-[#faf8f3] text-muted-foreground"><tr>
            <th className="px-3 py-2">Account</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th>
          </tr></thead>
          <tbody>{lines.map((line: any) => <tr key={line.id} className="border-t">
            <td className="px-3 py-2">{line.accountCode} · {line.accountName}{line.memo && <div className="text-[10px] text-muted-foreground">{line.memo}</div>}</td>
            <td className="px-3 py-2 text-right">{line.debit ? money(line.debit) : ""}</td>
            <td className="px-3 py-2 text-right">{line.credit ? money(line.credit) : ""}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {openId === entry.id && entry.status === "Posted" && <div className="mt-3">
        <Button variant="outline" size="sm" className="bg-white" onClick={() => submit({ resource: "journal", operation: "void", data: { id: entry.id, reason: "Voided from the journal" } }, "Entry reversed.")}>
          <Trash2 className="h-3.5 w-3.5 text-red-500" />Void with a reversing entry
        </Button>
      </div>}
    </CardContent></Card>)}
  </div>;
}

function Reports() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/accounting/reports", { cache: "no-store" })
      .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => { if (!ok) throw new Error(payload.error); setReport(payload); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Reports are unavailable."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <StatSkeleton key={i} />)}</div>;
  if (error) return <Card className="bg-white/80"><CardContent className="p-8 text-center text-sm text-red-600">{error}</CardContent></Card>;
  if (!report) return null;

  const { profitAndLoss: pl, balanceSheet: bs } = report;

  return <div className="space-y-5">
    <PeriodReview />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Income" value={money(pl.totalIncome)} note={`${report.range.from} → ${report.range.to}`} icon={TrendingUp} />
      <Stat label="Expenses" value={money(pl.totalExpense)} note="Same period" icon={TrendingDown} />
      <Stat label="Net profit" value={money(pl.netProfit)} note={pl.netProfit >= 0 ? "Profitable" : "At a loss"} tone={pl.netProfit < 0 ? "bad" : undefined} icon={CircleDollarSign} />
      <Stat label="Cash at bank" value={money(report.cash)} note={`${report.bankAccounts.length} accounts`} icon={Landmark} />
    </div>

    {!report.trialBalance.balanced && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>The ledger is out of balance by {money(report.trialBalance.difference)}. Something wrote to the journal without going through the posting engine.</span>
    </div>}

    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="bg-white/80">
        <CardHeader><CardTitle>Profit and loss</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {pl.income.map((row: any) => <Row key={row.accountId} label={`${row.code} ${row.name}`} value={money(row.balance)} />)}
          <Row label="Total income" value={money(pl.totalIncome)} bold />
          <div className="h-3" />
          {pl.expenses.map((row: any) => <Row key={row.accountId} label={`${row.code} ${row.name}`} value={money(row.balance)} />)}
          <Row label="Total expenses" value={money(pl.totalExpense)} bold />
          <div className="h-3" />
          <Row label="Net profit" value={money(pl.netProfit)} bold highlight />
        </CardContent>
      </Card>

      <Card className="bg-white/80">
        <CardHeader><CardTitle>Balance sheet</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {bs.assets.map((row: any) => <Row key={row.accountId} label={`${row.code} ${row.name}`} value={money(row.balance)} />)}
          <Row label="Total assets" value={money(bs.totalAssets)} bold />
          <div className="h-3" />
          {bs.liabilities.map((row: any) => <Row key={row.accountId} label={`${row.code} ${row.name}`} value={money(row.balance)} />)}
          <Row label="Total liabilities" value={money(bs.totalLiabilities)} bold />
          <div className="h-3" />
          {bs.equity.map((row: any) => <Row key={row.accountId} label={`${row.code} ${row.name}`} value={money(row.balance)} />)}
          <Row label="Profit this period" value={money(bs.currentEarnings)} />
          <Row label="Total equity" value={money(bs.totalEquity)} bold />
          {Math.abs(bs.outOfBalance) > 0.005 && <Row label="Out of balance" value={money(bs.outOfBalance)} bold />}
        </CardContent>
      </Card>
    </div>

    <div className="grid gap-5 lg:grid-cols-2">
      <AgedCard
        title="Owed to suppliers"
        note="Oldest first. Chase from the bottom of the list."
        aged={report.payable}
        nameOf={(row: any) => row.vendor_name || "Supplier"}
        referenceOf={(row: any) => row.bill_number || ""}
        totalLabel="Total payable"
      />
      <AgedCard
        title="Owed by clients"
        note="Oldest first. Chase from the bottom of the list."
        aged={report.receivable}
        nameOf={(row: any) => row.customer_name || "Client"}
        referenceOf={(row: any) => row.reference || row.title || ""}
        totalLabel="Total receivable"
      />
    </div>

    <TrialBalanceCard trialBalance={report.trialBalance} range={report.range} />

    <Card className="bg-white/80">
      <CardHeader>
        <CardTitle>Profit by client</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">Income and directly attributed costs, from journal lines tagged to each client.</p>
      </CardHeader>
      <CardContent>
        {!report.clients.length && <p className="py-6 text-center text-sm text-muted-foreground">No client-tagged postings in this period yet.</p>}
        {report.clients.length > 0 && <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead className="bg-[#faf8f3] text-muted-foreground"><tr>
              <th className="px-3 py-2">Client</th><th className="px-3 py-2 text-right">Income</th>
              <th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Margin</th><th className="px-3 py-2 text-right">%</th>
            </tr></thead>
            <tbody>{report.clients.map((client: any) => <tr key={client.id} className="border-t">
              <td className="px-3 py-2 font-medium">{client.name}</td>
              <td className="px-3 py-2 text-right">{money(client.income)}</td>
              <td className="px-3 py-2 text-right">{money(client.cost)}</td>
              <td className={cn("px-3 py-2 text-right font-semibold", client.margin < 0 && "text-red-600")}>{money(client.margin)}</td>
              <td className="px-3 py-2 text-right">{client.marginPercent}%</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </CardContent>
    </Card>
  </div>;
}

/**
 * Month-end review.
 *
 * Every item is detected in code against the ledger; the AI ranks and explains
 * them. When the service is unavailable the same items appear with a plainer
 * description, so the review is never empty just because AI is down.
 */
function PeriodReview() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/accounting/insights", { cache: "no-store" })
      .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => { if (!ok) throw new Error(payload.error); setData(payload); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Review unavailable."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Card className="bg-[#26342b] text-white"><CardContent className="flex items-center gap-3 p-6 text-sm">
    <Loader2 className="h-4 w-4 animate-spin" />Reviewing the ledger…
  </CardContent></Card>;
  if (error || !data) return null;

  const { review, signals } = data;
  const tone = (severity: string) => severity === "high" ? "bg-red-400" : severity === "medium" ? "bg-amber-300" : "bg-white/30";

  return <Card className="overflow-hidden bg-[#26342b] text-white"><CardContent className="p-6">
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.2em] text-white/45">
      <Sparkles className="h-3.5 w-3.5 text-[#ef9a75]" />Month-end review · {data.period}
    </div>
    <h2 className="mt-4 max-w-2xl text-xl font-medium leading-snug">{review.headline}</h2>
    {review.commentary && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">{review.commentary}</p>}

    {review.actions?.length > 0 && <div className="mt-6 space-y-3">
      {review.actions.map((action: any, index: number) => <div key={index} className="flex gap-3 text-sm">
        <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", tone(action.severity))} />
        <span className="min-w-0">
          <span className="font-medium text-white">{action.title}</span>
          {action.detail && <span className="ml-2 text-white/65">{action.detail}</span>}
        </span>
      </div>)}
    </div>}

    <div className="mt-6 flex flex-wrap items-center gap-3 text-[10px] text-white/35">
      <span>{signals.length} check{signals.length === 1 ? "" : "s"} run against the ledger</span>
      <span>·</span>
      <span>
        {review.source === "ai-nonymauz-cloud"
          ? "Prioritised by ai-nonymauz-cloud from figures calculated here — it never computes a number"
          : "AI unavailable, so this is the plain computed review"}
      </span>
    </div>
  </CardContent></Card>;
}

const BUCKET_LABEL: Record<string, string> = {
  current: "Not yet due",
  "1-30": "1-30 days overdue",
  "31-60": "31-60 days overdue",
  "61-90": "61-90 days overdue",
  "90+": "Over 90 days overdue",
};

/**
 * Aged balances with the documents behind them.
 *
 * The totals alone said "RM 8,400 is 31-60 days overdue" without saying whose,
 * which is not something anyone can act on. The API has always returned the
 * individual documents; this shows them, oldest bucket first, because that is
 * the order you work a debtors list in.
 */
function AgedCard({ title, note, aged, nameOf, referenceOf, totalLabel }: {
  title: string;
  note: string;
  aged: { buckets: Record<string, number>; items: any[]; total: number };
  nameOf: (row: any) => string;
  referenceOf: (row: any) => string;
  totalLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const order = ["90+", "61-90", "31-60", "1-30", "current"];
  const overdue = order
    .filter((bucket) => bucket !== "current")
    .reduce((sum, bucket) => sum + toCents(aged.buckets[bucket] || 0), 0);

  return <Card className="bg-white/80">
    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>{title}</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </div>
      {aged.items.length > 0 && <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
        {open ? "Hide detail" : `Show ${aged.items.length}`}
      </Button>}
    </CardHeader>
    <CardContent className="space-y-1 text-sm">
      {order.map((bucket) => <Row
        key={bucket}
        label={BUCKET_LABEL[bucket] ?? bucket}
        value={money(aged.buckets[bucket] || 0)}
        highlight={bucket === "90+" && toCents(aged.buckets[bucket] || 0) > 0}
      />)}
      <Row label={totalLabel} value={money(aged.total)} bold />
      {overdue > 0 && <Row label="Of which overdue" value={money(fromCents(overdue))} />}

      {open && <div className="mt-3 overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-[#faf8f3] text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Reference</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 text-right font-medium">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {[...aged.items]
              // Oldest due date first: the top of the list is what to chase.
              .sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")))
              .map((row: any) => <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{nameOf(row)}</td>
                <td className="px-3 py-2 text-muted-foreground">{referenceOf(row)}</td>
                <td className={cn("px-3 py-2", row.bucket !== "current" && "text-[#ba5c42]")}>
                  {isoDate(row.due_date) || "No date"}
                  {row.bucket !== "current" && <span className="ml-1 text-[10px]">({row.bucket})</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(row.outstanding)}</td>
              </tr>)}
          </tbody>
        </table>
      </div>}
    </CardContent>
  </Card>;
}

/**
 * The trial balance every account, both columns and the totals.
 *
 * The API has always computed these rows; the page used only the balanced flag
 * to decide whether to show a warning, and threw the rest away. This is the
 * report an accountant asks for first, and the one that shows *where* an
 * imbalance is rather than only that there is one.
 */
function TrialBalanceCard({ trialBalance, range }: { trialBalance: any; range: { from: string; to: string } }) {
  const [open, setOpen] = useState(false);
  const rows = (trialBalance.rows || []).filter(
    (row: any) => toCents(row.debit) !== 0 || toCents(row.credit) !== 0,
  );

  return <Card className="bg-white/80">
    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>Trial balance</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Every account with a movement to {range.to}. Debits and credits must agree.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
        {open ? "Hide" : "Show"}
      </Button>
    </CardHeader>
    <CardContent>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span>Total debits <span className="font-medium tabular-nums">{money(trialBalance.debit)}</span></span>
        <span>Total credits <span className="font-medium tabular-nums">{money(trialBalance.credit)}</span></span>
        <span className={cn(trialBalance.balanced ? "text-muted-foreground" : "font-semibold text-red-700")}>
          {trialBalance.balanced ? "In balance" : `Out by ${money(trialBalance.difference)}`}
        </span>
      </div>

      {open && <div className="mt-4 overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-[#faf8f3] text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 text-right font-medium">Debit</th>
              <th className="px-3 py-2 text-right font-medium">Credit</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nothing has posted yet.</td></tr>}
            {rows.map((row: any) => <tr key={row.accountId} className="border-t">
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.code}</td>
              <td className="px-3 py-2">{row.name}</td>
              <td className="px-3 py-2 capitalize text-muted-foreground">{row.type}</td>
              <td className="px-3 py-2 text-right tabular-nums">{toCents(row.debit) ? money(row.debit) : ""}</td>
              <td className="px-3 py-2 text-right tabular-nums">{toCents(row.credit) ? money(row.credit) : ""}</td>
            </tr>)}
          </tbody>
          <tfoot>
            <tr className="border-t bg-[#faf8f3] font-semibold">
              <td className="px-3 py-2" colSpan={3}>Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(trialBalance.debit)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(trialBalance.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>}
    </CardContent>
  </Card>;
}

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return <div className={cn(
    "flex justify-between gap-4 py-1",
    bold && "border-t pt-2 font-semibold",
    highlight && "text-[#ba5c42]",
  )}>
    <span className="min-w-0 truncate">{label}</span>
    <span className="shrink-0 tabular-nums">{value}</span>
  </div>;
}

// ---------------------------------------------------------------------------
// Money in / out, settlements and the chart of accounts
// ---------------------------------------------------------------------------

/**
 * Direct cash movements — the old Finance tab, now posting to the ledger.
 *
 * The Finance tab recorded a type, a free-text category and an amount. It never
 * asked which bank account moved, so its log could never be reconciled against a
 * statement, and the category could not be rolled into a profit and loss. Both
 * are now required, which is the whole difference between a cash list and
 * accounting.
 */
function Transactions({ data, loading, submit }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    direction: "out", date: today(), amount: "", bankAccountId: "", ledgerAccountId: "",
    reference: "", memo: "", customerId: "",
  });
  const set = (patch: any) => setForm((current) => ({ ...current, ...patch }));
  const rows = data.transactions ?? [];

  // Money in is categorised against income, money out against expenses. Equity
  // accounts are offered too, so owner drawings have somewhere honest to go.
  const categories = data.accounts.filter((account: any) =>
    account.type === (form.direction === "in" ? "income" : "expense") || account.type === "equity");

  async function create() {
    const result = await submit({ resource: "cash", operation: "create", data: { ...form, amount: Number(form.amount) } }, "Recorded and posted.");
    if (result) { setOpen(false); set({ amount: "", reference: "", memo: "" }); }
  }

  return <div className="space-y-5">
    <div className="flex justify-end"><Button onClick={() => setOpen(!open)}><Plus className="h-4 w-4" />Record money in or out</Button></div>

    {open && <Card className="bg-white/80"><CardContent className="grid gap-4 p-5 md:grid-cols-2">
      <label className="text-xs font-medium">Direction
        <select value={form.direction} onChange={(event) => set({ direction: event.target.value, ledgerAccountId: "" })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm">
          <option value="out">Money out</option>
          <option value="in">Money in</option>
        </select>
      </label>
      <label className="text-xs font-medium">Date
        <DateInput value={form.date} onChange={(event) => set({ date: event.target.value })} className="mt-2 h-10 rounded-lg" />
      </label>
      <label className="text-xs font-medium">Bank or cash account
        <select value={form.bankAccountId} onChange={(event) => set({ bankAccountId: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm">
          <option value="">Select…</option>
          {data.accounts.filter((a: any) => a.isBank).map((account: any) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium">Category
        <select value={form.ledgerAccountId} onChange={(event) => set({ ledgerAccountId: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm">
          <option value="">Select…</option>
          {categories.map((account: any) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium">Amount
        <input type="number" step="0.01" value={form.amount} onChange={(event) => set({ amount: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">Reference
        <input value={form.reference} onChange={(event) => set({ reference: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium md:col-span-2">Description
        <input value={form.memo} onChange={(event) => set({ memo: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <div className="md:col-span-2">
        <Button onClick={create}>Post it</Button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          For a supplier invoice use Bills, and for a customer invoice use Sales — those clear the amount owed.
          This is for money that moves without a document: bank charges, interest, a cash sale, owner drawings.
        </p>
      </div>
    </CardContent></Card>}

    <div className="space-y-3">
      {loading && <RowSkeleton rows={4} />}
      {!loading && !rows.length && <Card className="bg-white/80"><CardContent className="p-12 text-center text-sm text-muted-foreground">Nothing recorded yet.</CardContent></Card>}
      {rows.map((item: any) => <Card key={item.id} className="bg-white/80"><CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", item.type === "Expense" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")}>
          {item.type === "Expense" ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.ledgerAccountName || item.category}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {item.date} · {item.customerName || item.bankAccountName || "Kretivco"}
            {item.reference ? ` · ${item.reference}` : ""}
          </div>
        </div>
        {!item.onLedger && <span title="Recorded before the ledger existed, so it is not in the reports" className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] text-amber-700">Not on ledger</span>}
        <div className={cn("shrink-0 font-semibold", item.type === "Expense" ? "text-red-600" : "text-emerald-700")}>
          {item.type === "Expense" ? "−" : "+"}{money(item.amount)}
        </div>
      </CardContent></Card>)}
    </div>
  </div>;
}

/**
 * Weekly settlements — Kretivco's own income under a client MoU.
 *
 * Created and edited here rather than in the Business workspace, because a
 * settlement is units times a fee plus reimbursement and incentive: arithmetic
 * on money with no workflow outside it. Splitting the editor from the ledger
 * status meant checking one screen and correcting on another.
 */
function Settlements({ data, loading, submit }: any) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string>("");
  const blank = { customerId: "", periodStart: "", periodEnd: "", units: "", feePerUnit: "2", adReimbursement: "0", incentive: "0", dueDate: "", notes: "" };
  const [form, setForm] = useState<any>(blank);
  const set = (patch: any) => setForm((current: any) => ({ ...current, ...patch }));

  const rows = data.settlements ?? [];
  const unposted = rows.filter((item: any) => item.status === "Paid" && !item.onLedger);
  const preview = (Number(form.units) || 0) * (Number(form.feePerUnit) || 0)
    + (Number(form.adReimbursement) || 0) + (Number(form.incentive) || 0);

  function edit(item: any) {
    setEditing(item.id);
    setForm({
      customerId: item.customerId, periodStart: item.periodStart, periodEnd: item.periodEnd,
      units: String(item.units), feePerUnit: String(item.feePerUnit),
      adReimbursement: String(item.adReimbursement), incentive: String(item.incentive),
      dueDate: item.dueDate || "", notes: item.notes || "",
    });
    setOpen(true);
  }

  async function save() {
    const result = await submit({
      resource: "settlement",
      operation: editing ? "update" : "create",
      data: {
        ...form, id: editing,
        units: Number(form.units), feePerUnit: Number(form.feePerUnit),
        adReimbursement: Number(form.adReimbursement), incentive: Number(form.incentive),
      },
    }, editing ? "Settlement updated." : "Settlement created.");
    if (result) { setOpen(false); setEditing(""); setForm(blank); }
  }

  return <div className="space-y-5">
    {unposted.length > 0 && <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{unposted.length} paid settlement{unposted.length === 1 ? " is" : "s are"} not on the ledger, so that income is missing from the reports.</span>
      <Button size="sm" className="shrink-0" onClick={() => submit({ resource: "settlement", operation: "backfill" }, "Settlements posted.")}>Post them</Button>
    </div>}

    <div className="flex justify-end">
      <Button onClick={() => { setOpen(!open); setEditing(""); setForm(blank); }}><Plus className="h-4 w-4" />New settlement</Button>
    </div>

    {open && <Card className="bg-white/80"><CardContent className="grid gap-4 p-5 md:grid-cols-2">
      <label className="text-xs font-medium">Client
        <select value={form.customerId} onChange={(event) => set({ customerId: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm">
          <option value="">Select…</option>
          {(data.customers ?? []).map((customer: any) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium">Due date
        <DateInput value={form.dueDate} onChange={(event) => set({ dueDate: event.target.value })} className="mt-2 h-10 rounded-lg" />
      </label>
      <label className="text-xs font-medium">Period start
        <DateInput value={form.periodStart} onChange={(event) => set({ periodStart: event.target.value })} className="mt-2 h-10 rounded-lg" />
      </label>
      <label className="text-xs font-medium">Period end
        <DateInput value={form.periodEnd} onChange={(event) => set({ periodEnd: event.target.value })} className="mt-2 h-10 rounded-lg" />
      </label>
      <label className="text-xs font-medium">Units sold
        <input type="number" value={form.units} onChange={(event) => set({ units: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">Fee per unit
        <input type="number" step="0.01" value={form.feePerUnit} onChange={(event) => set({ feePerUnit: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">Advertising reimbursement
        <input type="number" step="0.01" value={form.adReimbursement} onChange={(event) => set({ adReimbursement: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">Incentive
        <input type="number" step="0.01" value={form.incentive} onChange={(event) => set({ incentive: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium md:col-span-2">Notes
        <textarea value={form.notes} onChange={(event) => set({ notes: event.target.value })} className="mt-2 min-h-20 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
      </label>
      <div className="md:col-span-2 flex flex-wrap items-center gap-3">
        <Button onClick={save}>{editing ? "Save changes" : "Create settlement"}</Button>
        <span className="text-sm text-muted-foreground">Total <span className="font-semibold text-foreground">{money(preview)}</span></span>
      </div>
    </CardContent></Card>}

    <div className="grid gap-3 lg:grid-cols-2">
      {loading && <RowSkeleton rows={4} />}
      {!loading && !rows.length && <Card className="bg-white/80 lg:col-span-2"><CardContent className="p-12 text-center text-sm text-muted-foreground">No settlements yet.</CardContent></Card>}
      {rows.map((item: any) => <Card key={item.id} className="bg-white/80"><CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{item.customerName}</div>
            <div className="truncate text-[11px] text-muted-foreground">{item.periodStart} → {item.periodEnd} · {item.units.toLocaleString()} units at {money(item.feePerUnit)}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-semibold">{money(item.total)}</div>
            <div className="text-[10px] text-muted-foreground">{item.status}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Draft", "Verified"].includes(item.status) && <Button size="sm" variant="outline" className="bg-white"
            onClick={() => submit({ resource: "settlement", operation: "advance", data: { id: item.id } }, "Settlement advanced.")}
          >{item.status === "Draft" ? "Verify" : "Mark invoiced"}</Button>}
          {item.status !== "Paid" && <Button size="sm"
            onClick={() => submit({ resource: "settlement", operation: "mark_paid", data: { id: item.id } }, "Settlement paid and posted.")}
          >Mark paid</Button>}
          {!item.onLedger && <Button size="sm" variant="outline" className="bg-white" onClick={() => edit(item)}>Edit</Button>}
          {item.status === "Paid" && !item.onLedger && <Button size="sm" variant="outline" className="bg-white"
            onClick={() => submit({ resource: "settlement", operation: "post", data: { id: item.id } }, "Settlement posted.")}
          >Post to ledger</Button>}
        </div>
      </CardContent></Card>)}
    </div>
  </div>;
}

/**
 * The chart of accounts and period close.
 *
 * Both had working API routes with nothing calling them, so an operator could
 * neither add an account nor close a month — the two things that separate a
 * ledger you can file from one you merely write to.
 */
function Accounts({ data, submit }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", type: "expense", subtype: "", isBank: false });
  const set = (patch: any) => setForm((current) => ({ ...current, ...patch }));

  const grouped = useMemo(() => {
    const order = ["asset", "liability", "equity", "income", "expense"];
    return order.map((type) => ({ type, accounts: data.accounts.filter((account: any) => account.type === type) }))
      .filter((group) => group.accounts.length);
  }, [data.accounts]);

  async function create() {
    const result = await submit({ resource: "account", operation: "create", data: form }, "Account added.");
    if (result) { setOpen(false); setForm({ code: "", name: "", type: "expense", subtype: "", isBank: false }); }
  }

  return <div className="space-y-5">
    <div className="flex justify-end"><Button onClick={() => setOpen(!open)}><Plus className="h-4 w-4" />Add an account</Button></div>

    {open && <Card className="bg-white/80"><CardContent className="grid gap-4 p-5 md:grid-cols-2">
      <label className="text-xs font-medium">Code
        <input value={form.code} onChange={(event) => set({ code: event.target.value })} placeholder="6600" className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">Name
        <input value={form.name} onChange={(event) => set({ name: event.target.value })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      <label className="text-xs font-medium">Type
        <select value={form.type} onChange={(event) => set({ type: event.target.value, isBank: false })} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm">
          {["asset", "liability", "equity", "income", "expense"].map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium">Grouping
        <input value={form.subtype} onChange={(event) => set({ subtype: event.target.value })} placeholder="Operating" className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      </label>
      {form.type === "asset" && <label className="flex items-center gap-2 text-xs font-medium">
        <input type="checkbox" checked={form.isBank} onChange={(event) => set({ isBank: event.target.checked })} />
        This is a bank or cash account
      </label>}
      <div className="md:col-span-2"><Button onClick={create}>Save account</Button></div>
    </CardContent></Card>}

    <Card className="bg-white/80">
      <CardHeader>
        <CardTitle>Accounting periods</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">Closing a month stops anything being posted into it after it has been reported or filed.</p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {data.periods.slice(0, 14).map((period: any) => <button
          key={period.id}
          onClick={() => submit(
            { resource: "period", operation: period.status === "Closed" ? "open" : "close", data: { year: period.year, month: period.month } },
            period.status === "Closed" ? "Period reopened." : "Period closed.",
          )}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium",
            period.status === "Closed" ? "border-[#202c25] bg-[#202c25] text-white" : "bg-white hover:bg-[#f7f4ed]",
          )}
        >
          {period.status === "Closed" ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
          {period.year}-{String(period.month).padStart(2, "0")}
        </button>)}
      </CardContent>
    </Card>

    {grouped.map((group) => <Card key={group.type} className="bg-white/80">
      <CardHeader><CardTitle className="capitalize">{group.type}</CardTitle></CardHeader>
      <CardContent className="divide-y">
        {group.accounts.map((account: any) => <div key={account.id} className="flex items-center gap-3 py-2 text-sm">
          <span className="w-14 shrink-0 tabular-nums text-muted-foreground">{account.code}</span>
          <span className="min-w-0 flex-1 truncate">{account.name}</span>
          {account.isBank && <span className="shrink-0 rounded-full bg-[#eeeae0] px-2 py-0.5 text-[10px]">bank</span>}
          {account.systemKey && <span className="shrink-0 text-[10px] text-muted-foreground">{account.systemKey}</span>}
        </div>)}
      </CardContent>
    </Card>)}
  </div>;
}


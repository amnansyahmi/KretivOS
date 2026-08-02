"use client";

/**
 * Proving a bank account against its statement.
 *
 * The screen is a ticking exercise: every posting the bank has confirmed gets
 * ticked, and the difference must reach zero before the period can be locked.
 * Everything numeric comes from the server, which recomputes from what was
 * actually stored rather than trusting the figures the client last displayed.
 *
 * The difference is shown at the top and stays visible while scrolling the
 * lines, because it is the only number that decides whether this is finished.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, Loader2, Lock, LockOpen, RefreshCw, Scale, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/date-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/badge";
import { useConfirm } from "@/components/confirm";
import { cn } from "@/lib/utils";

const money = (value: unknown) =>
  `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Line = {
  id: string; date: string; memo: string; reference: string;
  amount: number; amountCents: number; cleared: boolean;
};

type Payload = {
  accounts: { id: string; code: string; name: string }[];
  account?: { id: string; code: string; name: string };
  statementDate?: string;
  opening?: { date: string; balance: number };
  reconciliation?: { id: string; statementBalance: number; status: string; notes: string } | null;
  lines?: Line[];
  summary?: {
    bookBalance: number; clearedBalance: number; statementBalance: number;
    unclearedDeposits: number; unclearedPayments: number; difference: number;
    balanced: boolean; clearedCount: number; unclearedCount: number;
  };
  proof?: {
    statementBalance: number; lessUnclearedPayments: number;
    plusUnclearedDeposits: number; derivedBookBalance: number; bookBalance: number; agrees: boolean;
  };
  stale?: string[];
  history?: { id: string; statementDate: string; statementBalance: number; difference: number; status: string }[];
  error?: string;
};

export function BankReconciliation() {
  const confirm = useConfirm();
  const [accountId, setAccountId] = useState("");
  const [statementDate, setStatementDate] = useState("");
  const [statementBalance, setStatementBalance] = useState("");
  const [notes, setNotes] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [data, setData] = useState<Payload>({ accounts: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (account = accountId, date = statementDate) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (account) params.set("accountId", account);
      if (date) params.set("statementDate", date);
      const response = await fetch(`/api/accounting/reconciliation?${params}`, { cache: "no-store" });
      const payload: Payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load the reconciliation.");
      setData(payload);
      if (payload.account) setAccountId(payload.account.id);
      if (payload.statementDate) setStatementDate(payload.statementDate);
      // The server's stored values win over whatever was typed before a reload.
      setStatementBalance(payload.reconciliation ? String(payload.reconciliation.statementBalance) : "");
      setNotes(payload.reconciliation?.notes ?? "");
      setTicked(new Set((payload.lines ?? []).filter((line) => line.cleared).map((line) => line.id)));
      if (payload.error) setError(payload.error);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the reconciliation.");
    } finally {
      setLoading(false);
    }
  }, [accountId, statementDate]);

  useEffect(() => { void load("", ""); }, []);

  const locked = data.reconciliation?.status === "Locked";
  const lines = data.lines ?? [];
  const stale = useMemo(() => new Set(data.stale ?? []), [data.stale]);

  /*
   * Recomputed locally so the difference responds to each tick without a round
   * trip. The server recalculates on save and its answer is authoritative — this
   * is a preview, not a second source of truth.
   */
  const preview = useMemo(() => {
    const opening = Math.round((data.opening?.balance ?? 0) * 100);
    let book = opening;
    let cleared = opening;
    let deposits = 0;
    let payments = 0;
    for (const line of lines) {
      book += line.amountCents;
      if (ticked.has(line.id)) cleared += line.amountCents;
      else if (line.amountCents >= 0) deposits += line.amountCents;
      else payments += Math.abs(line.amountCents);
    }
    const statement = Math.round((Number(statementBalance) || 0) * 100);
    const difference = cleared - statement;
    return {
      book: book / 100, cleared: cleared / 100, statement: statement / 100,
      deposits: deposits / 100, payments: payments / 100,
      difference: difference / 100, balanced: difference === 0,
      tickedCount: ticked.size, remaining: lines.length - ticked.size,
    };
  }, [lines, ticked, statementBalance, data.opening]);

  function toggle(id: string) {
    if (locked) return;
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit(operation: "save" | "lock" | "reopen") {
    if (operation === "lock" && !await confirm({
      title: "Lock this reconciliation?",
      description: "The ticked lines are frozen at this statement date. Reopening is possible but should be rare.",
      confirmLabel: "Lock",
    })) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/accounting/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation, accountId, statementDate,
          statementBalance: Number(statementBalance) || 0,
          notes, clearedIds: [...ticked],
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save the reconciliation.");
      setNotice(operation === "lock" ? "Reconciliation locked." : operation === "reopen" ? "Reopened for editing." : "Saved.");
      await load(accountId, statementDate);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the reconciliation.");
    } finally {
      setSaving(false);
    }
  }

  if (!loading && !data.accounts.length) {
    return <Card className="bg-card"><CardContent className="p-10 text-center">
      <Scale className="mx-auto h-7 w-7 text-muted-foreground" />
      <b className="mt-3 block">No bank account to reconcile</b>
      <p className="mt-1 text-xs text-muted-foreground">Mark a ledger account as a bank account in the chart of accounts first.</p>
    </CardContent></Card>;
  }

  return <div className="space-y-4">
    {error && <Card className="border-red-200 bg-red-50"><CardContent className="p-4 text-xs text-red-800">{error}</CardContent></Card>}
    {notice && <Card className="border-emerald-200 bg-emerald-50"><CardContent className="p-4 text-xs text-emerald-800">{notice}</CardContent></Card>}

    <Card className="bg-card"><CardContent className="p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium">Bank account
          <Select className="mt-2" value={accountId} disabled={saving} onChange={(event) => { setAccountId(event.target.value); void load(event.target.value, statementDate); }}>
            {data.accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
          </Select>
        </label>
        <label className="text-xs font-medium">Statement date
          <DateInput className="mt-2" value={statementDate} disabled={saving} onChange={(event) => { setStatementDate(event.target.value); void load(accountId, event.target.value); }} />
        </label>
        <label className="text-xs font-medium">Closing balance on the statement
          <Input className="mt-2" type="number" step="0.01" inputMode="decimal" disabled={locked || saving}
            value={statementBalance} onChange={(event) => setStatementBalance(event.target.value)} placeholder="0.00" />
        </label>
        <div className="flex items-end gap-2">
          <Button variant="outline" onClick={() => void load(accountId, statementDate)} disabled={loading || saving} aria-label="Refresh">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />Refresh
          </Button>
        </div>
      </div>

      {data.opening?.date && <p className="mt-3 text-[11px] text-muted-foreground">
        Opening balance {money(data.opening.balance)} carried from the reconciliation locked at {data.opening.date}. Only lines never reconciled appear below.
      </p>}
    </CardContent></Card>

    {/* The number that decides whether this is finished. */}
    <Card className={cn("sticky top-2 z-20", preview.balanced ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50")}>
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Difference</div>
          <div className={cn("mt-1 text-2xl font-semibold tabular-nums", preview.balanced ? "text-emerald-800" : "text-amber-900")}>
            {money(preview.difference)}
          </div>
        </div>
        <div className="text-xs leading-6">
          <div className="flex gap-3"><span className="w-32 opacity-70">Cleared balance</span><b className="tabular-nums">{money(preview.cleared)}</b></div>
          <div className="flex gap-3"><span className="w-32 opacity-70">Statement</span><b className="tabular-nums">{money(preview.statement)}</b></div>
        </div>
        <div className="text-xs leading-6">
          <div className="flex gap-3"><span className="w-36 opacity-70">Uncleared payments</span><b className="tabular-nums">{money(preview.payments)}</b></div>
          <div className="flex gap-3"><span className="w-36 opacity-70">Uncleared deposits</span><b className="tabular-nums">{money(preview.deposits)}</b></div>
        </div>
        <div className="text-xs leading-6">
          <div className="flex gap-3"><span className="w-24 opacity-70">Book balance</span><b className="tabular-nums">{money(preview.book)}</b></div>
          <div className="flex gap-3"><span className="w-24 opacity-70">Ticked</span><b className="tabular-nums">{preview.tickedCount} of {lines.length}</b></div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {locked
            ? <><StatusBadge value="Locked" /><Button variant="outline" onClick={() => void submit("reopen")} disabled={saving}><LockOpen className="h-4 w-4" />Reopen</Button></>
            : <>
              <Button variant="outline" onClick={() => void submit("save")} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save progress</Button>
              <Button onClick={() => void submit("lock")} disabled={saving || !preview.balanced} title={preview.balanced ? undefined : "The difference must be zero"}>
                <Lock className="h-4 w-4" />Lock
              </Button>
            </>}
        </div>
      </CardContent>
    </Card>

    {!preview.balanced && lines.length > 0 && <Card className="bg-card"><CardContent className="flex items-start gap-3 p-4">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p className="text-xs leading-5 text-muted-foreground">
        Tick every line the bank has confirmed, then check the closing balance you typed matches the statement exactly. A difference that will not close usually means a posting is missing from the books, or one was entered twice.
      </p>
    </CardContent></Card>}

    <Card className="overflow-hidden bg-card"><CardContent className="p-0">
      {loading
        ? <div className="p-10 text-center text-xs text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /><div className="mt-3">Loading movements…</div></div>
        : !lines.length
          ? <div className="p-10 text-center"><CheckCheck className="mx-auto h-7 w-7 text-muted-foreground" /><b className="mt-3 block">Nothing to reconcile</b><p className="mt-1 text-xs text-muted-foreground">No unreconciled postings on this account up to {statementDate || "the statement date"}.</p></div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-background"><tr>
              <th className="p-4 w-12">On statement</th>
              <th className="p-4">Date</th>
              <th className="p-4">Detail</th>
              <th className="p-4">Reference</th>
              <th className="p-4 text-right">Amount</th>
            </tr></thead>
            <tbody>{lines.map((line) => {
              const on = ticked.has(line.id);
              return <tr key={line.id} className={cn("border-t", on && "bg-emerald-50/60")}>
                <td className="p-4">
                  <Checkbox checked={on} disabled={locked} onCheckedChange={() => toggle(line.id)}
                    aria-label={`Mark ${line.memo || "movement"} of ${money(line.amount)} as on the statement`} />
                </td>
                <td className="p-4 whitespace-nowrap tabular-nums">{line.date}</td>
                <td className="p-4">
                  {line.memo || "—"}
                  {stale.has(line.id) && !on && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-900">Uncleared 90+ days</span>}
                </td>
                <td className="p-4 text-muted-foreground">{line.reference || "—"}</td>
                <td className={cn("p-4 text-right font-medium tabular-nums", line.amount < 0 && "text-red-600")}>{money(line.amount)}</td>
              </tr>;
            })}</tbody>
          </table></div>}
    </CardContent></Card>

    <Card className="bg-card"><CardContent className="p-5">
      <label className="text-xs font-medium">Notes
        <Textarea className="mt-2 min-h-20" value={notes} disabled={locked || saving} onChange={(event) => setNotes(event.target.value)}
          placeholder="Anything the next person should know — a cheque still outstanding, a bank charge queried." />
      </label>
    </CardContent></Card>

    {Boolean(data.history?.length) && <Card className="overflow-hidden bg-card"><CardContent className="p-0">
      <div className="border-b p-4 text-xs font-semibold">Previous reconciliations</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs">
        <thead className="bg-background"><tr><th className="p-4">Statement date</th><th className="p-4 text-right">Statement</th><th className="p-4 text-right">Difference</th><th className="p-4">Status</th></tr></thead>
        <tbody>{data.history!.map((item) => <tr key={item.id} className="border-t">
          <td className="p-4 tabular-nums">{item.statementDate}</td>
          <td className="p-4 text-right tabular-nums">{money(item.statementBalance)}</td>
          <td className="p-4 text-right tabular-nums">{money(item.difference)}</td>
          <td className="p-4"><StatusBadge value={item.status} /></td>
        </tr>)}</tbody>
      </table></div>
    </CardContent></Card>}
  </div>;
}

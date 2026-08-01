"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot, Check, CheckCircle2, ClipboardCheck, FileCheck2, FileText, HandCoins,
  Library, Palette, RefreshCw, Search, ShieldCheck, UsersRound, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WorkspacePage } from "@/components/workspace-page";
import { cn } from "@/lib/utils";

type ApprovalKind = "sales" | "settlement" | "hr" | "automation" | "brand" | "document" | "knowledge";
type ApprovalItem = {
  id: string;
  recordId: string;
  kind: ApprovalKind;
  source: string;
  title: string;
  context: string;
  reference: string;
  value: string;
  status: string;
  createdAt: string;
  href: string;
  approveLabel: string;
  rejectLabel?: string;
  resource?: "leave" | "claims" | "attendance_corrections";
  record: any;
};

const money = (value: number) => `RM${Number(value || 0).toLocaleString("en-MY", { maximumFractionDigits: 2 })}`;
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "No date";

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function sourceIcon(kind: ApprovalKind) {
  return ({
    sales: FileCheck2,
    settlement: HandCoins,
    hr: UsersRound,
    automation: Bot,
    brand: Palette,
    document: FileText,
    knowledge: Library,
  } as const)[kind];
}

export default function ApprovalInboxPage() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [business, hr, brandData, documentData, automationData, knowledgeData] = await Promise.all([
        jsonRequest("/api/business", { cache: "no-store" }),
        jsonRequest("/api/hr", { cache: "no-store" }).catch(() => ({ leaveRequests: [], employees: [], session: null })),
        jsonRequest("/api/brand-dna", { cache: "no-store" }),
        jsonRequest("/api/templates", { cache: "no-store" }),
        jsonRequest("/api/automations", { cache: "no-store" }),
        jsonRequest("/api/knowledge", { cache: "no-store" }),
      ]);

      const next: ApprovalItem[] = [];
      const customerName = (id: string) => business.customers?.find((item: any) => item.id === id)?.name || "Unknown customer";

      for (const document of business.documents || []) {
        if (!["Draft", "Sent"].includes(document.status)) continue;
        next.push({
          id: `sales:${document.id}`, recordId: document.id, kind: "sales", source: "Sales",
          title: document.title, context: `${customerName(document.customerId)} · ${document.type}`,
          reference: document.reference || document.type, value: money(document.value), status: document.status,
          createdAt: document.updatedAt || document.createdAt, href: "/sales?tab=sales", approveLabel: "Approve", rejectLabel: "Reject", record: document,
        });
      }

      for (const settlement of business.settlements || []) {
        if (!["Draft", "Verified"].includes(settlement.status)) continue;
        const total = Number(settlement.units) * Number(settlement.feePerUnit) + Number(settlement.adReimbursement) + Number(settlement.incentive);
        next.push({
          id: `settlement:${settlement.id}`, recordId: settlement.id, kind: "settlement", source: "Settlement",
          title: settlement.status === "Draft" ? "Verify weekly settlement" : "Raise settlement invoice",
          context: customerName(settlement.customerId), reference: `${dateLabel(settlement.periodStart)} → ${dateLabel(settlement.periodEnd)}`,
          value: money(total), status: settlement.status, createdAt: settlement.updatedAt || settlement.createdAt,
          href: "/sales?tab=settlements", approveLabel: settlement.status === "Draft" ? "Verify" : "Create invoice", record: settlement,
        });
      }

      for (const request of (["hr_admin", "manager"].includes(hr.session?.role) ? hr.leaveRequests : []) || []) {
        if (request.status !== "Pending") continue;
        const employee = hr.employees?.find((item: any) => item.id === request.employeeId);
        next.push({
          id: `hr-leave:${request.id}`, recordId: request.id, kind: "hr", source: "HR · Leave", resource: "leave",
          title: `${request.type} request`, context: employee?.name || "Team member",
          reference: `${dateLabel(request.startDate)} → ${dateLabel(request.endDate)}`, value: `${request.days} day${request.days === 1 ? "" : "s"}`,
          status: request.status, createdAt: request.updatedAt || request.createdAt, href: "/hr?section=leave", approveLabel: "Approve", rejectLabel: "Reject", record: request,
        });
      }

      for (const claim of (["hr_admin", "manager"].includes(hr.session?.role) ? hr.claims : []) || []) {
        if (claim.status !== "Pending") continue;
        const employee = hr.employees?.find((item: any) => item.id === claim.employeeId);
        next.push({
          id: `hr-claim:${claim.id}`, recordId: claim.id, kind: "hr", source: "HR · Claims", resource: "claims",
          title: `${claim.category || "Expense"} claim`, context: employee?.name || "Team member",
          reference: dateLabel(claim.claimDate), value: money(claim.amount), status: claim.status,
          createdAt: claim.updatedAt || claim.createdAt, href: "/hr?section=claims", approveLabel: "Approve", rejectLabel: "Reject", record: claim,
        });
      }

      for (const correction of (["hr_admin", "manager"].includes(hr.session?.role) ? hr.attendanceCorrections : []) || []) {
        if (correction.status !== "Pending") continue;
        const employee = hr.employees?.find((item: any) => item.id === correction.employeeId);
        next.push({
          id: `hr-attendance:${correction.id}`, recordId: correction.id, kind: "hr", source: "HR · Attendance", resource: "attendance_corrections",
          title: "Attendance correction", context: employee?.name || "Team member",
          reference: dateLabel(correction.date), value: [correction.requestedCheckIn, correction.requestedCheckOut].filter(Boolean).join(" → ") || "Review time",
          status: correction.status, createdAt: correction.updatedAt || correction.createdAt, href: "/hr?section=attendance", approveLabel: "Approve", rejectLabel: "Reject", record: correction,
        });
      }

      for (const approval of automationData.approvals || []) {
        if (approval.status !== "Pending") continue;
        next.push({
          id: `automation:${approval.id}`, recordId: approval.id, kind: "automation", source: "Automation",
          title: approval.recipeName, context: approval.event?.trigger || "Server workflow",
          reference: approval.event?.entityId || "Server event", value: `${Object.keys(approval.event?.payload || {}).length} event fields`,
          status: approval.status, createdAt: approval.createdAt, href: "/automations", approveLabel: "Approve & run", rejectLabel: "Reject", record: approval,
        });
      }

      for (const brand of brandData.brands || []) {
        for (const profile of brand.profiles || []) {
          if (profile.status !== "Draft") continue;
          next.push({
            id: `brand:${profile.id}`, recordId: profile.id, kind: "brand", source: "Brand DNA",
            title: `${brand.name} Brand DNA`, context: brand.customerName,
            reference: `${profile.completenessScore}% complete`, value: `${(profile.evidence || []).length} evidence links`,
            status: profile.status, createdAt: profile.updatedAt || profile.createdAt, href: "/brands", approveLabel: "Approve", rejectLabel: "Reject", record: profile,
          });
        }
      }

      for (const document of documentData.documents || []) {
        if (!["Draft", "Review"].includes(document.status)) continue;
        next.push({
          id: `document:${document.id}`, recordId: document.id, kind: "document", source: "Documents",
          title: document.title, context: `${document.customerName || "Internal"} · ${document.documentType || document.templateName || "Document"}`,
          reference: document.reference || "No reference", value: `${String(document.content || "").split(/\s+/).filter(Boolean).length} words`,
          status: document.status, createdAt: document.updatedAt || document.createdAt, href: "/documents", approveLabel: "Approve", rejectLabel: "Reject", record: document,
        });
      }

      for (const entry of knowledgeData.entries || []) {
        if (entry.freshnessStatus !== "Overdue") continue;
        next.push({
          id: `knowledge:${entry.id}`, recordId: entry.id, kind: "knowledge", source: "Knowledge review",
          title: entry.title, context: `${entry.client} · Owner: ${entry.owner || "Unassigned"}`,
          reference: `Review due ${dateLabel(entry.nextReviewAt)}`, value: entry.category,
          status: entry.freshnessStatus, createdAt: entry.nextReviewAt || entry.updatedAt, href: "/knowledge", approveLabel: "Mark reviewed", record: entry,
        });
      }

      next.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      setItems(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the approval inbox.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sources = useMemo(() => ["All", ...Array.from(new Set(items.map((item) => item.source)))], [items]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => (filter === "All" || item.source === filter) && (!term || [item.title, item.context, item.reference, item.source, item.status].join(" ").toLowerCase().includes(term)));
  }, [items, filter, query]);

  async function decide(item: ApprovalItem, decision: "Approved" | "Rejected") {
    setBusy(item.id);
    setError("");
    try {
      if (item.kind === "sales") {
        await jsonRequest("/api/business", { method: "POST", body: JSON.stringify({ operation: "update", resource: "sales", id: item.recordId, data: { ...item.record, status: decision === "Approved" ? "Approved" : "Cancelled" } }) });
      } else if (item.kind === "settlement") {
        await jsonRequest("/api/business", { method: "POST", body: JSON.stringify({ operation: "action", action: "advance-settlement", id: item.recordId }) });
      } else if (item.kind === "hr") {
        await jsonRequest("/api/hr", { method: "POST", body: JSON.stringify({ operation: "action", resource: item.resource || "leave", id: item.recordId, action: decision === "Approved" ? "approve" : "reject" }) });
      } else if (item.kind === "automation") {
        await jsonRequest("/api/automations", { method: "POST", body: JSON.stringify({ operation: "resolve", approvalId: item.recordId, decision }) });
      } else if (item.kind === "brand") {
        await jsonRequest("/api/brand-dna", { method: "PATCH", body: JSON.stringify({ ...item.record, status: decision }) });
      } else if (item.kind === "document") {
        await jsonRequest("/api/templates", { method: "PATCH", body: JSON.stringify({ resource: "document", id: item.recordId, ...item.record, status: decision }) });
      } else if (item.kind === "knowledge") {
        const reviewedAt = new Date().toISOString();
        const nextReview = new Date(reviewedAt);
        nextReview.setUTCDate(nextReview.getUTCDate() + Number(item.record.reviewIntervalDays || 90));
        await jsonRequest("/api/knowledge", { method: "PATCH", body: JSON.stringify({ ...item.record, lastReviewedAt: reviewedAt, nextReviewAt: nextReview.toISOString().slice(0, 10) }) });
      }
      setNotice(`${item.title} · ${decision === "Approved" ? item.approveLabel : item.rejectLabel || "Rejected"}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The decision could not be saved.");
    } finally {
      setBusy("");
    }
  }

  return (
    <WorkspacePage
      eyebrow="Central decision queue"
      title="Approval Inbox"
      description="Review commercial documents, settlements, HR leave, claims and attendance, automation actions, Brand DNA, generated documents and stale knowledge from one shared queue."
      actions={<Button variant="outline" className="bg-white" onClick={() => void load()} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />Refresh</Button>}
    >
      {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}
      {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Waiting for decision" value={String(items.length)} icon={ClipboardCheck} />
        <Stat label="High-impact automation" value={String(items.filter((item) => item.kind === "automation").length)} icon={ShieldCheck} />
        <Stat label="Knowledge reviews due" value={String(items.filter((item) => item.kind === "knowledge").length)} icon={Library} />
      </div>

      <Card className="mb-5 bg-white/80"><CardContent className="p-3 sm:p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="kretivos-search-control flex min-h-11 flex-1 items-center gap-2 rounded-xl border bg-white px-3"><Search className="h-5 w-5 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search decision, client or reference" /></div><div className="flex gap-2 overflow-x-auto pb-1 lg:max-w-[62%]">{sources.map((source) => <button key={source} onClick={() => setFilter(source)} className={cn("shrink-0 rounded-full border px-3 py-2 text-xs font-medium", filter === source ? "border-[#202c25] bg-[#202c25] text-white" : "bg-white text-muted-foreground")}>{source}{source !== "All" && <span className="ml-1.5 opacity-60">{items.filter((item) => item.source === source).length}</span>}</button>)}</div></div></CardContent></Card>

      {loading && <Card className="bg-white/80"><CardContent className="p-12 text-center text-sm text-muted-foreground"><RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin" />Loading shared decisions…</CardContent></Card>}
      {!loading && !filtered.length && <Card className="bg-white/80"><CardContent className="p-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><div className="mt-4 font-semibold">Nothing is waiting here</div><p className="mt-2 text-sm text-muted-foreground">New draft records and overdue reviews appear automatically.</p></CardContent></Card>}

      {!loading && <div className="space-y-3">{filtered.map((item) => {
        const Icon = sourceIcon(item.kind);
        return <Card key={item.id} className="bg-white/85"><CardContent className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center"><div className="flex min-w-0 flex-1 gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eee9df] text-[#ba5c42]"><Icon className="h-5 w-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#202c25] px-2.5 py-1 text-[10px] font-medium text-white">{item.source}</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-700">{item.status}</span></div><h2 className="mt-2 text-sm font-semibold sm:text-base">{item.title}</h2><p className="mt-1 text-xs text-muted-foreground">{item.context}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground"><span>{item.reference}</span><span>{item.value}</span><span>Updated {dateLabel(item.createdAt)}</span></div></div></div><div className="flex flex-wrap gap-2 border-t pt-3 lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"><Button asChild variant="outline" size="sm"><Link href={item.href}>Open</Link></Button>{item.rejectLabel && <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => decide(item, "Rejected")} disabled={busy === item.id}>Reject</Button>}<Button size="sm" onClick={() => decide(item, "Approved")} disabled={busy === item.id}>{busy === item.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{item.approveLabel}</Button></div></CardContent></Card>;
      })}</div>}
    </WorkspacePage>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return <Card className="bg-white/80"><CardContent className="flex items-center justify-between p-5"><div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eee9df] text-[#ba5c42]"><Icon className="h-5 w-5" /></div></CardContent></Card>;
}

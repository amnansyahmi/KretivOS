"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, ChevronRight, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HRNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  href: string;
  createdAt: string;
};

async function request(init?: RequestInit) {
  const response = await fetch("/api/hr/notifications", { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) }, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load notifications.");
  return data;
}

function dateTime(value: string) {
  return new Date(value).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function HRMSNotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HRNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const data = await request(); setItems(data.notifications || []); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load notifications."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const unread = items.filter((item) => !item.read).length;

  async function update(operation: string, id?: string) {
    try {
      const data = await request({ method: "POST", body: JSON.stringify({ operation, id }) });
      setItems(data.notifications || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update notifications."); }
  }

  async function openRecord(item: HRNotification) {
    if (!item.read) await update("mark_read", item.id);
    window.location.assign(item.href);
  }

  return <>
    <Button variant="outline" size="icon" className="relative bg-card" onClick={() => setOpen(true)} aria-label={`${unread} unread HR notifications`}>
      <Bell className="h-4 w-4" />
      {unread > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
    </Button>

    {open && <div className="fixed inset-0 z-[190] bg-black/45" onClick={() => setOpen(false)}>
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-background shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-3 border-b bg-card p-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-white"><Bell className="h-4 w-4" /></div><div className="min-w-0 flex-1"><h2 className="font-semibold">HR notifications</h2><p className="mt-1 text-xs text-muted-foreground">{unread} unread · updates every minute</p></div><Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close notifications"><X className="h-4 w-4" /></Button></div>
        <div className="flex items-center justify-between border-b px-5 py-3"><Button variant="ghost" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />Refresh</Button>{unread > 0 && <Button variant="ghost" size="sm" onClick={() => update("mark_all_read")}><CheckCheck className="h-3.5 w-3.5" />Mark all read</Button>}</div>
        <div className="flex-1 overflow-y-auto p-3">
          {error && <div className="m-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
          <div className="space-y-2">{items.map((item) => <button key={item.id} onClick={() => openRecord(item)} className={cn("flex w-full items-start gap-3 rounded-xl border p-4 text-left transition hover:border-accent/40", item.read ? "bg-white/60" : "border-accent/25 bg-card shadow-sm")} aria-label="Next"><span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-accent")} /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.body}</span><span className="mt-2 block text-[10px] text-muted-foreground">{dateTime(item.createdAt)}</span></span><ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /></button>)}</div>
          {!items.length && !loading && <div className="flex min-h-64 flex-col items-center justify-center px-8 text-center"><Bell className="h-7 w-7 text-muted-foreground" /><div className="mt-3 text-sm font-semibold">No HR notifications</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Leave, claim, attendance, payroll and lifecycle updates will appear here.</p></div>}
        </div>
        {items.some((item) => item.read) && <div className="border-t bg-card p-4"><Button variant="outline" className="w-full" onClick={() => update("archive_read")}>Clear read notifications</Button></div>}
      </aside>
    </div>}
  </>;
}

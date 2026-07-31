"use client";

/**
 * Header notification bell.
 *
 * The automation engine and the daily cron have been writing shared reminders
 * into `notifications` all along; this is the first thing in the app that reads
 * them. Each row links to the workspace that can actually clear it.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, CalendarClock, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  href: string;
  dueAt: string | null;
  createdAt: string;
};

/** Refresh cadence for a workspace someone leaves open all day. */
const POLL_MS = 120_000;

function relative(value: string | null) {
  if (!value) return "";
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return "";
  const days = Math.round((target.getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days < 0 ? `${Math.abs(days)}d ago` : `in ${days}d`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [note, setNote] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setNote(payload.error || "Notifications are unavailable.");
        return;
      }
      setNotifications(payload.notifications || []);
      setUnread(payload.unread || 0);
      setNote((payload.notifications || []).length ? "" : "Nothing needs attention right now.");
    } catch {
      setNote("Notifications are unavailable.");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Close on an outside click or Escape, the two things a panel like this must do.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function markRead(id: string) {
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
    setUnread((current) => Math.max(0, current - 1));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      void load(); // Put the true state back if the write did not land.
    }
  }

  async function markAllRead() {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    setUnread(0);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read_all" }),
      });
    } catch {
      void load();
    }
  }

  return <div ref={containerRef} className="relative">
    <Button
      variant="outline"
      size="icon"
      className="relative bg-white"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ba5c42] px-1 text-[9px] font-semibold text-white">
        {unread > 9 ? "9+" : unread}
      </span>}
    </Button>

    {open && <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-white shadow-xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="text-sm font-semibold">Notifications</div>
        {unread > 0 && <button onClick={markAllRead} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          <Check className="h-3 w-3" />Mark all read
        </button>}
      </div>

      <div className="max-h-[26rem] overflow-y-auto">
        {!notifications.length && <p className="px-4 py-8 text-center text-xs text-muted-foreground">{note}</p>}
        {notifications.map((item) => {
          const Icon = item.type === "warning" ? AlertTriangle : item.type === "reminder" ? CalendarClock : Info;
          const due = relative(item.dueAt);
          return <Link
            key={item.id}
            href={item.href}
            onClick={() => { if (!item.read) void markRead(item.id); setOpen(false); }}
            className={cn("flex gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-[#f7f4ed]", !item.read && "bg-[#fdf9f4]")}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.type === "warning" ? "text-[#ba5c42]" : "text-muted-foreground")} />
            <div className="min-w-0 flex-1">
              <div className={cn("text-xs leading-snug", !item.read && "font-semibold")}>{item.title}</div>
              {item.body && <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{item.body}</div>}
              {due && <div className="mt-1 text-[10px] text-muted-foreground">Due {due}</div>}
            </div>
            {!item.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ba5c42]" />}
          </Link>;
        })}
      </div>
    </div>}
  </div>;
}

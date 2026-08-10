"use client";

/**
 * The employee app.
 *
 * Loads the same `/api/hr` snapshot the workspace does and narrows it through
 * the same lens, so nothing here can show more than the employee view on `/hr`
 * would. Creating a leave request or a claim posts to the same endpoints too —
 * this is a second surface over one system, not a second system.
 *
 * Composing rather than routing: the four tabs are state, so switching them
 * costs no navigation and the shell never repaints. That is most of what makes
 * an installed PWA feel like an app rather than a website in a frame.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { HRAppShell, type AppTab } from "@/components/hr-app-shell";
import { AppHome, AppInbox, AppProfile, AppRequests, AppTimesheet } from "@/components/hr-app-screens";
import { HRAppComposer, type ComposerKind } from "@/components/hr-app-composer";
import { HRAttendanceCapture, type Action as ClockAction } from "@/components/hr-photo-attendance";
import { Button } from "@/components/ui/button";
import { scopeSnapshotForView } from "@/lib/hr-view-scope";
import type { HRMSSession } from "@/components/hrms-shell";

const TITLES: Record<AppTab, string> = {
  home: "HR Portal",
  timesheet: "Timesheet",
  requests: "Requests",
  inbox: "Inbox",
  profile: "Profile",
};

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) }, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export function HREmployeeApp({ session }: { session: HRMSSession }) {
  const router = useRouter();
  const search = useSearchParams();
  const [tab, setTab] = useState<AppTab>("home");
  const [raw, setRaw] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [composer, setComposer] = useState<ComposerKind | null>(null);
  const [taskDraft, setTaskDraft] = useState<any>(null);
  const [clocking, setClocking] = useState<ClockAction | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [snapshot, inbox] = await Promise.all([
        requestJson("/api/hr"),
        requestJson("/api/hr/notifications").catch(() => ({ notifications: [] })),
      ]);
      setRaw(snapshot);
      setNotifications(inbox.notifications || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load your HR data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /*
   * Refreshed when the app is brought back to the foreground. An installed app
   * is closed rather than reloaded, so without this somebody who clocked in on
   * Monday would still be looking at Monday on Tuesday morning.
   */
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  /*
   * The manifest's shortcuts land here — long-pressing the installed icon and
   * choosing "Apply for leave" opens the form rather than the home screen.
   * Read once: leaving it in the URL would reopen the sheet on every render
   * after it was dismissed.
   */
  useEffect(() => {
    const wanted = search.get("do");
    if (wanted === "leave" || wanted === "claim" || wanted === "task") {
      if (wanted === "task") setTaskDraft(null);
      setComposer(wanted);
      router.replace("/hr/app", { scroll: false });
    }
  }, [search, router]);

  // Always the employee lens, whatever the session's own role is: this surface
  // exists to be the employee view, and an admin opening it should see what
  // their team sees rather than the whole organisation on a phone.
  const data = raw ? scopeSnapshotForView(raw, "employee", session.userId) : null;

  async function submit(payload: any) {
    const next = await requestJson("/api/hr", { method: "POST", body: JSON.stringify(payload) });
    setRaw(next);
    setComposer(null);
    setTaskDraft(null);
  }

  async function markAllRead() {
    try {
      const next = await requestJson("/api/hr/notifications", { method: "POST", body: JSON.stringify({ operation: "mark_all_read" }) });
      setNotifications(next.notifications || []);
    } catch { /* An inbox that will not mark read is not worth an error screen. */ }
  }

  async function openNotification(item: any) {
    if (!item.read) {
      try { await requestJson("/api/hr/notifications", { method: "POST", body: JSON.stringify({ operation: "mark_read", id: item.id }) }); } catch { /* ignore */ }
    }
    router.push(item.href || "/hr");
  }

  const openHR = (section: string) => router.push(`/hr?section=${section}`);
  const unread = notifications.filter((item) => !item.read).length;
  const pending = data
    ? data.leaveRequests.filter((item: any) => item.status === "Pending").length
      + data.claims.filter((item: any) => item.status === "Pending").length
    : 0;

  return <HRAppShell
    title={TITLES[tab]}
    tab={tab}
    onTab={setTab}
    unread={unread}
    pendingRequests={pending}
    onBell={() => setTab("inbox")}
  >
    {error && <div className="mb-4 rounded-2xl border border-destructive/25 bg-card p-4">
      <p className="text-xs leading-5 text-destructive">{error}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" />Try again</Button>
    </div>}

    {loading && !data && <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />Loading your HR…
    </div>}

    {data && <>
      {tab === "home" && <AppHome
        data={data}
        session={session}
        today={today()}
        onTab={setTab}
        onOpenLeave={() => setComposer("leave")}
        onOpenClaim={() => setComposer("claim")}
        onClock={setClocking}
        onOpenHR={openHR}
      />}
      {tab === "timesheet" && <AppTimesheet
        data={data}
        session={session}
        onAdd={(date: string) => { setTaskDraft({ date }); setComposer("task"); }}
        onEdit={(entry: any) => { setTaskDraft(entry); setComposer("task"); }}
        onDelete={async (id: string) => {
          try { setRaw(await requestJson("/api/hr", { method: "POST", body: JSON.stringify({ operation: "delete", resource: "timesheets", id }) })); }
          catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete that task."); }
        }}
        onOpenHR={openHR}
      />}
      {tab === "requests" && <AppRequests
        data={data}
        onOpenLeave={() => setComposer("leave")}
        onOpenClaim={() => setComposer("claim")}
        onOpenHR={openHR}
      />}
      {tab === "inbox" && <AppInbox
        notifications={notifications}
        loading={loading}
        onOpen={openNotification}
        onMarkAllRead={markAllRead}
      />}
      {tab === "profile" && <AppProfile
        data={data}
        session={session}
        onOpenHR={openHR}
        authEnabled={session.authEnabled !== false}
        onSignOut={async () => {
          await fetch("/api/hr/auth/logout", { method: "POST" }).catch(() => undefined);
          window.location.replace("/hr/login");
        }}
      />}
    </>}

    {notice && <button
      onClick={() => setNotice("")}
      className="fixed inset-x-4 bottom-24 z-[140] rounded-2xl bg-foreground px-4 py-3 text-left text-xs font-medium text-white shadow-2xl"
    >{notice}</button>}

    {/*
      * The same capture the workspace uses — camera, GPS, drift check and the
      * watermarked timestamp. Reused rather than reimplemented: it is the one
      * path that produces the evidence an attendance dispute turns on.
      */}
    {clocking && data && (() => {
      const me = data.employees.find((item: any) => item.id === session.userId);
      if (!me) return null;
      return <HRAttendanceCapture
        employee={{ id: me.id, name: me.name, status: me.status, workMode: me.workMode, title: me.title }}
        action={clocking}
        onClose={() => setClocking(null)}
        onError={(message: string) => setError(message)}
        onDone={async (result: any) => {
          const was = clocking;
          setClocking(null);
          await load();
          setNotice(`${was === "check_in" ? "Clocked in" : "Clocked out"} at ${result.officialTime}.`);
          window.setTimeout(() => setNotice(""), 6000);
        }}
      />;
    })()}

    {composer && data && <HRAppComposer
      kind={composer}
      session={session}
      settings={data.settings}
      draft={composer === "task" ? taskDraft : undefined}
      onClose={() => { setComposer(null); setTaskDraft(null); }}
      onSubmit={submit}
    />}
  </HRAppShell>;
}

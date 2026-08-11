"use client";

/**
 * The employee app.
 *
 * Loads the same `/api/hr` snapshot the workspace does and narrows it through
 * the same lens, so nothing here can show more than the employee view on `/hr`
 * would. Creating a leave request or a claim posts to the same endpoints too —
 * this is a second surface over one system, not a second system.
 *
 * Composing rather than routing: tabs and detail screens are state, so moving
 * between them costs no navigation and the shell never repaints. That is most
 * of what makes an installed PWA feel like an app rather than a website in a
 * frame — and it is why `openSection` resolves a workspace section to a screen
 * in here wherever one exists. Installed, there is no browser chrome and
 * therefore no Back button, so a link out to `/hr` is a one-way door.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { HRAppShell, type AppTab } from "@/components/hr-app-shell";
import { AppHome, AppInbox, AppProfile, AppRequests, AppTimesheet } from "@/components/hr-app-screens";
import {
  AppAttendance, AppDetails, AppDocuments, AppLeaveCalendar, AppPayslips, AppTeam,
} from "@/components/hr-app-detail-screens";
import { HRAppComposer, type ComposerKind } from "@/components/hr-app-composer";
import { HRAttendanceCapture, type Action as ClockAction } from "@/components/hr-photo-attendance";
import { Button } from "@/components/ui/button";
import { scopeSnapshotForView } from "@/lib/hr-view-scope";
import type { HRMSSession } from "@/components/hrms-shell";

/** A screen pushed over a tab. Not a tab itself — it has a Back button. */
type AppView = "calendar" | "payslips" | "documents" | "details" | "team" | "attendance";

const TITLES: Record<AppTab, string> = {
  home: "HR Portal",
  timesheet: "Timesheet",
  requests: "Requests",
  inbox: "Inbox",
  profile: "Profile",
};

const VIEW_TITLES: Record<AppView, string> = {
  calendar: "Leave calendar",
  payslips: "My payslips",
  documents: "HR documents",
  details: "My details",
  team: "Team hub",
  attendance: "My attendance",
};

/**
 * Where a workspace section lands inside the app.
 *
 * The sections are the vocabulary the rest of the system already speaks —
 * notification hrefs are `/hr?section=leave`, and the screens link by the same
 * names. Anything absent from this table has no employee-sized screen and
 * genuinely belongs in the workspace.
 */
const SECTION_ROUTES: Record<string, { tab?: AppTab; view?: AppView; focus?: "leave" | "claims" }> = {
  leave: { tab: "requests", view: "calendar" },
  claims: { tab: "requests", focus: "claims" },
  payslips: { tab: "profile", view: "payslips" },
  documents: { tab: "profile", view: "documents" },
  profile: { tab: "profile", view: "details" },
  team: { tab: "home", view: "team" },
  attendance: { tab: "home", view: "attendance" },
  timesheet: { tab: "timesheet" },
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
  const [view, setView] = useState<AppView | null>(null);
  const [requestFocus, setRequestFocus] = useState<"all" | "leave" | "claims">("all");
  const [raw, setRaw] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [composer, setComposer] = useState<ComposerKind | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [clocking, setClocking] = useState<ClockAction | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
   * The manifest's shortcuts land here — on Android, long-pressing the
   * installed icon and choosing "Apply for leave" opens the form rather than
   * the home screen. Read once: leaving it in the URL would reopen the sheet on
   * every render after it was dismissed.
   */
  useEffect(() => {
    const wanted = search.get("do");
    if (wanted === "leave" || wanted === "claim" || wanted === "task") {
      setDraft(null);
      setComposer(wanted);
      router.replace("/hr/app", { scroll: false });
    }
  }, [search, router]);

  /**
   * Opens a workspace section wherever the app has a screen for it.
   *
   * Falls through to `/hr` only for sections with no employee-sized screen.
   * That is the one deliberate way out of the app, and every caller that uses
   * it says so on the button.
   */
  const openSection = useCallback((section: string) => {
    const route = SECTION_ROUTES[section];
    if (!route) { router.push(`/hr?section=${section}`); return; }
    if (route.tab) setTab(route.tab);
    setRequestFocus(route.focus ?? "all");
    setView(route.view ?? null);
    window.scrollTo({ top: 0 });
  }, [router]);

  /*
   * Where a tapped push notification lands. The service worker navigates the
   * app to `/hr/app?section=…`, which the shortcut handler above ignores, so
   * without this a notification about a payslip opened the Home screen.
   * Cleared from the URL for the same reason as `do`.
   */
  useEffect(() => {
    const section = search.get("section");
    if (!section) return;
    openSection(section);
    router.replace("/hr/app", { scroll: false });
  }, [search, router, openSection]);

  // Always the employee lens, whatever the session's own role is: this surface
  // exists to be the employee view, and an admin opening it should see what
  // their team sees rather than the whole organisation on a phone.
  const data = raw ? scopeSnapshotForView(raw, "employee", session.userId) : null;

  async function submit(payload: any) {
    const next = await requestJson("/api/hr", { method: "POST", body: JSON.stringify(payload) });
    setRaw(next);
    setComposer(null);
    setDraft(null);
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
      setNotifications((current) => current.map((row) => row.id === item.id ? { ...row, read: true, status: "Read" } : row));
    }
    // The href is a workspace URL; resolve it back to a section so the inbox
    // opens the app's own screen rather than throwing somebody out to /hr.
    openSection(new URL(item.href || "/hr", window.location.origin).searchParams.get("section") || "");
  }

  async function cancelLeave(id: string) {
    try { setRaw(await requestJson("/api/hr", { method: "POST", body: JSON.stringify({ operation: "delete", resource: "leave", id }) })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not cancel that request."); }
  }

  async function saveDetails(fields: Record<string, string>) {
    setSaving(true); setError("");
    try {
      /*
       * `self_update` rather than `update`: the general edit writes whatever
       * the caller's role allows and blanks the fields the payload omits, so
       * an admin saving this form would wipe their own title and department.
       */
      setRaw(await requestJson("/api/hr", {
        method: "POST",
        body: JSON.stringify({ operation: "self_update", resource: "employees", id: session.userId, data: fields }),
      }));
      setView(null);
      setNotice("Your details are saved.");
      window.setTimeout(() => setNotice(""), 5000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your details.");
    } finally {
      setSaving(false);
    }
  }

  const unread = notifications.filter((item) => !item.read).length;
  const pending = data
    ? data.leaveRequests.filter((item: any) => item.status === "Pending").length
      + data.claims.filter((item: any) => item.status === "Pending").length
    : 0;

  return <HRAppShell
    title={view ? VIEW_TITLES[view] : TITLES[tab]}
    tab={tab}
    onTab={(next) => { setTab(next); setView(null); setRequestFocus("all"); }}
    unread={unread}
    pendingRequests={pending}
    onBell={() => { setTab("inbox"); setView(null); }}
    onBack={view ? () => setView(null) : undefined}
  >
    {error && <div className="mb-4 rounded-2xl border border-destructive/25 bg-card p-4">
      <p className="text-xs leading-5 text-destructive">{error}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" />Try again</Button>
    </div>}

    {loading && !data && <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />Loading your HR…
    </div>}

    {data && view === "calendar" && <AppLeaveCalendar
      data={data}
      session={session}
      onApply={() => { setDraft(null); setComposer("leave"); }}
      onEditLeave={(item: any) => { setDraft(item); setComposer("leave"); }}
      onCancelLeave={cancelLeave}
    />}
    {data && view === "payslips" && <AppPayslips data={data} />}
    {data && view === "documents" && <AppDocuments data={data} session={session} />}
    {data && view === "team" && <AppTeam data={data} />}
    {data && view === "attendance" && <AppAttendance data={data} />}
    {data && view === "details" && <AppDetails
      data={data}
      session={session}
      onSave={saveDetails}
      saving={saving}
      error=""
    />}

    {data && !view && <>
      {tab === "home" && <AppHome
        data={data}
        session={session}
        today={today()}
        onTab={setTab}
        onOpenLeave={() => { setDraft(null); setComposer("leave"); }}
        onOpenClaim={() => { setDraft(null); setComposer("claim"); }}
        onClock={setClocking}
        onOpenHR={openSection}
      />}
      {tab === "timesheet" && <AppTimesheet
        data={data}
        session={session}
        onAdd={(date: string) => { setDraft({ date }); setComposer("task"); }}
        onEdit={(entry: any) => { setDraft(entry); setComposer("task"); }}
        onDelete={async (id: string) => {
          try { setRaw(await requestJson("/api/hr", { method: "POST", body: JSON.stringify({ operation: "delete", resource: "timesheets", id }) })); }
          catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete that task."); }
        }}
        onOpenHR={openSection}
      />}
      {tab === "requests" && <AppRequests
        data={data}
        focus={requestFocus}
        onOpenLeave={() => { setDraft(null); setComposer("leave"); }}
        onOpenClaim={() => { setDraft(null); setComposer("claim"); }}
        onEditLeave={(item: any) => { setDraft(item); setComposer("leave"); }}
        onCancelLeave={cancelLeave}
        onOpenHR={openSection}
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
        onOpenHR={openSection}
        onOpenWorkspace={() => router.push("/hr?section=self")}
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
      draft={draft}
      onClose={() => { setComposer(null); setDraft(null); }}
      onSubmit={submit}
    />}
  </HRAppShell>;
}

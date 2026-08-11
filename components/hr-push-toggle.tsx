"use client";

/**
 * Switching on notifications that arrive when the app is closed.
 *
 * The bell and the Inbox only ever spoke while the app was open, so leave
 * approved on a Friday afternoon was found out about on Monday. This registers
 * the device for web push.
 *
 * Most of the code here is about the states in which it *cannot* work, because
 * every one of them is common and each fails differently:
 *
 * On iOS, push works only for an app added to the home screen — Safari 16.4 and
 * later, and never in an ordinary tab. Somebody reading this in Safari needs to
 * be told to install first, not shown a button that will throw.
 *
 * Permission, once denied, cannot be asked for again from script. The browser
 * ignores the call silently. A denied state has to send people to their
 * settings rather than offering a button that does nothing.
 *
 * And the server may have no VAPID keys, which is the state of any deployment
 * where they have not been generated. That is a configuration gap, not a user's
 * problem, so it simply hides the control.
 */

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { AppCard } from "@/components/hr-app-shell";
import { Button } from "@/components/ui/button";
import { toApplicationServerKey } from "@/lib/push-key";

type PushState = {
  /** The server has keys. Without them there is nothing to offer. */
  configured: boolean;
  /** This browser can do push at all. */
  capable: boolean;
  /** iOS only does push for an installed app, so this gates the button there. */
  needsInstall: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
};

const isStandalone = () => typeof window !== "undefined" && (
  window.matchMedia?.("(display-mode: standalone)")?.matches
  || (window.navigator as any).standalone === true
);

/*
 * iOS is detected rather than feature-tested because the thing being detected
 * is a platform rule, not a missing API: Safari exposes PushManager in a tab
 * and then refuses to subscribe. iPadOS reports itself as a Mac, so the touch
 * point count is what separates it from a desktop.
 */
const isIOS = () => typeof navigator !== "undefined" && (
  /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
);

export function HRPushToggle() {
  const [state, setState] = useState<PushState>({
    configured: false, capable: false, needsInstall: false, permission: "default", subscribed: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const capable = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

    try {
      const response = await fetch("/api/hr/push", { cache: "no-store" });
      const data = await response.json();

      // The server's answer is about the account; the browser's own
      // registration is about this device. Both have to agree before the
      // toggle claims to be on — a subscription on a laptop must not make a
      // phone look subscribed.
      let subscribedHere = false;
      if (capable) {
        const registration = await navigator.serviceWorker.getRegistration();
        subscribedHere = Boolean(await registration?.pushManager.getSubscription());
      }

      setState({
        configured: Boolean(data.enabled),
        capable,
        needsInstall: isIOS() && !isStandalone(),
        permission: capable ? Notification.permission : "unsupported",
        subscribed: subscribedHere && Boolean(data.subscribed),
      });
    } catch {
      setState((current) => ({ ...current, capable }));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function enable() {
    setBusy(true); setError("");
    try {
      const { publicKey } = await (await fetch("/api/hr/push", { cache: "no-store" })).json();
      if (!publicKey) throw new Error("This server has no push key configured.");

      /*
       * Permission is requested before the service worker is touched, and from
       * this click — both browsers require the prompt to come from a gesture,
       * and awaiting anything slow first can cost the gesture on Safari.
       */
      const permission = await Notification.requestPermission();
      setState((current) => ({ ...current, permission }));
      if (permission !== "granted") throw new Error("Notifications were not allowed.");

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // Reuse the existing subscription where there is one: subscribing twice
      // with a different key throws rather than replacing.
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          // Required by every browser, and honest: every push this sends shows
          // a notification.
          userVisibleOnly: true,
          applicationServerKey: toApplicationServerKey(publicKey),
        });

      const response = await fetch("/api/hr/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Could not register this device.");

      setState((current) => ({ ...current, subscribed: true }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not turn on notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true); setError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      // The server is told first: a subscription dropped locally but left on
      // the server keeps receiving pushes for a device that will never show
      // them, and those failures are what eventually delete it.
      if (subscription) {
        await fetch("/api/hr/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => undefined);
        await subscription.unsubscribe().catch(() => undefined);
      }
      setState((current) => ({ ...current, subscribed: false }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not turn off notifications.");
    } finally {
      setBusy(false);
    }
  }

  // Nothing to offer until the server has keys — and nothing to explain either,
  // because it is a deployment gap rather than something anybody can act on.
  if (!ready || !state.configured) return null;

  if (!state.capable) return <AppCard title="Notifications">
    <p className="text-[11px] leading-4 text-muted-foreground">This browser cannot show notifications when the app is closed.</p>
  </AppCard>;

  return <AppCard title="Notifications">
    {state.subscribed ? <>
      <p className="text-[11px] leading-4 text-muted-foreground">
        On for this device. You will be told when leave or a claim is decided, when a payslip is issued, and when HR posts an announcement.
      </p>
      <Button variant="outline" className="mt-3 w-full bg-card" disabled={busy} onClick={disable}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}Turn off on this device
      </Button>
    </> : state.needsInstall ? <p className="text-[11px] leading-4 text-muted-foreground">
      iPhone and iPad only allow notifications for an app added to the home screen. Add this one using the steps below, open it from your home screen, and the switch will appear here.
    </p> : state.permission === "denied" ? <p className="text-[11px] leading-4 text-muted-foreground">
      Notifications are blocked for this app. A browser will not ask twice, so this has to be changed in your device settings — Settings, then Notifications, then Kretivco HR.
    </p> : <>
      <p className="text-[11px] leading-4 text-muted-foreground">
        Get told when leave or a claim is decided, when a payslip is issued, and when HR posts an announcement — without opening the app.
      </p>
      <Button className="mt-3 w-full" disabled={busy} onClick={enable}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}Turn on notifications
      </Button>
    </>}

    {error && <p className="mt-2 text-[11px] leading-4 text-destructive">{error}</p>}
  </AppCard>;
}

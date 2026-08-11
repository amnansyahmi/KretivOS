/**
 * Delivering a notification to a phone that is not open.
 *
 * Everything HR tells somebody already lands in `notifications`, and the app's
 * bell and Inbox read it — but only while the app is open. Leave approved on a
 * Friday afternoon was discovered on Monday morning. This sends the same row to
 * the device as a real notification.
 *
 * Never throws, and never blocks the thing that caused it. Approving leave must
 * not fail because a push service is down, so every send is best-effort and
 * every failure is swallowed after being counted. The in-app notification is
 * the record; the push is a courtesy on top of it.
 *
 * Configuration is a VAPID keypair in the environment. Absent — which is the
 * state of any checkout that has not generated one — `pushEnabled()` is false,
 * nothing is sent, and no error is raised. Generate a pair with:
 *
 *   npx web-push generate-vapid-keys
 *
 * and set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: or
 * https: URL identifying the sender, which the push services require).
 *
 * The payload shaping and the expiry rule live in `push-payload.ts`, where they
 * are asserted without a push service.
 */

import webpush from "web-push";
import { getDatabase } from "@/lib/db";
import { isExpiredSubscription, toPushPayload } from "@/lib/push-payload";

const ORGANIZATION_ID = "org-kretivco";

/**
 * How many consecutive failures before a subscription is abandoned.
 *
 * A phone that is off, or flat, or in a tunnel fails repeatedly and is still a
 * perfectly good subscription — so a single failure means nothing. Five in a
 * row, none of which was a definite 404 or 410, means something is wrong that
 * retrying will not fix.
 */
const MAX_CONSECUTIVE_FAILURES = 5;

export function pushEnabled() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** The public key the browser needs in order to subscribe. Safe to serve. */
export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || "";
}

let configured = false;

function configure() {
  if (configured || !pushEnabled()) return pushEnabled();
  webpush.setVapidDetails(
    // The push services require a contact for the sender. A placeholder is
    // used rather than refusing to send, because a missing subject is a
    // configuration slip, not a reason to silence every notification.
    process.env.VAPID_SUBJECT || "mailto:hr@kretivco.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
  return true;
}

export type PushSubscriptionInput = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
};

/**
 * Records a device against a person.
 *
 * Keyed on the endpoint, which is the address the push service routes on and
 * therefore identifies the install. Re-subscribing the same install updates the
 * row rather than adding a second one — browsers reissue a subscription
 * whenever the keys rotate, and without the upsert one phone would accumulate
 * rows and receive a notification once per row.
 *
 * The user id moves too, so a shared or reassigned device stops notifying the
 * person who used it last.
 */
export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionInput,
  userAgent = "",
) {
  const endpoint = String(subscription?.endpoint ?? "").trim();
  const p256dh = String(subscription?.keys?.p256dh ?? "").trim();
  const auth = String(subscription?.keys?.auth ?? "").trim();

  // Without the keys the payload cannot be encrypted, and an unencrypted push
  // carries no title or body — iOS will not display it at all.
  if (!endpoint || !p256dh || !auth) throw new Error("This browser did not return a complete push subscription.");
  if (!/^https:\/\//.test(endpoint)) throw new Error("A push endpoint must be an https URL.");

  const sql = getDatabase();
  await sql`
    insert into push_subscriptions (organization_id, user_id, endpoint, p256dh, auth, user_agent)
    values (${ORGANIZATION_ID}, ${userId}, ${endpoint}, ${p256dh}, ${auth}, ${userAgent.slice(0, 300)})
    on conflict (endpoint) do update set
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      failure_count = 0
  `;
}

/** Forgets a device, on sign-out or when notifications are switched off. */
export async function deletePushSubscription(endpoint: string) {
  const sql = getDatabase();
  await sql`delete from push_subscriptions where organization_id = ${ORGANIZATION_ID} and endpoint = ${String(endpoint ?? "").trim()}`;
}

/** Whether this person has at least one device listening. */
export async function hasPushSubscription(userId: string) {
  const sql = getDatabase();
  const rows = await sql`select 1 from push_subscriptions where organization_id = ${ORGANIZATION_ID} and user_id = ${userId} limit 1`;
  return rows.length > 0;
}

/**
 * Sends one notification to every device belonging to the given people.
 *
 * `userIds` empty means nobody, not everybody — an accidental broadcast is the
 * expensive mistake here, so the caller has to name who.
 *
 * Returns counts rather than throwing. A caller that wants to know can look;
 * a caller that does not can ignore it, which is what every caller does.
 */
export async function sendPushToUsers(
  userIds: string[],
  notification: { id?: string; title?: string; body?: string; entityType?: string; entityId?: string },
): Promise<{ sent: number; failed: number; removed: number }> {
  const idle = { sent: 0, failed: 0, removed: 0 };
  if (!configure() || !userIds.length) return idle;

  const payload = toPushPayload(notification);
  if (!payload) return idle;

  const sql = getDatabase();
  let devices: any[];
  try {
    devices = await sql`
      select id, endpoint, p256dh, auth, failure_count
      from push_subscriptions
      where organization_id = ${ORGANIZATION_ID} and user_id = any(${userIds})
    `;
  } catch {
    return idle;
  }
  if (!devices.length) return idle;

  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(devices.map(async (device: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        body,
        // Long enough that a phone switched off overnight still gets it in the
        // morning, short enough that a week-old "your leave was approved" does
        // not arrive as news.
        { TTL: 24 * 60 * 60, urgency: "normal" },
      );
      await sql`update push_subscriptions set last_used_at = now(), failure_count = 0 where id = ${device.id}`;
      return "sent" as const;
    } catch (error: any) {
      const gone = isExpiredSubscription(error?.statusCode)
        || Number(device.failure_count) + 1 >= MAX_CONSECUTIVE_FAILURES;

      if (gone) {
        await sql`delete from push_subscriptions where id = ${device.id}`;
        return "removed" as const;
      }
      await sql`update push_subscriptions set failure_count = failure_count + 1 where id = ${device.id}`;
      return "failed" as const;
    }
  }));

  const tally = { ...idle };
  for (const result of results) {
    if (result.status !== "fulfilled") { tally.failed += 1; continue; }
    if (result.value === "sent") tally.sent += 1;
    else if (result.value === "removed") tally.removed += 1;
    else tally.failed += 1;
  }
  return tally;
}

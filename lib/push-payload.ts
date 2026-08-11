/**
 * What a push notification says, and where tapping it lands.
 *
 * Split from the sending so it can be asserted without a push service. The
 * decisions here are the ones that go wrong in ways nobody notices until a
 * phone is buzzing at midnight with a truncated sentence.
 *
 * Three rules the service worker depends on:
 *
 * A `tag` per entity, so five updates about the same leave request replace one
 * another on the lock screen instead of stacking into five identical rows.
 *
 * A `url` inside the app's scope, so tapping opens the installed app rather
 * than a browser tab. The workspace hrefs stored on a notification are desktop
 * URLs; they are translated here, exactly as the app translates them when the
 * Inbox is tapped.
 *
 * A body short enough to survive the notification shade. iOS truncates around
 * a hundred and twenty characters and Android is not much kinder, so a payslip
 * body that ran long lost the amount at the end.
 *
 * Pure, and asserted in `push-payload.test.ts`.
 */

const clean = (value: unknown) => String(value ?? "").trim();

/** Where each kind of HR notification lives inside the employee app. */
const ENTITY_ROUTES: Record<string, string> = {
  hr_leave: "/hr/app?section=leave",
  hr_claim: "/hr/app?section=claims",
  hr_attendance_correction: "/hr/app?section=attendance",
  hr_payroll: "/hr/app?section=payslips",
  hr_announcement: "/hr/app?section=team",
  hr_event: "/hr/app?section=team",
  hr_lifecycle: "/hr/app",
  employee: "/hr/app?section=profile",
};

/**
 * The longest body worth sending.
 *
 * Notification shades truncate rather than wrap, and they truncate at the end —
 * which is where the useful half of "Your July payslip is ready · MYR 6,185.93"
 * sits. Trimmed here, on a word boundary, so what arrives is a whole thought.
 */
export const MAX_BODY_CHARACTERS = 120;

export function truncateBody(body: string, limit = MAX_BODY_CHARACTERS): string {
  const value = clean(body);
  if (value.length <= limit) return value;

  const cut = value.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(" ");
  // Only break on a word if one is reasonably near the end; otherwise a long
  // unbroken string would be cut back to almost nothing.
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  notificationId: string;
};

/**
 * Builds the payload for one notification row.
 *
 * Returns null when there is no title. A notification with no title renders as
 * a blank row on a lock screen — worse than not sending, because it cannot be
 * explained and cannot be acted on.
 */
export function toPushPayload(notification: {
  id?: unknown;
  title?: unknown;
  body?: unknown;
  entityType?: unknown;
  entityId?: unknown;
}): PushPayload | null {
  const title = clean(notification?.title);
  if (!title) return null;

  const entityType = clean(notification?.entityType);
  const entityId = clean(notification?.entityId);

  return {
    title,
    body: truncateBody(clean(notification?.body)),
    url: ENTITY_ROUTES[entityType] || "/hr/app",
    // Falls back to the type so that, say, two announcements still collapse
    // rather than stacking. An id makes it per-record where one exists.
    tag: entityId ? `${entityType}:${entityId}` : entityType || "hr",
    notificationId: clean(notification?.id),
  };
}

/**
 * Whether a failed send means the subscription is gone.
 *
 * 404 and 410 are the push services saying the install no longer exists —
 * uninstalled, or permission revoked. Those rows are deleted. Everything else
 * is a bad minute rather than a dead device: a 500 from a push service, or a
 * timeout, must not delete a working subscription for a phone that is simply
 * off.
 */
export function isExpiredSubscription(statusCode: unknown): boolean {
  return statusCode === 404 || statusCode === 410;
}

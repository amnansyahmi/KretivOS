/**
 * Registering a device for push notifications.
 *
 * GET reports whether push is configured at all and hands back the public
 * VAPID key, which is the only thing a browser needs in order to subscribe. It
 * is a public key by construction — it is designed to be shipped to clients —
 * so serving it is not a leak. The private half never leaves the server.
 *
 * POST stores whatever `PushManager.subscribe()` returned, against the signed-in
 * person. A subscription is issued to a specific browser install, so it is
 * always the caller's own: there is no id in the payload to get wrong, and no
 * way to subscribe on somebody else's behalf.
 *
 * DELETE forgets one device, which is what switching notifications off does.
 */

import { NextRequest, NextResponse } from "next/server";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";
import { deletePushSubscription, hasPushSubscription, pushEnabled, pushPublicKey, savePushSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "Push notification request failed.";
  return NextResponse.json({ error: message }, { status: error instanceof HRAuthError ? error.status : 400 });
}

export async function GET() {
  try {
    const session = await requireHRSession();
    return NextResponse.json({
      enabled: pushEnabled(),
      publicKey: pushPublicKey(),
      // Whether any device is already registered, so the app can show
      // "Notifications are on" rather than asking again on every screen.
      subscribed: pushEnabled() ? await hasPushSubscription(session.userId).catch(() => false) : false,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireHRSession();
    if (!pushEnabled()) throw new Error("Push notifications are not configured on this server.");

    const body = object(await request.json());
    await savePushSubscription(
      session.userId,
      object(body.subscription) as any,
      String(request.headers.get("user-agent") || ""),
    );
    return NextResponse.json({ subscribed: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireHRSession();
    const body = object(await request.json().catch(() => ({})));
    const endpoint = String(body.endpoint ?? "").trim();
    if (endpoint) await deletePushSubscription(endpoint);
    return NextResponse.json({ subscribed: false });
  } catch (error) {
    return fail(error);
  }
}

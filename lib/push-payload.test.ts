import assert from "node:assert/strict";
import test from "node:test";
import { isExpiredSubscription, MAX_BODY_CHARACTERS, toPushPayload, truncateBody } from "./push-payload.ts";

test("a short body is left exactly as written", () => {
  assert.equal(truncateBody("Your leave was approved."), "Your leave was approved.");
  assert.equal(truncateBody(""), "");
});

test("a long body is cut on a word, not mid-word", () => {
  const body = "Your annual leave request for the seventeenth through the nineteenth of August has been approved by your manager with a note attached";
  const result = truncateBody(body);

  assert.ok(result.length <= MAX_BODY_CHARACTERS, `${result.length} characters is too long for a lock screen`);
  assert.ok(result.endsWith("…"));

  // The kept text must be a prefix of the original that stops where a word
  // does — so the original has a space at the point the cut was made.
  const kept = result.slice(0, -1);
  assert.ok(body.startsWith(kept), "the trimmed body is not the start of the original");
  assert.equal(body[kept.length], " ", `cut mid-word: ${JSON.stringify(result.slice(-14))}`);
});

test("an unbroken string is cut anyway rather than shrinking to nothing", () => {
  // No spaces to break on, so word-breaking would leave an empty notification.
  const result = truncateBody("x".repeat(400));
  assert.ok(result.length > MAX_BODY_CHARACTERS * 0.9);
  assert.ok(result.endsWith("…"));
});

test("a body exactly at the limit is not touched", () => {
  const body = "a".repeat(MAX_BODY_CHARACTERS);
  assert.equal(truncateBody(body), body);
  assert.ok(truncateBody("a".repeat(MAX_BODY_CHARACTERS + 1)).endsWith("…"));
});

test("each kind of notification opens the app screen it is about", () => {
  const url = (entityType: string) => toPushPayload({ title: "x", entityType })!.url;

  assert.equal(url("hr_leave"), "/hr/app?section=leave");
  assert.equal(url("hr_claim"), "/hr/app?section=claims");
  assert.equal(url("hr_payroll"), "/hr/app?section=payslips");
  assert.equal(url("hr_announcement"), "/hr/app?section=team");
});

test("every route stays inside the app, never the desktop workspace", () => {
  // A push that opened /hr would drop somebody into the workspace from their
  // lock screen, which is the one-way door the app was built to avoid.
  for (const entityType of ["hr_leave", "hr_claim", "hr_payroll", "hr_announcement", "hr_event", "hr_lifecycle", "employee", "unknown_thing", ""]) {
    const { url } = toPushPayload({ title: "x", entityType })!;
    assert.ok(url.startsWith("/hr/app"), `${entityType || "(empty)"} routed to ${url}`);
  }
});

test("updates about the same record collapse instead of stacking", () => {
  const first = toPushPayload({ title: "Submitted", entityType: "hr_leave", entityId: "abc" })!;
  const second = toPushPayload({ title: "Approved", entityType: "hr_leave", entityId: "abc" })!;
  assert.equal(first.tag, second.tag, "two updates about one request must replace each other");

  const other = toPushPayload({ title: "Approved", entityType: "hr_leave", entityId: "xyz" })!;
  assert.notEqual(first.tag, other.tag, "but two different requests are two notifications");
});

test("a notification with no record still gets a usable tag", () => {
  assert.equal(toPushPayload({ title: "x", entityType: "hr_announcement" })!.tag, "hr_announcement");
  assert.equal(toPushPayload({ title: "x" })!.tag, "hr");
});

test("a notification with no title is not sent", () => {
  // It would render as a blank row that cannot be explained or acted on.
  assert.equal(toPushPayload({ body: "something happened" }), null);
  assert.equal(toPushPayload({ title: "   " }), null);
  assert.equal(toPushPayload({}), null);
});

test("the notification id is carried so a tap can mark it read", () => {
  assert.equal(toPushPayload({ id: "n-1", title: "x" })!.notificationId, "n-1");
  assert.equal(toPushPayload({ title: "x" })!.notificationId, "");
});

test("only a gone subscription is treated as gone", () => {
  assert.equal(isExpiredSubscription(404), true);
  assert.equal(isExpiredSubscription(410), true);

  // A phone that is off, or a push service having a bad minute, must not cost
  // somebody their subscription.
  assert.equal(isExpiredSubscription(500), false);
  assert.equal(isExpiredSubscription(429), false);
  assert.equal(isExpiredSubscription(undefined), false);
  assert.equal(isExpiredSubscription(null), false);
  assert.equal(isExpiredSubscription("410"), false, "a string status is not a status");
});

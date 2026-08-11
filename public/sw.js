const CACHE = "kretivos-v9";
const APP_SHELL = [
  "/",
  "/business",
  "/hr",
  "/hr/app",
  "/hr/attendance-review",
  "/brands",
  "/funnels",
  "/knowledge",
  "/knowledge/add",
  "/automations",
  "/templates",
  "/manifest.webmanifest",
  "/hr-app.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", event =>
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
);

self.addEventListener("activate", event =>
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
);

/**
 * A push arriving while the app is closed.
 *
 * `showNotification` is not optional: a browser that receives a push and shows
 * nothing may revoke the permission, so even a payload that fails to parse gets
 * a generic notification rather than silence.
 *
 * The `tag` collapses repeats — five updates about one leave request replace
 * each other on the lock screen instead of stacking into five identical rows.
 */
self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Kretivco HR";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      tag: payload.tag || "hr",
      // Replaces the notification carrying the same tag rather than adding to
      // it, which is the point of the tag.
      renotify: Boolean(payload.tag),
      icon: "/hr/app/icon",
      badge: "/hr/app/icon",
      data: { url: payload.url || "/hr/app", notificationId: payload.notificationId || "" }
    })
  );
});

/**
 * Tapping the notification.
 *
 * Focuses an already-open window rather than opening a second one — an
 * installed app that spawns a new window per notification quickly has several,
 * all showing the same thing. `navigate` moves the focused window to the screen
 * the notification was about.
 */
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/hr/app";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.includes("/hr/app") && "focus" in client) {
          if ("navigate" in client) client.navigate(url).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Shared business, HR and AI responses are never cached: they are per-request
  // data that must not be written to CacheStorage or replayed while offline.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(response => response || caches.match("/")))
  );
});

const CACHE = "kretivos-v6";
const APP_SHELL = [
  "/",
  "/business",
  "/hr",
  "/brands",
  "/funnels",
  "/knowledge",
  "/knowledge/add",
  "/automations",
  "/templates",
  "/manifest.webmanifest",
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

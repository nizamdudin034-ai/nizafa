// Nizafa service worker — app-shell caching only.
// Caches ONLY truly static files (manifest, icons). The homepage ("/")
// is NEVER cached: it is a live page whose HTML points at hashed CSS
// from the current deploy. Caching "/" cache-first (as v1 did) served
// days-old HTML after every deploy, and the old HTML's hashed CSS no
// longer exists — so returning visitors saw a plain unstyled page.
// Network-first for "/" with the cache only as an offline fallback.
// Bump CACHE on any future change so old caches are deleted on activate.
const CACHE = "nizafa-shell-v2";
const SHELL = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .catch(() => undefined)
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Only same-origin GET requests for the shell; everything else
  // (including /api/*) passes straight through to the network.
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }
  if (!SHELL.includes(url.pathname)) return;
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
          return res;
        })
    )
  );
});

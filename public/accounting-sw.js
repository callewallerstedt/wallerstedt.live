const STATIC_CACHE = "wallerstedt-accounting-static-v2";
const SAFE_STATIC_ASSETS = [
  "/accounting-logo.png",
  "/accounting-icon-180.png",
  "/accounting-icon-192.png",
  "/accounting-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(SAFE_STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => (
            key !== STATIC_CACHE
            && (
              key.startsWith("wallerstedt-accounting-")
              || key.startsWith("accounting-private-")
              || key.startsWith("vault-private-")
            )
          ))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Private pages, API data and documents always go directly to the network.
  // They are intentionally never placed in Cache Storage by this worker.
  if (
    event.request.method !== "GET"
    || url.origin !== self.location.origin
    || url.pathname.startsWith("/vault/")
    || url.pathname.startsWith("/api/accounting/")
    || url.pathname.includes("/documents/")
  ) {
    return;
  }

  if (SAFE_STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request)),
    );
  }
});

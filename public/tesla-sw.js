const CACHE = "wallerstedt-drive-v2";
const SHELL = ["/tesla", "/tesla/manifest.webmanifest", "/tesla-drive-icon.svg", "/tesla-icon-192.png", "/tesla-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok && url.origin === self.location.origin) {
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, response.clone())));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === "navigate") return caches.match("/tesla");
    return Response.error();
  }));
});

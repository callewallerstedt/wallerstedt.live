const STATIC_CACHE = "wallerstedt-bolag-static-v1";
const LAST_PUSH_CACHE = "wallerstedt-bolag-push";
const LAST_PUSH_PATH = "/__bolag-last-push";
const PRECACHE = [
  "/accounting-logo.png",
  "/accounting-icon-180.png",
  "/accounting-icon-192.png",
  "/accounting-icon-512.png",
];

function isStaticAsset(url) {
  return PRECACHE.includes(url.pathname) || url.pathname.startsWith("/_next/static/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => (
            key.startsWith("wallerstedt-bolag-")
            && key !== STATIC_CACHE
            && key !== LAST_PUSH_CACHE
          ))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Icons and hashed JS/CSS only. HTML, RSC, APIs and cookies stay on the network.
  if (
    event.request.method !== "GET"
    || url.origin !== self.location.origin
    || !isStaticAsset(url)
  ) {
    return;
  }
  event.respondWith(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        });
      }),
    ),
  );
});

function cacheJson(path, value) {
  return caches.open(LAST_PUSH_CACHE).then((cache) => cache.put(
    path,
    new Response(JSON.stringify(value), {
      headers: { "Content-Type": "application/json" },
    }),
  ));
}

function readCachedJson(path) {
  return caches.open(LAST_PUSH_CACHE)
    .then((cache) => cache.match(path))
    .then((response) => (response ? response.json() : null))
    .catch(() => null);
}

function parsePayload(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    return { body: event.data ? event.data.text() : "" };
  }
}

function normalizeTarget(input) {
  const record = input && typeof input === "object" ? input : {};
  const title = String(record.title || "Go record").trim() || "Go record";
  const body = String(record.body || "Your piano won't play itself.").trim();
  const url = String(record.url || "").trim();
  const tag = String(record.tag || record.kind || "record-nudge").trim() || "record-nudge";
  return {
    kind: String(record.kind || "record").trim() || "record",
    title,
    body,
    url: url || `${self.location.origin}/bolag/`,
    tag,
  };
}

async function openTarget(target) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    if (!("focus" in client)) continue;
    let clientUrl;
    try {
      clientUrl = new URL(client.url);
    } catch {
      continue;
    }
    if (!clientUrl.pathname.startsWith("/bolag/")) continue;

    const focused = await client.focus();
    const active = focused || client;
    if (typeof active.navigate === "function" && target.url) {
      try {
        await active.navigate(target.url);
      } catch {
        // iOS often rejects WindowClient.navigate() from a Home Screen PWA.
      }
    }
    return active;
  }

  if (self.clients.openWindow) {
    return self.clients.openWindow(target.url);
  }
  return undefined;
}

self.addEventListener("push", (event) => {
  const target = normalizeTarget(parsePayload(event));
  event.waitUntil(
    cacheJson(LAST_PUSH_PATH, target).then(() => self.registration.showNotification(target.title, {
      body: target.body,
      icon: "/accounting-icon-192.png",
      badge: "/accounting-icon-192.png",
      tag: target.tag,
      renotify: true,
      data: target,
    })),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    readCachedJson(LAST_PUSH_PATH).then((lastPush) => {
      const data = event.notification && event.notification.data && typeof event.notification.data === "object"
        ? event.notification.data
        : {};
      return openTarget(normalizeTarget({ ...lastPush, ...data }));
    }),
  );
});

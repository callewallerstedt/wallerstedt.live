const LAST_PUSH_CACHE = "wallerstedt-bolag-push";
const LAST_PUSH_PATH = "/__bolag-last-push";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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

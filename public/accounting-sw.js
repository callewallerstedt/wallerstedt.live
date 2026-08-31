const STATIC_CACHE = "wallerstedt-accounting-static-v4";
const PENDING_OPEN_CACHE = "wallerstedt-accounting-push-open";
const PENDING_OPEN_PATH = "/__accounting-pending-open";
const LAST_PUSH_PATH = "/__accounting-last-push";
const OPEN_MESSAGE = "open-accounting-post";
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
            && key !== PENDING_OPEN_CACHE
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

function postIdFromUrl(value) {
  try {
    return new URL(value, self.location.origin).searchParams.get("post")?.trim() || "";
  } catch {
    return "";
  }
}

function cacheJson(path, value) {
  return caches.open(PENDING_OPEN_CACHE).then((cache) => cache.put(
    path,
    new Response(JSON.stringify(value), {
      headers: { "Content-Type": "application/json" },
    }),
  ));
}

function readCachedJson(path) {
  return caches.open(PENDING_OPEN_CACHE)
    .then((cache) => cache.match(path))
    .then((response) => (response ? response.json() : null))
    .catch(() => null);
}

function takeCachedJson(path) {
  return caches.open(PENDING_OPEN_CACHE).then(async (cache) => {
    const response = await cache.match(path);
    if (!response) return null;
    await cache.delete(path);
    try {
      return await response.json();
    } catch {
      return null;
    }
  }).catch(() => null);
}

function normalizeTarget(input, fallback) {
  const record = input && typeof input === "object" ? input : {};
  const fallbackRecord = fallback && typeof fallback === "object" ? fallback : {};
  const url = String(record.url || fallbackRecord.url || "").trim();
  const postId = String(record.postId || fallbackRecord.postId || postIdFromUrl(url) || "").trim();
  const action = String(record.action || fallbackRecord.action || "create").trim() || "create";
  return {
    title: String(record.title || fallbackRecord.title || ""),
    body: String(record.body || fallbackRecord.body || ""),
    url: url || (postId ? `${self.location.origin}/vault/?post=${encodeURIComponent(postId)}` : `${self.location.origin}/vault/`),
    postId,
    action,
  };
}

function targetFromNotification(notification, fallback) {
  const data = notification && notification.data && typeof notification.data === "object"
    ? notification.data
    : {};
  const tag = typeof notification?.tag === "string" ? notification.tag : "";
  const tagged = /^accounting-post:([^:]+)/.exec(tag);
  return normalizeTarget({
    ...data,
    postId: data.postId || (tagged ? tagged[1] : ""),
  }, fallback);
}

function postOpenMessage(client, target) {
  if (client && "postMessage" in client) {
    client.postMessage({
      type: OPEN_MESSAGE,
      url: target.url,
      postId: target.postId,
      action: target.action,
    });
  }
}

async function openTarget(target) {
  await cacheJson(PENDING_OPEN_PATH, target);
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    if (!("focus" in client)) continue;
    let clientUrl;
    try {
      clientUrl = new URL(client.url);
    } catch {
      continue;
    }
    if (!clientUrl.pathname.startsWith("/vault/")) continue;

    const focused = await client.focus();
    const active = focused || client;
    postOpenMessage(active, target);

    // iOS often launches the PWA at start_url and rejects WindowClient.navigate().
    // Keep postMessage + the pending-open cache as the reliable path.
    if (typeof active.navigate === "function" && target.url) {
      try {
        const navigated = await active.navigate(target.url);
        if (navigated) postOpenMessage(navigated, target);
      } catch {
        // Ignore navigate failures; the focused client still has the postMessage.
      }
    }
    return active;
  }

  if (self.clients.openWindow) {
    const opened = await self.clients.openWindow(target.url);
    if (opened) postOpenMessage(opened, target);
    return opened;
  }
  return undefined;
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const target = normalizeTarget(payload);
  const title = target.title || "Ny post";
  event.waitUntil(
    cacheJson(LAST_PUSH_PATH, target).then(() => self.registration.showNotification(title, {
      body: target.body || "En ny post har bokförts.",
      icon: "/accounting-icon-192.png",
      badge: "/accounting-icon-192.png",
      tag: target.postId ? `accounting-post:${target.postId}:${target.action}` : "accounting-post",
      renotify: true,
      data: {
        url: target.url,
        postId: target.postId,
        action: target.action,
      },
    })),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    readCachedJson(LAST_PUSH_PATH).then((lastPush) => {
      const target = targetFromNotification(event.notification, lastPush);
      return openTarget(target);
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "consume-pending-open") return;
  event.waitUntil(
    takeCachedJson(PENDING_OPEN_PATH).then((pending) => {
      if (!pending || !event.source) return undefined;
      const target = normalizeTarget(pending);
      postOpenMessage(event.source, target);
      return undefined;
    }),
  );
});

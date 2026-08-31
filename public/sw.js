/* Public PWA worker: push only. Do not cache pages or intercept fetches. */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = String(payload.title || "Wallerstedt");
  const options = {
    body: String(payload.body || "New piano music is out."),
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: String(payload.url || "/") },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          const clientUrl = new URL(client.url);
          const targetUrl = new URL(target, self.location.origin);
          if (clientUrl.origin === targetUrl.origin) {
            return client.focus().then(() => {
              if ("navigate" in client && clientUrl.pathname !== targetUrl.pathname) {
                return client.navigate(targetUrl.href);
              }
              return client;
            });
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    }),
  );
});

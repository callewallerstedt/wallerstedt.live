"use client";

import { useCallback, useEffect, useState } from "react";

type OptInState =
  | "loading"
  | "unavailable"
  | "needs-install"
  | "prompt"
  | "enabled"
  | "blocked"
  | "error";

function isStandaloneDisplay() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

async function getPublicKey() {
  const response = await fetch("/api/push/public-key", { cache: "no-store" });
  if (!response.ok) {
    return "";
  }
  const data = (await response.json()) as { configured?: boolean; publicKey?: string };
  return data.configured && data.publicKey ? data.publicKey : "";
}

export function NotificationOptIn() {
  const [state, setState] = useState<OptInState>("loading");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("Notification" in window)) {
      setState("unavailable");
      return;
    }

    const publicKey = await getPublicKey();
    if (!publicKey) {
      setState("unavailable");
      return;
    }

    const standalone = isStandaloneDisplay();
    const ios = isIosDevice();
    const pushSupported = "PushManager" in window;

    if (ios && !standalone) {
      setState("needs-install");
      return;
    }

    if (!pushSupported) {
      setState(ios ? "needs-install" : "unavailable");
      return;
    }

    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    setState(subscription && Notification.permission === "granted" ? "enabled" : "prompt");
  }, []);

  useEffect(() => {
    void refresh().catch(() => setState("unavailable"));
  }, [refresh]);

  async function enable() {
    setMessage("");
    try {
      const publicKey = await getPublicKey();
      if (!publicKey) {
        setState("unavailable");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "prompt");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        throw new Error("Could not save the subscription.");
      }

      setState("enabled");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not enable notifications.");
    }
  }

  async function disable() {
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("prompt");
    } catch {
      setState("error");
      setMessage("Could not turn notifications off.");
    }
  }

  if (state === "loading" || state === "unavailable") {
    return null;
  }

  return (
    <section className="notify-optin" id="notifications" aria-labelledby="notify-heading">
      <h2 id="notify-heading">Phone notifications</h2>
      {state === "needs-install" ? (
        <>
          <p>On iPhone, add this site to your Home Screen first. Open it from there, then you can enable notifications.</p>
          <ol className="notify-optin__steps">
            <li>Tap the Share button in Safari.</li>
            <li>Choose Add to Home Screen.</li>
            <li>Open Wallerstedt from the Home Screen and tap Enable notifications.</li>
          </ol>
        </>
      ) : null}
      {state === "prompt" ? (
        <>
          <p>Get a short notification when a new piece is published. You can turn this off anytime.</p>
          <button className="button button--primary" type="button" onClick={() => void enable()}>
            Enable notifications
          </button>
        </>
      ) : null}
      {state === "enabled" ? (
        <>
          <p>Notifications are on. You will hear about new music when it goes live.</p>
          <button className="button button--ghost" type="button" onClick={() => void disable()}>
            Turn off notifications
          </button>
        </>
      ) : null}
      {state === "blocked" ? (
        <p>Notifications are blocked for this app. You can enable them in iPhone Settings.</p>
      ) : null}
      {state === "error" ? (
        <>
          <p>{message || "Notifications could not be updated just now."}</p>
          <button className="button button--ghost" type="button" onClick={() => void refresh()}>
            Try again
          </button>
        </>
      ) : null}
    </section>
  );
}

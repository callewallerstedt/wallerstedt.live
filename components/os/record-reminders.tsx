"use client";

import { useEffect, useState } from "react";
import { BellIcon, CheckIcon } from "lucide-react";

import { Panel } from "@/components/os/ui";
import { Button } from "@/components/ui/button";

type NotifyState = "loading" | "hidden" | "needs-install" | "prompt" | "enabled" | "blocked" | "error";

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches
    || ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
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

async function osJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function pushBase(accessKey: string) {
  return `/api/os/${encodeURIComponent(accessKey)}/push`;
}

export function RecordReminders({ accessKey }: { accessKey: string }) {
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [state, setState] = useState<NotifyState>("loading");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIsIos(isIosDevice());
    setIsStandalone(isStandaloneDisplay());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (!("serviceWorker" in navigator) || !("Notification" in window)) {
        if (!cancelled) setState("hidden");
        return;
      }

      let publicKey = "";
      try {
        const payload = await osJson<{ publicKey?: string }>(`${pushBase(accessKey)}/public-key`);
        publicKey = payload.publicKey?.trim() ?? "";
      } catch {
        if (!cancelled) setState("hidden");
        return;
      }
      if (!publicKey) {
        if (!cancelled) setState("hidden");
        return;
      }

      const standalone = isStandaloneDisplay();
      const ios = isIosDevice();
      if (ios && !standalone) {
        if (!cancelled) setState("needs-install");
        return;
      }
      if (!("PushManager" in window)) {
        if (!cancelled) setState(ios ? "needs-install" : "hidden");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!cancelled) {
        setState(subscription && Notification.permission === "granted" ? "enabled" : "prompt");
      }
    }

    void refresh();
    return () => {
      cancelled = true;
    };
  }, [accessKey, isStandalone]);

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      const payload = await osJson<{ publicKey?: string }>(`${pushBase(accessKey)}/public-key`);
      const publicKey = payload.publicKey?.trim() ?? "";
      if (!publicKey) {
        setState("hidden");
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
      await osJson(`${pushBase(accessKey)}/subscribe`, {
        method: "POST",
        body: JSON.stringify(subscription.toJSON()),
      });
      setState("enabled");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await osJson(`${pushBase(accessKey)}/subscribe`, {
          method: "DELETE",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("prompt");
    } catch {
      setState("error");
      setMessage("Could not turn notifications off.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage("");
    try {
      const result = await osJson<{ title?: string }>(`${pushBase(accessKey)}/test`, {
        method: "POST",
        body: "{}",
      });
      setMessage(result.title ? `Sent: ${result.title}` : "Test sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send a test.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "hidden") return null;

  return (
    <Panel
      title="Record reminders"
      footer="iPhone only delivers these from the Home Screen app, not from a Safari tab. One ping a day at 20:00 Berlin."
    >
      <div className="border-t border-border px-3 py-3 text-sm text-muted-foreground">
        {state === "needs-install" ? (
          isIos ? (
            <ol className="list-decimal space-y-1 pl-4">
              <li>Open this page in <strong className="text-foreground">Safari</strong>.</li>
              <li>Tap <strong className="text-foreground">Share</strong>, then <strong className="text-foreground">Add to Home Screen</strong>.</li>
              <li>Open <strong className="text-foreground">Bolag</strong> from the Home Screen and come back here.</li>
            </ol>
          ) : (
            <p>Install Bolag as an app, then enable notifications here.</p>
          )
        ) : null}

        {state === "prompt" || state === "loading" ? (
          <div className="space-y-3">
            <p>
              Daily 20:00 nudge to go record. Lines like “You want that car or no?” and
              “Your piano won&apos;t play itself.”
            </p>
            <Button
              className="min-h-11 md:min-h-8"
              disabled={busy || state === "loading"}
              onClick={() => void enable()}
              type="button"
              variant="brand"
            >
              <BellIcon />
              Enable notifications
            </Button>
          </div>
        ) : null}

        {state === "enabled" ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-foreground">
              <CheckIcon className="size-4" />
              On. You will get a short roast at 20:00 if you have not already been pinged today.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-11 md:min-h-8"
                disabled={busy}
                onClick={() => void sendTest()}
                type="button"
                variant="outline"
              >
                Send a test
              </Button>
              <Button
                className="min-h-11 md:min-h-8"
                disabled={busy}
                onClick={() => void disable()}
                type="button"
                variant="ghost"
              >
                Turn off
              </Button>
            </div>
          </div>
        ) : null}

        {state === "blocked" ? (
          <p>Notifications are blocked for this app. Enable them in iPhone Settings → Bolag.</p>
        ) : null}

        {state === "error" ? (
          <p className="text-destructive" role="alert">{message || "Notifications could not be updated."}</p>
        ) : null}

        {state !== "error" && message ? <p className="pt-2">{message}</p> : null}
      </div>
    </Panel>
  );
}

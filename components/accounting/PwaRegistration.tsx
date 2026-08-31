"use client";

import { useEffect, useState } from "react";
import { AccountingIcons as Icon } from "./AccountingIcons";
import type { AccountingApi } from "./api";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type NotifyState = "hidden" | "needs-install" | "prompt" | "enabled" | "blocked" | "error";

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

export function PwaRegistration({ api, visible }: { api: AccountingApi; visible: boolean }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [registrationFailed, setRegistrationFailed] = useState(false);
  const [notifyState, setNotifyState] = useState<NotifyState>("hidden");
  const [notifyMessage, setNotifyMessage] = useState("");

  useEffect(() => {
    const standalone = isStandaloneDisplay();
    setIsStandalone(standalone);
    setIsIos(isIosDevice());

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/accounting-sw.js", { scope: "/vault/", updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => setRegistrationFailed(true));
    }

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    async function refreshNotify() {
      if (!("serviceWorker" in navigator) || !("Notification" in window)) {
        if (!cancelled) setNotifyState("hidden");
        return;
      }

      let publicKey = "";
      try {
        publicKey = await api.pushPublicKey();
      } catch {
        if (!cancelled) setNotifyState("hidden");
        return;
      }
      if (!publicKey) {
        if (!cancelled) setNotifyState("hidden");
        return;
      }

      const standalone = isStandaloneDisplay();
      const ios = isIosDevice();
      if (ios && !standalone) {
        if (!cancelled) setNotifyState("needs-install");
        return;
      }
      if (!("PushManager" in window)) {
        if (!cancelled) setNotifyState(ios ? "needs-install" : "hidden");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setNotifyState("blocked");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!cancelled) {
        setNotifyState(subscription && Notification.permission === "granted" ? "enabled" : "prompt");
      }
    }

    void refreshNotify();
    return () => {
      cancelled = true;
    };
  }, [api, visible, isStandalone]);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }

  async function enableNotifications() {
    setNotifyMessage("");
    try {
      const publicKey = await api.pushPublicKey();
      if (!publicKey) {
        setNotifyState("hidden");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotifyState(permission === "denied" ? "blocked" : "prompt");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await api.savePushSubscription(subscription.toJSON());
      setNotifyState("enabled");
    } catch (error) {
      setNotifyState("error");
      setNotifyMessage(error instanceof Error ? error.message : "Kunde inte slå på aviseringar.");
    }
  }

  async function disableNotifications() {
    setNotifyMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api.deletePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setNotifyState("prompt");
    } catch {
      setNotifyState("error");
      setNotifyMessage("Kunde inte stänga av aviseringar.");
    }
  }

  if (!visible) return null;

  return (
    <section className="ac-card ac-install-card" aria-labelledby="install-heading">
      <div className="ac-section-icon ac-section-icon--blue"><Icon.Download /></div>
      <div>
        <p className="ac-eyebrow">iPhone-app</p>
        <h2 id="install-heading">Ha bokföringen på hemskärmen</h2>
        {isStandalone ? (
          <p className="ac-success-copy"><Icon.Check size={18} /> Appen är installerad och öppnas i eget fönster.</p>
        ) : installPrompt ? (
          <>
            <p>Installera den som en app för snabb åtkomst utan webbläsarens menyer.</p>
            <button className="ac-button ac-button--primary" type="button" onClick={() => void install()}>
              <Icon.Download /> Installera appen
            </button>
          </>
        ) : isIos ? (
          <ol className="ac-install-steps">
            <li>Öppna sidan i <strong>Safari</strong>.</li>
            <li>Tryck på <strong>Dela</strong> i verktygsfältet.</li>
            <li>Välj <strong>Lägg till på hemskärmen</strong> och sedan <strong>Lägg till</strong>.</li>
          </ol>
        ) : (
          <p>Öppna webbläsarens meny och välj <strong>Installera app</strong> eller <strong>Lägg till på startskärmen</strong>.</p>
        )}
        {registrationFailed && (
          <p className="ac-help-text">Appregistreringen kunde inte slutföras just nu. Sidan fungerar fortfarande i webbläsaren.</p>
        )}

        {notifyState === "needs-install" ? (
          <p className="ac-help-text">När appen är öppnad från hemskärmen kan du slå på aviseringar för poster.</p>
        ) : null}
        {notifyState === "prompt" ? (
          <>
            <p>Få en kort notis när en post bokförs, ändras eller tas bort. Inget pop-up-fönster visas förrän du själv trycker.</p>
            <button className="ac-button ac-button--secondary" type="button" onClick={() => void enableNotifications()}>
              <Icon.Bell /> Slå på aviseringar
            </button>
          </>
        ) : null}
        {notifyState === "enabled" ? (
          <>
            <p className="ac-success-copy"><Icon.Check size={18} /> Aviseringar är på för nya, ändrade och raderade poster.</p>
            <button className="ac-button ac-button--ghost" type="button" onClick={() => void disableNotifications()}>
              Stäng av aviseringar
            </button>
          </>
        ) : null}
        {notifyState === "blocked" ? (
          <p className="ac-help-text">Aviseringar är blockerade för appen. Du kan slå på dem i iPhone-inställningarna.</p>
        ) : null}
        {notifyState === "error" ? (
          <p className="ac-settings-error" role="alert"><Icon.Alert size={16} /> {notifyMessage || "Aviseringar kunde inte uppdateras just nu."}</p>
        ) : null}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AccountingIcons as Icon } from "./AccountingIcons";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaRegistration({ visible }: { visible: boolean }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [registrationFailed, setRegistrationFailed] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    setIsStandalone(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent));

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

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
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
      </div>
    </section>
  );
}

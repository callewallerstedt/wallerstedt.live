"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { CloseIcon, MailIcon } from "@/components/site/icons";
import { UpdatesForm } from "@/components/site/updates-form";

const SignupContext = createContext<(source: string) => void>(() => {});

export function useSignupModal() {
  return useContext(SignupContext);
}

/** One signup dialog for the whole site; anything can open it with `useSignupModal()`. */
export function SignupModalProvider({ art, children }: { art?: string; children: ReactNode }) {
  const [source, setSource] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const open = source !== null;

  const show = useCallback((from: string) => setSource(from), []);
  const close = useCallback(() => setSource(null), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    const focus = setTimeout(() => dialogRef.current?.querySelector<HTMLInputElement>("input[type=email]")?.focus(), 250);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
      clearTimeout(focus);
    };
  }, [close, open]);

  return (
    <SignupContext.Provider value={show}>
      {children}
      <div className={`wl-modal${open ? " is-open" : ""}`} aria-hidden={!open} onClick={close}>
        <div
          className="wl-modal__card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wl-modal-title"
          ref={dialogRef}
          onClick={(event) => event.stopPropagation()}
        >
          {art ? <div className="wl-modal__glow" style={{ backgroundImage: `url(${art})` }} aria-hidden="true" /> : null}
          <button type="button" className="wl-modal__close" onClick={close} aria-label="Close" tabIndex={open ? 0 : -1}>
            <CloseIcon />
          </button>
          <span className="wl-modal__icon" aria-hidden="true">
            <MailIcon />
          </span>
          <h2 className="wl-h3" id="wl-modal-title">
            Get new songs first
          </h2>
          {/* Remount per opening so a finished signup doesn't stick around as "Done". */}
          {open ? <UpdatesForm key={source} source={source ?? "modal"} /> : null}
        </div>
      </div>
    </SignupContext.Provider>
  );
}

export function SignupButton({ source, label = "Get updates", className = "" }: { source: string; label?: string; className?: string }) {
  const open = useSignupModal();
  return (
    <button type="button" className={`wl-mailbtn ${className}`.trim()} onClick={() => open(source)}>
      <MailIcon />
      <span>{label}</span>
    </button>
  );
}

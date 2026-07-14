"use client";

import { useEffect, useRef, useState } from "react";
import { LOCAL_COMMAND_HELP } from "./config";
import { Icons } from "./TeslaIcons";
import type { TeslaSettings } from "./types";

type SettingsSheetProps = {
  open: boolean;
  settings: TeslaSettings;
  onClose: () => void;
  onSave: (settings: TeslaSettings) => void;
};

export function SettingsSheet({ open, settings, onClose, onSave }: SettingsSheetProps) {
  const [draft, setDraft] = useState(settings);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (open) setDraft(settings); }, [open, settings]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const update = <Key extends keyof TeslaSettings>(key: Key, value: TeslaSettings[Key]) => setDraft((current) => ({ ...current, [key]: value }));
  const toggles: Array<{ key: "speak" | "gpsFallback" | "keepAwake" | "haptics" | "demo"; title: string; note: string }> = [
    { key: "speak", title: "Speak answers", note: "Short audio confirmation while driving" },
    { key: "gpsFallback", title: "iPhone GPS fallback", note: "Use phone speed if car telemetry pauses" },
    { key: "keepAwake", title: "Keep screen awake", note: "Best when installed to the Home Screen" },
    { key: "haptics", title: "Voice haptics", note: "Vibrate when the wake phrase is heard" },
    { key: "demo", title: "Demo mode", note: "Show realistic preview data without connecting" },
  ];

  return (
    <div className="settings-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="settings-sheet-v2" role="dialog" aria-modal="true" aria-labelledby="drive-settings-title">
        <span className="sheet-grabber" />
        <header className="settings-title-row">
          <span><small>WALLERSTEDT DRIVE</small><h2 id="drive-settings-title">Settings</h2></span>
          <button ref={closeButtonRef} onClick={onClose} aria-label="Close settings"><Icons.Close /></button>
        </header>

        <div className="settings-section">
          <h3>Connection</h3>
          <label className="settings-field"><span>Existing connection token</span><input type="password" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="TESLA_CONNECT_SECRET" value={draft.token} onChange={(event) => update("token", event.target.value.trim())} /><small>Stored only in this iPhone browser and sent to your APIs as X-Aios-Token.</small></label>
          {draft.token && <a className="settings-link" href={`/api/i/${encodeURIComponent(draft.token)}/auth`}><span><strong>Reconnect existing Tesla account</strong><small>Uses the OAuth route already in this app</small></span><Icons.Chevron size={18} /></a>}
        </div>

        <div className="settings-section">
          <h3>Hands-free voice</h3>
          <div className="settings-two-column">
            <label className="settings-field"><span>Wake phrase</span><input value={draft.wakeWord} onChange={(event) => update("wakeWord", event.target.value)} /></label>
            <label className="settings-field"><span>Recognition language</span><select value={draft.language} onChange={(event) => update("language", event.target.value as TeslaSettings["language"])}><option value="en-US">English</option><option value="sv-SE">Swedish</option></select></label>
          </div>
          <label className="settings-field"><span>Optional OpenAI key</span><input type="password" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Uses Vercel OPENAI_API_KEY when blank" value={draft.openAiKey} onChange={(event) => update("openAiKey", event.target.value.trim())} /><small>Core commands are handled locally. The key is only used for open-ended questions.</small></label>
          <div className="command-examples">{LOCAL_COMMAND_HELP.map((command) => <span key={command}>“{command}”</span>)}</div>
        </div>

        <div className="settings-section">
          <h3>Driving display</h3>
          <label className="settings-field"><span>Dashboard refresh</span><select value={draft.refreshMs} onChange={(event) => update("refreshMs", Number(event.target.value) as TeslaSettings["refreshMs"])}><option value={1000}>Every second</option><option value={1500}>Every 1.5 seconds</option><option value={3000}>Every 3 seconds</option></select><small>This reads your own Postgres-backed API. It does not poll Tesla.</small></label>
          <div className="settings-toggles">{toggles.map((item) => <label key={item.key}><span><strong>{item.title}</strong><small>{item.note}</small></span><input type="checkbox" checked={draft[item.key]} onChange={(event) => update(item.key, event.target.checked)} /><i /></label>)}</div>
        </div>

        <div className="install-instructions">
          <span className="install-icon"><Icons.Drive size={25} /></span>
          <span><strong>Install on iPhone</strong><small>Open in Safari, tap Share, choose Add to Home Screen, then allow Location and Microphone. Tap Voice once each time iOS fully closes the app.</small></span>
        </div>
        <div className="read-only-note"><Icons.Shield size={16} /><span><strong>Read-only by design</strong><small>Remote lock, climate, trunk, and drive commands remain disabled until a signed Tesla command proxy and secure refresh-token storage exist.</small></span></div>
        <button className="save-settings" onClick={() => onSave(draft)}>Save and connect</button>
      </section>
    </div>
  );
}

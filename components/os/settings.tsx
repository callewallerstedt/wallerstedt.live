"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, MoonIcon, SunIcon } from "lucide-react";

import { useAccent, useOsTheme } from "@/components/os/providers";
import { Panel, Row } from "@/components/os/ui";
import { accentMeta, accents, type Accent } from "@/lib/accent";
import { osLiveShortcutUrl } from "@/lib/os/paths";
import { cn } from "@/lib/utils";

const ACCENT_SWATCHES: Record<Accent, [string, string]> = {
  ember: ["oklch(0.74 0.18 52)", "oklch(0.58 0.22 32)"],
  sun: ["oklch(0.86 0.16 92)", "oklch(0.7 0.18 58)"],
  ice: ["oklch(0.82 0.1 220)", "oklch(0.58 0.16 250)"],
};

function swatchStyle(id: Accent): React.CSSProperties {
  const [from, to] = ACCENT_SWATCHES[id];
  return { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` };
}

/**
 * Appearance controls used to sit in the header and the sidebar footer, where
 * they competed with the content. They are settings, so they live in Settings.
 */
export function AppearanceSettings() {
  const { accent, setAccent } = useAccent();
  const { theme, toggle } = useOsTheme();

  return (
    <Panel title="Appearance" footer="Saved in this browser only, per device.">
      <div className="border-t border-border px-3 py-3">
        <p className="text-sm font-medium">Theme</p>
        <div className="mt-2 flex gap-2">
          {(["dark", "light"] as const).map((option) => (
            <button
              key={option}
              aria-pressed={theme === option}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium ring-1 ring-foreground/15",
                theme === option ? "bg-brand-soft text-foreground ring-brand/40" : "text-muted-foreground",
              )}
              onClick={() => {
                if (theme !== option) toggle();
              }}
              type="button"
            >
              {option === "dark" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
              {option === "dark" ? "Dark" : "Light"}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border px-3 py-3">
        <p className="text-sm font-medium">Accent</p>
        <div className="mt-2 flex gap-2">
          {accents.map((id) => (
            <button
              key={id}
              aria-label={`${accentMeta[id].label} accent`}
              aria-pressed={accent === id}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium ring-1 ring-foreground/15",
                accent === id && "ring-2 ring-foreground",
              )}
              onClick={() => setAccent(id)}
              title={accentMeta[id].hint}
              type="button"
            >
              <span className="size-4 rounded-full" style={swatchStyle(id)} />
              <span className="truncate">{accentMeta[id].label}</span>
              {accent === id ? <CheckIcon className="size-4 shrink-0" /> : null}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export function LiveShortcut({ accessKey }: { accessKey: string }) {
  const [copied, setCopied] = useState(false);
  const url = osLiveShortcutUrl(accessKey);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Panel
      title="GPT-Live"
      footer="Paste this into an iPhone Shortcut Open URL action, or assign it to the Action Button."
    >
      <div className="border-t border-border px-3 py-3">
        <p className="text-sm font-medium">Live deep link</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Opens GPT-Live immediately, with the microphone.
        </p>
        <div className="mt-2 flex items-start gap-2">
          <p className="min-w-0 flex-1 break-all font-mono text-xs leading-snug">{url}</p>
          <button
            aria-label={copied ? "Live link copied" : "Copy Live link"}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-foreground/15",
              copied ? "text-brand" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => void copy()}
            type="button"
          >
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          </button>
        </div>
      </div>
    </Panel>
  );
}

export function SignOutRow({ accessKey }: { accessKey: string }) {
  async function signOut() {
    await fetch(`/api/accounting/${encodeURIComponent(accessKey)}/session/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => undefined);
    window.location.reload();
  }

  return (
    <Panel title="Session" footer="Signing out ends this browser's session on every tab.">
      <button className="w-full text-left" onClick={signOut} type="button">
        <Row primary="Sign out" secondary="You will need the password again" />
      </button>
    </Panel>
  );
}

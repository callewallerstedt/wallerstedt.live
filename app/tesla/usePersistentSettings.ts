"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, LEGACY_SETTINGS_KEYS, SETTINGS_KEY } from "./config";
import type { TeslaSettings } from "./types";

function loadSettings(): TeslaSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) as Partial<TeslaSettings> };

    const previous = localStorage.getItem(LEGACY_SETTINGS_KEYS[0]);
    const legacyToken = localStorage.getItem(LEGACY_SETTINGS_KEYS[1]) || "";
    if (previous) {
      const parsed = JSON.parse(previous) as Partial<TeslaSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed, token: parsed.token || legacyToken };
    }
    return { ...DEFAULT_SETTINGS, token: legacyToken };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function usePersistentSettings() {
  const [settings, setSettings] = useState<TeslaSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setHydrated(true);
  }, []);

  const saveSettings = useCallback((next: TeslaSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    if (next.token) localStorage.setItem(LEGACY_SETTINGS_KEYS[1], next.token);
    setSettings(next);
  }, []);

  return { settings, hydrated, saveSettings };
}

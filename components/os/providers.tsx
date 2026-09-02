"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { ACCENT_STORAGE_KEY, DEFAULT_ACCENT, isAccent, type Accent } from "@/lib/accent";

const ACCENT_EVENT = "calle-os-accent";
const THEME_KEY = "calle-os-theme";
const THEME_EVENT = "calle-os-theme";

function osRoot() {
  return document.querySelector<HTMLElement>(".os-root");
}

function subscribeAccent(onStoreChange: () => void) {
  window.addEventListener(ACCENT_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(ACCENT_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getAccentSnapshot(): Accent {
  const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
  return isAccent(stored) ? stored : DEFAULT_ACCENT;
}

function subscribeTheme(onStoreChange: () => void) {
  window.addEventListener(THEME_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getThemeSnapshot() {
  return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

const AccentContext = createContext<{
  accent: Accent;
  setAccent: (accent: Accent) => void;
}>({
  accent: DEFAULT_ACCENT,
  setAccent: () => undefined,
});

const ThemeContext = createContext<{
  theme: "dark" | "light";
  toggle: () => void;
}>({
  theme: "dark",
  toggle: () => undefined,
});

export function OsProviders({ children }: { children: ReactNode }) {
  const accent = useSyncExternalStore(subscribeAccent, getAccentSnapshot, () => DEFAULT_ACCENT);
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => "dark" as const);

  const setAccent = useCallback((next: Accent) => {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, next);
    const root = osRoot();
    if (root) root.dataset.accent = next;
    window.dispatchEvent(new Event(ACCENT_EVENT));
  }, []);

  const toggle = useCallback(() => {
    const next = getThemeSnapshot() === "dark" ? "light" : "dark";
    window.localStorage.setItem(THEME_KEY, next);
    const root = osRoot();
    if (root) root.classList.toggle("dark", next === "dark");
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  useEffect(() => {
    const root = osRoot();
    if (!root) return;
    root.dataset.accent = accent;
    root.classList.toggle("dark", theme === "dark");
  }, [accent, theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <AccentContext.Provider value={{ accent, setAccent }}>{children}</AccentContext.Provider>
    </ThemeContext.Provider>
  );
}

export function useAccent() {
  return useContext(AccentContext);
}

export function useOsTheme() {
  return useContext(ThemeContext);
}

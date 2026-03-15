"use client";

import { track } from "@vercel/analytics";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

interface AnalyticsPayload {
  type: "pageview" | "button_click";
  path: string;
  label?: string;
  href?: string;
  title?: string;
}

const dedupeWindowMs = 1500;
const trackingEndpoint = "/api/collect";
const trackedExternalLinkSelector = "a.button[href], a.platform-button[href]";

function shouldTrackPath(pathname: string) {
  return pathname !== "" && !pathname.startsWith("/admin") && !pathname.startsWith("/api");
}

function sendAnalytics(payload: AnalyticsPayload) {
  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(trackingEndpoint, blob);
    return;
  }

  void fetch(trackingEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    keepalive: true,
  });
}

function trackExternalButtonClick(path: string, label: string, href: string) {
  track("Button Click", {
    path,
    label,
    href,
  });
}

function shouldSkipDuplicatePageview(pathname: string) {
  try {
    const lastPayload = window.sessionStorage.getItem("wallerstedt:last-pageview");
    if (!lastPayload) {
      return false;
    }

    const lastEvent = JSON.parse(lastPayload) as { path?: string; at?: number };
    return lastEvent.path === pathname && Date.now() - Number(lastEvent.at ?? 0) < dedupeWindowMs;
  } catch {
    return false;
  }
}

function rememberPageview(pathname: string) {
  try {
    window.sessionStorage.setItem("wallerstedt:last-pageview", JSON.stringify({ path: pathname, at: Date.now() }));
  } catch {
    // Ignore storage issues; analytics should stay best-effort.
  }
}

export function AnalyticsTracker() {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (!shouldTrackPath(pathname) || shouldSkipDuplicatePageview(pathname)) {
      return;
    }

    rememberPageview(pathname);
    sendAnalytics({
      type: "pageview",
      path: pathname,
      title: document.title,
    });
  }, [pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!shouldTrackPath(pathname)) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const anchor = target.closest(trackedExternalLinkSelector);
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const href = anchor.getAttribute("href")?.trim();
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
        return;
      }

      let resolvedHref: URL;
      try {
        resolvedHref = new URL(href, window.location.origin);
      } catch {
        return;
      }

      const isExternal = resolvedHref.origin !== window.location.origin;
      if (!isExternal) {
        return;
      }

      const label = anchor.textContent?.replace(/\s+/g, " ").trim() || "Button";
      trackExternalButtonClick(pathname, label, resolvedHref.toString());
      sendAnalytics({
        type: "button_click",
        path: pathname,
        href: resolvedHref.toString(),
        label,
      });
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [pathname]);

  return null;
}

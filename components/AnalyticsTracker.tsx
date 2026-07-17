"use client";

import { track } from "@vercel/analytics";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const trackedExternalLinkSelector = "a.button[href], a.platform-button[href]";

function shouldTrackPath(pathname: string) {
  return (
    pathname !== "" &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/vault")
  );
}

function trackExternalButtonClick(path: string, label: string, href: string) {
  track("Button Click", {
    path,
    label,
    href,
  });
}

export function AnalyticsTracker() {
  const pathname = usePathname() ?? "";

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
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:")
      ) {
        return;
      }

      let resolvedHref: URL;
      try {
        resolvedHref = new URL(href, window.location.origin);
      } catch {
        return;
      }

      if (resolvedHref.origin === window.location.origin) {
        return;
      }

      const label = anchor.textContent?.replace(/\s+/g, " ").trim() || "Button";
      trackExternalButtonClick(pathname, label, resolvedHref.toString());
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [pathname]);

  return null;
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { OS_PAGES } from "@/components/os/sidebar";
import { routeHref } from "@/lib/os/href";
import { osPath } from "@/lib/os/paths";
import type { OsPageSlug } from "@/lib/os/route";

function idle(callback: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 400);
  return () => window.clearTimeout(id);
}

/**
 * After first paint, warm the tab RSC payloads and the heavy route chunks so
 * the next thumb tap does not wait on a cold server render or a big download.
 */
export function OsPrefetch({ accessKey }: { accessKey: string }) {
  const router = useRouter();

  useEffect(() => {
    return idle(() => {
      for (const page of OS_PAGES) {
        router.prefetch(routeHref(osPath(accessKey, page.slug as OsPageSlug)));
      }
      void import("@/components/os/tiktok-page");
      void import("@/components/os/money-page");
      void import("@/components/os/music-page");
      void import("@/components/os/settings-page");
      void import("@/components/os/vault");
    });
  }, [accessKey, router]);

  return null;
}

"use client";

import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";

/**
 * Financial routes deliberately opt out of Vercel Analytics so their secret
 * path, document names, and navigation never become analytics metadata.
 */
export function PrivacyAwareAnalytics() {
  const pathname = usePathname() ?? "";

  if (pathname.startsWith("/vault")) {
    return null;
  }

  return <Analytics />;
}

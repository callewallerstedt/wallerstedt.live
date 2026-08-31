"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const PRIVATE_PREFIXES = ["/tesla", "/vault", "/agent", "/admin"];

export function ServiceWorkerRegister() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return;
    }

    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  }, [pathname]);

  return null;
}

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { OsHeader, OsMobileMenu, OsSidebar } from "@/components/os/sidebar";
import { osPageFromPathname } from "@/lib/os/route";
import { cn } from "@/lib/utils";

const titles: Record<string, string> = {
  "": "Overview",
  vault: "Bokföring",
  money: "Money",
  music: "Music",
  content: "Content",
  projects: "Projects",
  customers: "Work",
  accounting: "Tax",
  investments: "Invest",
  wealth: "Wealth",
  upcoming: "Upcoming",
  alerts: "Alerts",
};

export function OsShell({
  accessKey,
  alertCount = 0,
  children,
}: {
  accessKey: string;
  alertCount?: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const slug = osPageFromPathname(pathname);
  const title = titles[slug] ?? "Overview";
  const vault = slug === "vault";

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="flex h-dvh max-w-full overflow-hidden bg-background text-foreground">
      <OsSidebar
        accessKey={accessKey}
        alertCount={alertCount}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
      />
      {menuOpen ? (
        <OsMobileMenu accessKey={accessKey} alertCount={alertCount} onClose={() => setMenuOpen(false)} />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <OsHeader
          collapsed={collapsed}
          menuOpen={menuOpen}
          onCollapsedChange={setCollapsed}
          onMenuToggle={() => setMenuOpen((open) => !open)}
          title={title}
        />
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1",
            vault ? "flex flex-col overflow-hidden" : "overflow-x-hidden overflow-y-auto",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

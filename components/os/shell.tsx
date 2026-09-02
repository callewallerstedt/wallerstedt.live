"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import { OsHeader, OsSidebar } from "@/components/os/sidebar";

const titles: Record<string, string> = {
  "": "Overview",
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
  alertCount,
  children,
}: {
  accessKey: string;
  alertCount: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const slug = parts[0] === "os" ? (parts[2] ?? "") : "";
  const title = titles[slug] ?? "Overview";

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <OsSidebar
        accessKey={accessKey}
        alertCount={alertCount}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <OsHeader collapsed={collapsed} onCollapsedChange={setCollapsed} title={title} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

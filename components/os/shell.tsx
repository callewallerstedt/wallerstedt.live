"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { OsHeader, OsSidebar, OsTabBar } from "@/components/os/sidebar";
import { osPageFromPathname } from "@/lib/os/route";
import { cn } from "@/lib/utils";

const SIDEBAR_KEY = "calle-os-sidebar-collapsed";

export function OsShell({
  accessKey,
  taskCount = 0,
  children,
}: {
  accessKey: string;
  taskCount?: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const vault = osPageFromPathname(pathname) === "vault";

  // The sidebar state is a per-device preference, so it lives in the browser.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "1");
  }, []);

  function changeCollapsed(next: boolean) {
    setCollapsed(next);
    window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
  }

  return (
    <div className="flex h-dvh max-w-full overflow-hidden bg-background text-foreground">
      <OsSidebar
        accessKey={accessKey}
        collapsed={collapsed}
        onCollapsedChange={changeCollapsed}
        taskCount={taskCount}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <OsHeader collapsed={collapsed} onCollapsedChange={changeCollapsed} />
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1",
            vault ? "flex flex-col overflow-hidden" : "overflow-x-hidden overflow-y-auto",
          )}
        >
          {children}
        </div>
      </div>
      <OsTabBar accessKey={accessKey} taskCount={taskCount} />
    </div>
  );
}

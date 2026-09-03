"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LandmarkIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  MusicIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  Settings2Icon,
  WalletIcon,
} from "lucide-react";

import { OsBrandLockup, OsBrandMark } from "@/components/os/brand";
import { CompanyMenu, type CompanyField } from "@/components/os/company-menu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { routeHref } from "@/lib/os/href";
import { osPath } from "@/lib/os/paths";
import type { OsPageSlug } from "@/lib/os/route";
import { zIndex } from "@/lib/z-index";
import { cn } from "@/lib/utils";

/**
 * Six tabs, in the order the owner actually works: look at the numbers, deal
 * with the list, then go into a specific area.
 */
export const OS_PAGES = [
  { slug: "" as const, label: "Overview", short: "Home", icon: LayoutDashboardIcon },
  { slug: "tasks" as const, label: "Tasks", short: "Tasks", icon: ListChecksIcon },
  { slug: "vault" as const, label: "Bokföring", short: "Books", icon: LandmarkIcon },
  { slug: "money" as const, label: "Money", short: "Money", icon: WalletIcon },
  { slug: "music" as const, label: "Music", short: "Music", icon: MusicIcon },
  { slug: "settings" as const, label: "Settings", short: "Settings", icon: Settings2Icon },
];

export const OS_PAGE_TITLES: Record<string, string> = Object.fromEntries(
  OS_PAGES.map((page) => [page.slug, page.label]),
);

function navActive(pathname: string, href: string, slug: string) {
  if (slug === "") return pathname === href || pathname === `${href}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function OsSidebar({
  accessKey,
  collapsed,
  onCollapsedChange,
  taskCount,
}: {
  accessKey: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  taskCount: number;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out md:flex",
        collapsed ? "w-[3.75rem]" : "w-56",
      )}
    >
      <div className={cn("flex h-14 items-center gap-2 px-3", collapsed && "justify-center px-0")}>
        {collapsed ? (
          <button
            aria-label="Expand sidebar"
            className="rounded-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onCollapsedChange(false)}
            title="Expand sidebar"
            type="button"
          >
            <OsBrandMark size={32} />
          </button>
        ) : (
          <OsBrandLockup />
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
        {OS_PAGES.map((item) => {
          const href = osPath(accessKey, item.slug as OsPageSlug);
          const Icon = item.icon;
          const active = navActive(pathname, href, item.slug);
          return (
            <Link
              key={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "justify-center px-0",
                active && "bg-brand-soft text-foreground ring-1 ring-brand/40",
              )}
              href={routeHref(href)}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={cn("size-[1.15rem] shrink-0", active && "text-brand")} />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
              {item.slug === "tasks" && taskCount > 0 && !collapsed ? (
                <span className="ml-auto rounded-full bg-brand-soft px-1.5 text-xs font-semibold tabular-nums text-brand">
                  {taskCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className={cn("flex flex-col gap-2 px-2 pb-3", collapsed && "items-center")}>
        <Separator />
        <Button
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn("justify-start text-muted-foreground", collapsed && "justify-center")}
          onClick={() => onCollapsedChange(!collapsed)}
          size={collapsed ? "icon-sm" : "sm"}
          variant="ghost"
        >
          {collapsed ? <PanelLeftOpenIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
          {!collapsed ? "Collapse" : null}
        </Button>
      </div>
    </aside>
  );
}

/**
 * The phone navigation. A fixed tab bar beats a hamburger here: every tab is
 * one thumb tap away and the current one is always visible.
 */
export function OsTabBar({ accessKey, taskCount }: { accessKey: string; taskCount: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 border-t border-sidebar-border bg-sidebar/95 backdrop-blur md:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        zIndex: zIndex.sticky,
      }}
    >
      <div className="flex items-stretch">
        {OS_PAGES.map((item) => {
          const href = osPath(accessKey, item.slug as OsPageSlug);
          const Icon = item.icon;
          const active = navActive(pathname, href, item.slug);
          return (
            <Link
              key={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-[3.5rem] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 px-0.5 text-[0.65rem] font-medium",
                active ? "text-brand" : "text-muted-foreground",
              )}
              href={routeHref(href)}
            >
              <span className="relative">
                <Icon className="size-[1.3rem]" />
                {item.slug === "tasks" && taskCount > 0 ? (
                  <span className="absolute -right-1.5 -top-1 size-2 rounded-full bg-brand-gradient" />
                ) : null}
              </span>
              <span className="max-w-full truncate">{item.short}</span>
              {active ? (
                <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-brand-gradient" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Nothing but the logo, which opens the company card. */
export function OsHeader({
  collapsed,
  companyFields,
  onCollapsedChange,
}: {
  collapsed: boolean;
  companyFields: CompanyField[];
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  return (
    <header
      className="relative flex shrink-0 items-center border-b border-border bg-background px-2 md:h-11"
      style={{
        minHeight: "calc(2.75rem + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
        zIndex: zIndex.sticky,
      }}
    >
      <Button
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden md:inline-flex"
        onClick={() => onCollapsedChange(!collapsed)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
      </Button>
      <div className="absolute left-1/2 -translate-x-1/2">
        <CompanyMenu fields={companyFields} />
      </div>
    </header>
  );
}

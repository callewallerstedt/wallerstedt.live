"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangleIcon,
  BriefcaseIcon,
  CalendarIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  LineChartIcon,
  MenuIcon,
  MusicIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ReceiptTextIcon,
  SunIcon,
  MoonIcon,
  VideoIcon,
  WalletIcon,
  FolderKanbanIcon,
  PiggyBankIcon,
  XIcon,
} from "lucide-react";

import { OsBrandLockup, OsBrandMark } from "@/components/os/brand";
import { useAccent, useOsTheme } from "@/components/os/providers";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { accentMeta, accents, type Accent } from "@/lib/accent";
import { routeHref } from "@/lib/os/href";
import { osPath } from "@/lib/os/paths";
import { osPageFromPathname, type OsPageSlug } from "@/lib/os/route";
import { zIndex } from "@/lib/z-index";
import { cn } from "@/lib/utils";

const pages = [
  { slug: "" as const, label: "Overview", icon: LayoutDashboardIcon },
  { slug: "vault" as const, label: "Bokföring", icon: LandmarkIcon },
  { slug: "money" as const, label: "Money", icon: WalletIcon },
  { slug: "music" as const, label: "Music", icon: MusicIcon },
  { slug: "content" as const, label: "Content", icon: VideoIcon },
  { slug: "projects" as const, label: "Projects", icon: FolderKanbanIcon },
  { slug: "customers" as const, label: "Work", icon: BriefcaseIcon },
  { slug: "accounting" as const, label: "Tax", icon: ReceiptTextIcon },
  { slug: "investments" as const, label: "Invest", icon: LineChartIcon },
  { slug: "wealth" as const, label: "Wealth", icon: PiggyBankIcon },
  { slug: "upcoming" as const, label: "Upcoming", icon: CalendarIcon },
  { slug: "alerts" as const, label: "Alerts", icon: AlertTriangleIcon },
];

function pageHref(accessKey: string, slug: OsPageSlug) {
  return osPath(accessKey, slug);
}

function navActive(pathname: string, href: string, slug: string) {
  if (slug === "") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function OsSidebar({
  accessKey,
  collapsed,
  onCollapsedChange,
  alertCount,
}: {
  accessKey: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  alertCount: number;
}) {
  const pathname = usePathname();
  const { accent, setAccent } = useAccent();

  return (
    <aside
      className={cn(
        "hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out md:flex",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className={cn("flex h-12 items-center gap-2 px-2.5", collapsed && "justify-center")}>
        {collapsed ? (
          <button
            type="button"
            aria-label="Expand sidebar"
            title="Expand sidebar"
            onClick={() => onCollapsedChange(false)}
            className="rounded-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <OsBrandMark size={32} />
          </button>
        ) : (
          <OsBrandLockup />
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 py-1">
        {pages.map((item) => {
          const href = pageHref(accessKey, item.slug);
          const Icon = item.icon;
          const active = navActive(pathname, href, item.slug);
          return (
            <Link
              key={item.label}
              href={routeHref(href)}
              title={collapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "justify-center px-0",
                active && "bg-brand-soft text-foreground ring-1 ring-brand/40",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-brand" : "text-muted-foreground")} />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
              {item.slug === "alerts" && alertCount > 0 && !collapsed ? (
                <span className="ml-auto size-1.5 rounded-full bg-brand-gradient" />
              ) : null}
              {active && collapsed ? <span className="sr-only">Current</span> : null}
              {active && !collapsed ? (
                <span className="ml-auto size-1.5 rounded-full bg-brand-gradient" aria-hidden />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className={cn("flex flex-col gap-1 px-1.5 pb-2", collapsed && "items-center")}>
        <AccentSwatches accent={accent} collapsed={collapsed} onAccentChange={setAccent} />
        <Separator className="my-1" />
        <Button
          variant={collapsed ? "outline" : "ghost"}
          size={collapsed ? "icon-sm" : "sm"}
          className={cn("justify-start text-muted-foreground", collapsed && "justify-center")}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          {collapsed ? <PanelLeftOpenIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
          {!collapsed ? "Collapse" : null}
        </Button>
      </div>
    </aside>
  );
}

export function OsMobileMenu({
  accessKey,
  alertCount,
  onClose,
}: {
  accessKey: string;
  alertCount: number;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { accent, setAccent } = useAccent();

  return (
    <div
      aria-label="Menu"
      aria-modal="true"
      className="fixed inset-0 flex flex-col bg-sidebar text-sidebar-foreground md:hidden"
      role="dialog"
      style={{ zIndex: zIndex.overlay }}
    >
      <div
        className="flex shrink-0 items-center gap-2 border-b border-sidebar-border px-3 pb-2"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <OsBrandLockup />
        <Button
          aria-label="Close menu"
          className="ml-auto size-11 touch-manipulation"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-6" />
        </Button>
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {pages.map((item) => {
          const href = pageHref(accessKey, item.slug);
          const Icon = item.icon;
          const active = navActive(pathname, href, item.slug);
          return (
            <Link
              key={item.label}
              href={routeHref(href)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 touch-manipulation items-center gap-3 rounded-xl px-3 text-base font-medium text-muted-foreground",
                active && "bg-brand-soft text-foreground ring-1 ring-brand/40",
              )}
              onClick={onClose}
            >
              <Icon className={cn("size-5 shrink-0", active ? "text-brand" : "text-muted-foreground")} />
              <span className="truncate">{item.label}</span>
              {item.slug === "alerts" && alertCount > 0 ? (
                <span className="ml-auto size-2 rounded-full bg-brand-gradient" />
              ) : null}
            </Link>
          );
        })}

        <div className="mt-auto flex flex-col gap-3 px-3 pt-4">
          <p className="text-xs font-medium text-muted-foreground">Accent</p>
          <AccentSwatches accent={accent} collapsed={false} large onAccentChange={setAccent} />
        </div>
      </nav>
    </div>
  );
}

function AccentSwatches({
  accent,
  collapsed,
  large = false,
  onAccentChange,
}: {
  accent: Accent;
  collapsed: boolean;
  large?: boolean;
  onAccentChange: (accent: Accent) => void;
}) {
  return (
    <div className={cn("flex gap-1", collapsed ? "flex-col" : "px-1", large && "gap-3 px-0")}>
      {accents.map((id) => (
        <button
          key={id}
          type="button"
          aria-label={`${accentMeta[id].label} accent`}
          aria-pressed={accent === id}
          title={accentMeta[id].hint}
          onClick={() => onAccentChange(id)}
          className={cn(
            "size-5 rounded-lg bg-brand-gradient ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring",
            accent === id && "ring-2 ring-foreground",
            collapsed && "size-4",
            large && "size-8",
          )}
          style={swatchStyle(id)}
        />
      ))}
    </div>
  );
}

function swatchStyle(id: Accent): React.CSSProperties {
  const map: Record<Accent, [string, string]> = {
    ember: ["oklch(0.74 0.18 52)", "oklch(0.58 0.22 32)"],
    sun: ["oklch(0.86 0.16 92)", "oklch(0.7 0.18 58)"],
    ice: ["oklch(0.82 0.1 220)", "oklch(0.58 0.16 250)"],
  };
  const [from, to] = map[id];
  return { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` };
}

export function OsHeader({
  collapsed,
  menuOpen,
  onCollapsedChange,
  onMenuToggle,
  title,
}: {
  collapsed: boolean;
  menuOpen: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onMenuToggle: () => void;
  title: string;
}) {
  const { theme, toggle } = useOsTheme();
  return (
    <header
      className="flex shrink-0 items-center gap-2 border-b border-border px-2 md:h-12"
      style={{
        minHeight: "calc(3.5rem + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
        zIndex: zIndex.sticky,
      }}
    >
      <Button
        aria-expanded={menuOpen}
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        className="size-11 touch-manipulation md:hidden"
        onClick={onMenuToggle}
        size="icon"
        type="button"
        variant="ghost"
      >
        {menuOpen ? <XIcon className="size-6" /> : <MenuIcon className="size-6" />}
      </Button>
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
      <OsBrandMark className="md:hidden" size={32} />
      <p className="min-w-0 truncate text-sm font-semibold">{title}</p>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          aria-label="Toggle color theme"
          className="size-11 touch-manipulation md:size-7"
          onClick={toggle}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </Button>
      </div>
    </header>
  );
}

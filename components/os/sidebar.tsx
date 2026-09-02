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
} from "lucide-react";

import { accentMeta, accents, type Accent } from "@/lib/accent";
import { routeHref } from "@/lib/os/href";
import { osPath, vaultPath } from "@/lib/os/paths";
import { cn } from "@/lib/utils";
import { useAccent, useOsTheme } from "@/components/os/providers";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const pages = [
  { slug: "", label: "Overview", icon: LayoutDashboardIcon },
  { slug: "money", label: "Money", icon: WalletIcon },
  { slug: "music", label: "Music", icon: MusicIcon },
  { slug: "content", label: "Content", icon: VideoIcon },
  { slug: "projects", label: "Projects", icon: FolderKanbanIcon },
  { slug: "customers", label: "Work", icon: BriefcaseIcon },
  { slug: "accounting", label: "Tax", icon: ReceiptTextIcon },
  { slug: "investments", label: "Invest", icon: LineChartIcon },
  { slug: "wealth", label: "Wealth", icon: PiggyBankIcon },
  { slug: "upcoming", label: "Upcoming", icon: CalendarIcon },
  { slug: "alerts", label: "Alerts", icon: AlertTriangleIcon },
] as const;

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
  const base = osPath(accessKey);

  return (
    <aside
      className={cn(
        "flex h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out",
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
            className="flex size-7 items-center justify-center rounded-lg bg-brand-gradient text-[11px] font-semibold text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            C
          </button>
        ) : (
          <>
            <span className="flex size-7 items-center justify-center rounded-lg bg-brand-gradient text-[11px] font-semibold text-brand-foreground">
              C
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-none">Calle</p>
            </div>
          </>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 py-1">
        {pages.map((item) => {
          const href = item.slug ? `${base}/${item.slug}` : base;
          const Icon = item.icon;
          const active = item.slug === "" ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
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
        {!collapsed ? (
          <Link
            href={routeHref(vaultPath(accessKey))}
            className="flex h-8 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LandmarkIcon className="size-4" />
            Vault
          </Link>
        ) : (
          <Link
            href={routeHref(vaultPath(accessKey))}
            aria-label="Bokföring vault"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LandmarkIcon className="size-4" />
          </Link>
        )}
        <div className={cn("flex gap-1", collapsed ? "flex-col" : "px-1")}>
          {accents.map((id) => (
            <button
              key={id}
              type="button"
              aria-label={`${accentMeta[id].label} accent`}
              aria-pressed={accent === id}
              title={accentMeta[id].hint}
              onClick={() => setAccent(id)}
              className={cn(
                "size-5 rounded-lg bg-brand-gradient ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring",
                accent === id && "ring-2 ring-foreground",
                collapsed && "size-4",
              )}
              style={swatchStyle(id)}
            />
          ))}
        </div>
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
  onCollapsedChange,
  title,
}: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  title: string;
}) {
  const { theme, toggle } = useOsTheme();
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={() => onCollapsedChange(!collapsed)}
      >
        {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
      </Button>
      <p className="text-sm font-semibold">{title}</p>
      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="outline" size="icon-sm" aria-label="Toggle color theme" onClick={toggle}>
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </Button>
      </div>
    </header>
  );
}

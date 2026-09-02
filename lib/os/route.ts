export function configuredOsAccessKey() {
  return process.env.ACCOUNTING_ACCESS_KEY?.trim() ?? "";
}

export const OS_PAGE_SLUGS = [
  "tasks",
  "vault",
  "money",
  "music",
  "projects",
] as const;

/**
 * Pages that used to have their own tab. They still resolve so old links,
 * bookmarks and the iOS home-screen shortcut do not 404 after the merge.
 */
export const OS_LEGACY_REDIRECTS: Record<string, (typeof OS_PAGE_SLUGS)[number] | ""> = {
  content: "music",
  customers: "money",
  accounting: "money",
  investments: "money",
  wealth: "money",
  upcoming: "tasks",
  alerts: "tasks",
};

export type OsPageSlug = (typeof OS_PAGE_SLUGS)[number] | "";

const PAGE_SET = new Set<string>(OS_PAGE_SLUGS);

export function isOsPageSlug(value: string): value is Exclude<OsPageSlug, ""> {
  return PAGE_SET.has(value);
}

export function osPageFromPathname(pathname: string): OsPageSlug {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "bolag" && parts[0] !== "os") return "";
  const rest = parts.slice(1);
  if (rest.length < 2) return "";
  if (isOsPageSlug(rest[1])) return rest[1];
  return "";
}

/**
 * A retired slug maps to the tab that absorbed it, so old bookmarks land on the
 * page that now holds that content instead of a 404.
 */
export function osLegacyTarget(page: string[] | undefined): OsPageSlug | null {
  const parts = (page ?? []).filter(Boolean);
  if (parts.length !== 1) return null;
  const target = OS_LEGACY_REDIRECTS[parts[0]!];
  return target === undefined ? null : target;
}

export function resolveOsRoute(
  accessKey: string | undefined,
  page: string[] | undefined,
): { accessKey: string; page: OsPageSlug } | null {
  const key = accessKey?.trim() ?? "";
  if (!key) return null;
  const parts = (page ?? []).filter(Boolean);
  if (parts.length === 0) return { accessKey: key, page: "" };
  if (parts.length === 1 && isOsPageSlug(parts[0])) {
    return { accessKey: key, page: parts[0] };
  }
  return null;
}

export function configuredOsAccessKey() {
  return process.env.ACCOUNTING_ACCESS_KEY?.trim() ?? "";
}

export const OS_PAGE_SLUGS = [
  "money",
  "music",
  "content",
  "projects",
  "customers",
  "accounting",
  "investments",
  "wealth",
  "upcoming",
  "alerts",
] as const;

export type OsPageSlug = (typeof OS_PAGE_SLUGS)[number] | "";

const PAGE_SET = new Set<string>(OS_PAGE_SLUGS);

export function isOsPageSlug(value: string): value is Exclude<OsPageSlug, ""> {
  return PAGE_SET.has(value);
}

export function osPageFromPathname(pathname: string): OsPageSlug {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "bolag" && parts[0] !== "os") return "";
  const rest = parts.slice(1);
  if (rest.length === 0) return "";
  if (isOsPageSlug(rest[0])) return rest[0];
  if (rest[1] && isOsPageSlug(rest[1])) return rest[1];
  return "";
}

export function resolveOsRoute(
  slug: string[] | undefined,
  configuredAccessKey: string,
): { accessKey: string; page: OsPageSlug; keyedAlias: boolean } | null {
  const parts = (slug ?? []).filter(Boolean);
  if (parts.length === 0) {
    return { accessKey: configuredAccessKey, page: "", keyedAlias: false };
  }
  if (parts.length === 1 && isOsPageSlug(parts[0])) {
    return { accessKey: configuredAccessKey, page: parts[0], keyedAlias: false };
  }
  if (parts.length === 1) {
    return { accessKey: parts[0], page: "", keyedAlias: true };
  }
  if (parts.length === 2 && isOsPageSlug(parts[1])) {
    return { accessKey: parts[0], page: parts[1], keyedAlias: true };
  }
  return null;
}

export function configuredOsAccessKey() {
  return process.env.ACCOUNTING_ACCESS_KEY?.trim() ?? "";
}

export const OS_PAGE_SLUGS = [
  "vault",
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
  if (rest.length < 2) return "";
  if (isOsPageSlug(rest[1])) return rest[1];
  return "";
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

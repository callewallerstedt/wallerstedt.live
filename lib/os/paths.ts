import type { OsPageSlug } from "./route";

export function vaultPath(accessKey: string, query = "") {
  return `/vault/${encodeURIComponent(accessKey)}${query}`;
}

export function osPath(page: OsPageSlug = "") {
  return page ? `/bolag/${page}` : "/bolag";
}
